import { useEffect, useState } from 'react';
import {
  Screen,
  ScreenHeader,
  StickyFooter,
  Card,
  StatTile,
  SectionLabel,
  Chip,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
} from '../../ui/primitives';
import { IconPlus, IconList, IconCheck } from '../../ui/icons';
import { useFormFactor } from '../../hooks/useFormFactor';
import { getProtokollgruppe, getProtokolleByGruppe, getElemente } from '../../db';
import type { ProtokollMitGruppe } from '../../db';
import type { Protokollgruppe } from '../../types';

// Status-Codes, die als "erledigt" fuer den Fortschrittsbalken zaehlen
// (17 Erledigt-Info, 20 Erledigt, 25 Mangel-beseitigt).
const ERLEDIGT = new Set<number>([17, 20, 25]);

/** Fortschritts-Kennzahl je Protokoll (aus dessen Elementen abgeleitet). */
interface Fortschritt {
  done: number;
  total: number;
}

interface GruppeDetailProps {
  gruppeId: string;
  onBack: () => void;
  onOpenBrowser: (gruppeId: string) => void; // „Protokollpunkte"
  onNeuesProtokoll: (gruppeId: string) => void; // „Neues Protokoll"
  onProtokollBearbeiten: (gruppeId: string, protokollId: string) => void; // „Letztes Protokoll bearbeiten" / Zeilenklick
}

