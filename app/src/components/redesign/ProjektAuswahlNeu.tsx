import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Screen,
  ScreenHeader,
  Card,
  StatTile,
  SectionLabel,
  SearchInput,
  SegmentedControl,
  ProjektChip,
  EmptyState,
} from '../../ui/primitives';
import { IconList, IconCards, IconTiles, IconChevronRight, IconFolder } from '../../ui/icons';
import { useFormFactor } from '../../hooks/useFormFactor';
import { getAllGruppen, getProtokolleByGruppe } from '../../db';

// Redesign der Projektauswahl (Smartphone + Tablet) nach PING Protokoll Design System.
// Aggregiert Protokollgruppen zu "Projekten" (eindeutige projekt_nummer) und bietet
// drei Layouts: Liste (Akzentbalken), Karten (Stat-Kacheln) und Kacheln (kompaktes Raster).

interface ProjektAuswahlNeuProps {
  /** Auswahl eines Projekts -> Gruppenuebersicht des Projekts */
  onSelectProjekt: (projektNummer: string) => void;
  /** Zurueck zur vorherigen Ansicht */
  onBack: () => void;
}

/** Ein aggregiertes Projekt (eine Zeile je eindeutiger projekt_nummer). */
interface ProjektEintrag {
  projekt_nummer: string;
  projekt_name: string;
  /** Anzahl der Protokollgruppen dieses Projekts */
  gruppenCount: number;
  /** Summe der Protokolle ueber alle Gruppen dieses Projekts */
  protokolleCount: number;
}

type Layout = 'liste' | 'karten' | 'kacheln';

/** Laedt alle Gruppen und aggregiert sie zu Projekten (aufsteigend nach Nummer sortiert). */
async function ladeProjekte(): Promise<ProjektEintrag[]> {
  const gruppen = await getAllGruppen();
  const byNummer = new Map<string, ProjektEintrag>();

  for (const g of gruppen) {
    const nummer = g.projekt_nummer ?? '';
    const prots = await getProtokolleByGruppe(g.id);
    const vorhanden = byNummer.get(nummer);
    if (vorhanden) {
      vorhanden.gruppenCount += 1;
      vorhanden.protokolleCount += prots.length;
      // Ersten nicht-leeren Projektnamen uebernehmen
      if (!vorhanden.projekt_name && g.projekt_name) vorhanden.projekt_name = g.projekt_name;
    } else {
      byNummer.set(nummer, {
        projekt_nummer: nummer,
        projekt_name: g.projekt_name ?? '',
        gruppenCount: 1,
        protokolleCount: prots.length,
      });
    }
  }

  return Array.from(byNummer.values()).sort((a, b) =>
    a.projekt_nummer.localeCompare(b.projekt_nummer, 'de', { numeric: true }),
  );
}