/** ISO-Datum → deutsches Kurzformat TT.MM.JJJJ (leer/ungueltig bleibt roh). */
function formatDatum(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Themen-String (per „;" oder Zeilenumbruch getrennt) → getrimmte, leere entfernte Liste. */
function parseThemen(themen: string | undefined): string[] {
  if (!themen) return [];
  return themen
    .split(/[;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function GruppeDetail({
  gruppeId,
  onBack,
  onOpenBrowser,
  onNeuesProtokoll,
  onProtokollBearbeiten,
}: GruppeDetailProps) {
  const ff = useFormFactor();
  const [loading, setLoading] = useState(true);
  const [gruppe, setGruppe] = useState<Protokollgruppe | undefined>(undefined);
  const [protokolle, setProtokolle] = useState<ProtokollMitGruppe[]>([]);
  const [fortschritt, setFortschritt] = useState<Record<string, Fortschritt>>({});

  useEffect(() => {
    let aktiv = true;
    setLoading(true);
    (async () => {
      const g = await getProtokollgruppe(gruppeId);
      const prots = await getProtokolleByGruppe(gruppeId);
      // Neueste zuerst: absteigend nach Protokoll-Nummer (hoechste = aktuell/nicht verschickt).
      prots.sort((a, b) => b.nummer - a.nummer);
      // Fortschritt je Protokoll aus dessen Elementen ableiten.
      const fort: Record<string, Fortschritt> = {};
      await Promise.all(
        prots.map(async (p) => {
          const els = await getElemente(p.id);
          const done = els.filter((e) => ERLEDIGT.has(e.status)).length;
          fort[p.id] = { done, total: els.length };
        }),
      );
      if (!aktiv) return;
      setGruppe(g);
      setProtokolle(prots);
      setFortschritt(fort);
      setLoading(false);
    })().catch(() => {
      if (aktiv) setLoading(false);
    });
    return () => {
      aktiv = false;
    };
  }, [gruppeId]);

  // Ladezustand: schlankes Geruest mit Zurueck-Moeglichkeit.
  if (loading) {
    return (
      <Screen header={<ScreenHeader title="Protokollgruppe" onBack={onBack} />}>
        <EmptyState title="Lädt…" hint="Protokolle werden geladen." />
      </Screen>
    );
  }

  // Nicht gefunden (z.B. geloescht).
  if (!gruppe) {
    return (
      <Screen header={<ScreenHeader title="Protokollgruppe" onBack={onBack} />}>
        <EmptyState
          title="Protokollgruppe nicht gefunden"
          hint="Sie wurde möglicherweise gelöscht oder ist noch nicht synchronisiert."
        />
      </Screen>
    );
  }

  const themen = parseThemen(gruppe.themen);
  // Aktuelles Protokoll = hoechste Nummer = erstes Element nach absteigender Sortierung.
  const aktuellesProtokoll = protokolle[0];
  const zweiSpalten = ff.orientation === 'quer';
  const projektZeile = [gruppe.projekt_name, gruppe.projekt_nummer].filter(Boolean).join(' · ');

  const header = (
    <ScreenHeader
      onBack={onBack}
      backLabel={gruppe.projekt_name || 'Zurück'}
      subtitle={projektZeile}
      title={
        <span className="block">
          {/* kleines Label „PROTOKOLLGRUPPE" ueber dem Titel */}
          <span
            className="text-ping-blue-light"
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            Protokollgruppe
          </span>
          <span className="block truncate leading-tight">
            {gruppe.name}{' '}
            <span style={{ fontSize: '14px', fontWeight: 500, opacity: 0.75 }}>(Protokollgruppe)</span>
          </span>
        </span>
      }
      right={
        <button
          type="button"
          onClick={() => onOpenBrowser(gruppeId)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-white/90 px-3 py-2 text-[12.5px] font-semibold text-ping-blue transition hover:bg-white"
        >
          <IconList size={15} />
          <span className="hidden sm:inline">Protokollpunkte</span>
        </button>
      }
    />
  );

  const footer = (
    <StickyFooter>
      {aktuellesProtokoll && (
        <SecondaryButton onClick={() => onProtokollBearbeiten(gruppeId, aktuellesProtokoll.id)}>
          Letztes Protokoll bearbeiten
        </SecondaryButton>
      )}
      <PrimaryButton onClick={() => onNeuesProtokoll(gruppeId)}>
        <IconPlus size={16} /> Neues Protokoll
      </PrimaryButton>
    </StickyFooter>
  );

  // Linke Spalte: Meta-Karte + „Aktuelles Protokoll bearbeiten".
  const metaSpalte = (
    <div className="flex min-w-0 flex-col gap-3">
      <Card className="p-4">
        {/* Stat-Kacheln */}
        <div className="flex gap-3">
          <div className="flex-1">
            <StatTile value={protokolle.length} label="Protokolle" tone="blue" />
          </div>
          <div className="flex-1">
            <StatTile value={themen.length} label="Themen" tone="blue" />
          </div>
        </div>

        {/* Vorwort (mehrzeilig) */}
        {gruppe.vorwort && (
          <div className="mt-4">
            <SectionLabel>Vorwort</SectionLabel>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ping-text">{gruppe.vorwort}</p>
          </div>
        )}

        {/* Themen — nur Anzeige */}
        {themen.length > 0 && (
          <div className="mt-4">
            <SectionLabel>Themen</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {themen.map((t, i) => (
                <Chip key={`${t}-${i}`}>{t}</Chip>
              ))}
            </div>
          </div>
        )}

        {/* Ablage + Ersteller */}
        <div className="mt-4 flex items-center gap-2 border-t border-black/5 pt-3">
          {gruppe.projekt_stammverzeichnis && (
            <span className="min-w-0 truncate font-mono text-[11.5px] text-ping-text-mid">
              {gruppe.projekt_stammverzeichnis}
            </span>
          )}
          <span className="flex-1" />
          <span className="whitespace-nowrap text-[11.5px] text-ping-text-light">
            Ersteller {gruppe.created_by ?? '—'}
          </span>
        </div>
      </Card>

      {aktuellesProtokoll && (
        <SecondaryButton block onClick={() => onProtokollBearbeiten(gruppeId, aktuellesProtokoll.id)}>
          Aktuelles Protokoll bearbeiten
        </SecondaryButton>
      )}
    </div>
  );

  // Rechte Spalte: Protokoll-Liste rueckwaerts (neueste zuerst).
  const protokolleSpalte = (
    <div className="min-w-0">
      <SectionLabel>Protokolle</SectionLabel>
      {protokolle.length === 0 ? (
        <EmptyState title="Noch keine Protokolle" hint="Legen Sie das erste Protokoll dieser Gruppe an." />
      ) : (
        <Card className="overflow-hidden">
          {protokolle.map((p, idx) => {
            const f = fortschritt[p.id] ?? { done: 0, total: 0 };
            const pct = f.total > 0 ? Math.round((f.done / f.total) * 100) : 0;
            const barColor =
              pct === 100 ? '#16a34a' : pct >= 70 ? '#B9791E' : pct >= 40 ? '#d97706' : '#dc2626';
            // Nur das neueste (idx 0) gilt als „nicht verschickt".
            const verschickt = idx > 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onProtokollBearbeiten(gruppeId, p.id)}
                className="flex w-full items-center gap-3 border-b border-black/5 px-4 py-3 text-left transition last:border-b-0 hover:bg-black/5"
              >
                <span className="w-6 shrink-0 text-right text-[12px] font-bold tabular-nums text-ping-text-light">
                  {p.nummer > 0 ? p.nummer : '–'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ping-text">{p.name}</span>
                  <span className="block text-[11px] text-ping-text-light">{formatDatum(p.datum)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {/* Fortschrittsbalken (Anteil erledigter Elemente) */}
                  <span
                    className="h-[7px] w-14 overflow-hidden rounded-full"
                    style={{ background: '#e9edf2' }}
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${pct}%`, background: f.total > 0 ? barColor : '#e9edf2' }}
                    />
                  </span>
                  <span
                    className="w-11 text-right text-[11px] font-bold tabular-nums"
                    style={{ color: pct === 100 ? '#16a34a' : '#4b5563' }}
                  >
                    {f.total > 0 ? `${pct}%` : '—'}
                  </span>
                  {/* Versand-Badge */}
                  <span
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                    style={
                      verschickt
                        ? { background: '#EAFAF0', color: '#16803C' }
                        : { background: '#FBF1E2', color: '#8A5A14' }
                    }
                    title="Versandstatus"
                  >
                    {verschickt && <IconCheck size={11} />}
                    {verschickt ? 'verschickt' : 'nicht verschickt'}
                  </span>
                </span>
              </button>
            );
          })}
        </Card>
      )}
    </div>
  );

  return (
    <Screen header={header} footer={footer}>
      <div className="p-4">
        <div
          style={
            zweiSpalten
              ? { display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '16px', alignItems: 'start' }
              : { display: 'flex', flexDirection: 'column', gap: '16px' }
          }
        >
          {metaSpalte}
          {protokolleSpalte}
        </div>
      </div>
    </Screen>
  );
}