export default function ProjektAuswahlNeu({ onSelectProjekt, onBack }: ProjektAuswahlNeuProps) {
  const { isTablet, orientation } = useFormFactor();
  const [projekte, setProjekte] = useState<ProjektEintrag[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [suche, setSuche] = useState('');
  const [layout, setLayout] = useState<Layout>('liste');

  useEffect(() => {
    let aktiv = true;
    void (async () => {
      const daten = await ladeProjekte();
      if (aktiv) {
        setProjekte(daten);
        setLaedt(false);
      }
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // Freitext-Filter: Suche nach Projektnummer und Name (wortweise, alle Woerter muessen passen).
  const gefiltert = useMemo(() => {
    const worte = suche.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!worte.length) return projekte;
    return projekte.filter((p) => {
      const hay = `${p.projekt_nummer} ${p.projekt_name}`.toLowerCase();
      return worte.every((w) => hay.includes(w));
    });
  }, [projekte, suche]);

  // Karten-Raster: nur auf Tablet im Querformat 2-spaltig, sonst 1-spaltig.
  const zweiSpaltig = isTablet && orientation === 'quer';

  const layoutOptionen: { value: Layout; icon: ReactNode }[] = [
    { value: 'liste', icon: <IconList size={16} /> },
    { value: 'karten', icon: <IconCards size={16} /> },
    { value: 'kacheln', icon: <IconTiles size={16} /> },
  ];

  const header = (
    <ScreenHeader
      title="Projektauswahl"
      subtitle="Projekt zum Öffnen auswählen"
      onBack={onBack}
      right={<SegmentedControl<Layout> options={layoutOptionen} value={layout} onChange={setLayout} />}
    >
      <SearchInput value={suche} onChange={setSuche} placeholder="Projektnummer oder Name …" onHeader />
    </ScreenHeader>
  );

  return (
    <Screen header={header}>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Meine Projekte</SectionLabel>
          {!laedt && (
            <span className="text-[12px] font-semibold text-ping-text-light">{gefiltert.length}</span>
          )}
        </div>

        {laedt ? (
          <p className="py-10 text-center text-[13px] text-ping-text-light">Projekte werden geladen …</p>
        ) : projekte.length === 0 ? (
          <EmptyState
            icon={<IconFolder size={40} />}
            title="Keine Projekte geladen"
            hint="Es sind noch keine Protokollgruppen vorhanden."
          />
        ) : gefiltert.length === 0 ? (
          <EmptyState
            icon={<IconFolder size={40} />}
            title="Keine Treffer"
            hint="Suche nach Projektnummer oder einem Wort aus dem Namen."
          />
        ) : layout === 'liste' ? (
          /* ---------- Layout: Liste (Akzentbalken links) ---------- */
          <div className="flex flex-col gap-2.5">
            {gefiltert.map((p) => (
              <Card
                key={p.projekt_nummer}
                onClick={() => onSelectProjekt(p.projekt_nummer)}
                className="overflow-hidden"
              >
                <div className="flex items-stretch">
                  {/* Blauer Akzentbalken */}
                  <span className="w-[5px] shrink-0 self-stretch bg-ping-blue" aria-hidden="true" />
                  <div className="min-w-0 flex-1 px-4 py-3">
                    <ProjektChip nummer={p.projekt_nummer || '—'} />
                    <div className="mt-1.5 truncate text-[15px] font-semibold text-ping-text">
                      {p.projekt_name || 'Ohne Namen'}
                    </div>
                    <div className="mt-1 text-[12px] text-ping-text-light">
                      {p.gruppenCount} Gruppen · {p.protokolleCount} Protokolle
                    </div>
                  </div>
                  <div className="flex items-center pr-3 text-ping-text-light">
                    <IconChevronRight size={18} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : layout === 'karten' ? (
          /* ---------- Layout: Karten (Stat-Kacheln) ---------- */
          <div className={`grid gap-3 ${zweiSpaltig ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {gefiltert.map((p) => (
              <Card
                key={p.projekt_nummer}
                onClick={() => onSelectProjekt(p.projekt_nummer)}
                className="p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <ProjektChip nummer={p.projekt_nummer || '—'} />
                  <IconChevronRight size={18} className="text-ping-text-light" />
                </div>
                <div className="mt-3 text-[17px] font-bold leading-tight text-ping-text">
                  {p.projekt_name || 'Ohne Namen'}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <StatTile value={p.gruppenCount} label="Gruppen" tone="blue" />
                  <StatTile value={p.protokolleCount} label="Protokolle" tone="neutral" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          /* ---------- Layout: Kacheln (kompaktes Raster) ---------- */
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
          >
            {gefiltert.map((p) => (
              <Card
                key={p.projekt_nummer}
                onClick={() => onSelectProjekt(p.projekt_nummer)}
                className="flex min-h-[132px] flex-col p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-bold tabular-nums text-ping-blue">
                    {p.projekt_nummer || '—'}
                  </span>
                </div>
                <div className="mt-2 flex-1 text-[14px] font-bold leading-snug text-ping-text line-clamp-3">
                  {p.projekt_name || 'Ohne Namen'}
                </div>
                <div className="mt-2.5 flex gap-4">
                  <div>
                    <span className="text-[15px] font-bold text-ping-blue">{p.gruppenCount}</span>
                    <span className="block text-[10.5px] text-ping-text-light">Gruppen</span>
                  </div>
                  <div>
                    <span className="text-[15px] font-bold text-ping-blue">{p.protokolleCount}</span>
                    <span className="block text-[10.5px] text-ping-text-light">Protok.</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}
