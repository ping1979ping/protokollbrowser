import { useEffect, useMemo, useState } from 'react';
import {
  Screen,
  ScreenHeader,
  StickyFooter,
  PrimaryButton,
  SearchInput,
  EmptyState,
  Card,
  ProjektChip,
} from '../../ui/primitives';
import { IconChevronDown, IconChevronRight, IconCheck, IconPlus, IconFolder } from '../../ui/icons';
import { aboStore, useAboState } from '../../store/aboStore';
import { getAllGruppen } from '../../db';
import type { Protokollgruppe } from '../../types';

interface AbonnierenScreenProps {
  onBack: () => void;
  onFertig: () => void; // „Fertig"/Übernehmen → zurück zur Startseite
}

/** Ein Projekt-Panel im Akkordeon: fasst alle Gruppen einer Projektnummer zusammen. */
interface ProjektPanel {
  nummer: string;
  name: string;
  gruppen: Protokollgruppe[];
}

/** Zählt die Themen einer Gruppe (Themen sind `;`- oder zeilengetrennt). */
function themenCount(themen: string): number {
  if (!themen) return 0;
  return themen
    .split(/[;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean).length;
}

export default function AbonnierenScreen({ onBack, onFertig }: AbonnierenScreenProps) {
  const [gruppen, setGruppen] = useState<Protokollgruppe[]>([]);
  const [loading, setLoading] = useState(true);
  const [suche, setSuche] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);

  // Reaktiver Abo-State: erzwingt Re-Render, sobald sich ein Abo ändert.
  const aboState = useAboState();

  // Alle Gruppen einmalig laden (nur lesend, keine Sync-/DB-Logik).
  useEffect(() => {
    let aktiv = true;
    (async () => {
      const alle = await getAllGruppen();
      if (!aktiv) return;
      setGruppen(alle);
      // Erstes Projekt standardmäßig aufklappen.
      const ersteNummer = alle
        .map((g) => g.projekt_nummer || '—')
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
      if (ersteNummer) setExpanded([ersteNummer]);
      setLoading(false);
    })();
    return () => {
      aktiv = false;
    };
  }, []);

  // Alle Gruppen-Ids — nötig, damit der Abo-Store die Default-Menge materialisieren kann.
  const allIds = useMemo(() => gruppen.map((g) => g.id), [gruppen]);

  // Gruppen zu aufklappbaren Projekt-Panels bündeln, aufsteigend nach Projektnummer.
  const projekte = useMemo<ProjektPanel[]>(() => {
    const map = new Map<string, ProjektPanel>();
    for (const g of gruppen) {
      const nummer = g.projekt_nummer || '—';
      let panel = map.get(nummer);
      if (!panel) {
        panel = { nummer, name: g.projekt_name || 'Ohne Projektname', gruppen: [] };
        map.set(nummer, panel);
      }
      panel.gruppen.push(g);
    }
    const list = Array.from(map.values());
    list.sort((a, b) => a.nummer.localeCompare(b.nummer, undefined, { numeric: true }));
    for (const p of list) {
      p.gruppen.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    }
    return list;
  }, [gruppen]);

  // Suche über Projektnummer/-name sowie Gruppenname/-nummer.
  const gefiltert = useMemo<ProjektPanel[]>(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return projekte;
    const ergebnis: ProjektPanel[] = [];
    for (const p of projekte) {
      const projektMatch = p.nummer.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
      if (projektMatch) {
        // Projekt selbst getroffen → alle Gruppen zeigen.
        ergebnis.push(p);
        continue;
      }
      const treffer = p.gruppen.filter(
        (g) => (g.name || '').toLowerCase().includes(q) || (g.projekt_nummer || '').toLowerCase().includes(q),
      );
      if (treffer.length) ergebnis.push({ ...p, gruppen: treffer });
    }
    return ergebnis;
  }, [projekte, suche]);

  // Bei aktiver Suche werden alle Treffer-Projekte aufgeklappt gezeigt.
  const istSuche = suche.trim().length > 0;
  const offeneNummern = useMemo<Set<string>>(
    () => (istSuche ? new Set(gefiltert.map((p) => p.nummer)) : new Set(expanded)),
    [istSuche, gefiltert, expanded],
  );

  // Gesamtzahl abonnierter Gruppen (subscribed === null ⇒ alle gelten als abonniert).
  const aboAnzahl =
    aboState.subscribed === null ? allIds.length : allIds.filter((id) => aboState.subscribed!.includes(id)).length;

  function toggleExpand(nummer: string) {
    setExpanded((ex) => (ex.includes(nummer) ? ex.filter((n) => n !== nummer) : [...ex, nummer]));
  }

  /** Ein einzelnes Gruppen-Abo umschalten. */
  function toggleGruppe(id: string) {
    aboStore.toggle(id, allIds);
  }

  /** Projekt-weiter Schalter: alle Gruppen an- oder abbestellen. */
  function toggleProjekt(panel: ProjektPanel) {
    const alleAbonniert = panel.gruppen.every((g) => aboStore.isSubscribed(g.id));
    for (const g of panel.gruppen) {
      if (alleAbonniert) aboStore.unsubscribe(g.id, allIds);
      else aboStore.subscribe(g.id, allIds);
    }
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="Protokoll abonnieren"
          subtitle="Projekt aufklappen und Gruppen mehrfach abonnieren"
          onBack={onBack}
          backLabel="Abonnements"
        >
          <SearchInput
            value={suche}
            onChange={setSuche}
            placeholder="Projektnummer, Projekt- oder Gruppenname …"
            onHeader
          />
        </ScreenHeader>
      }
      footer={
        <StickyFooter>
          <PrimaryButton block onClick={onFertig}>
            <IconCheck size={18} />
            Fertig · {aboAnzahl} abonniert
          </PrimaryButton>
        </StickyFooter>
      }
    >
      <div className="space-y-3 px-4 py-4">
        {/* Zustand: noch nichts geladen → keine Ausgabe (kein Flackern). */}
        {loading ? null : gruppen.length === 0 ? (
          <EmptyState
            icon={<IconFolder size={40} />}
            title="Noch keine Protokollgruppen"
            hint="Importiere zuerst Protokolle, um sie hier abonnieren zu können."
          />
        ) : gefiltert.length === 0 ? (
          <EmptyState
            icon={<IconFolder size={40} />}
            title="Kein Projekt gefunden"
            hint="Suche nach Projektnummer, Projektname oder Gruppenname."
          />
        ) : (
          gefiltert.map((panel) => {
            const offen = offeneNummern.has(panel.nummer);
            const abonniert = panel.gruppen.filter((g) => aboStore.isSubscribed(g.id)).length;
            const gesamt = panel.gruppen.length;
            const alleAbonniert = abonniert === gesamt && gesamt > 0;

            return (
              <Card key={panel.nummer} className="overflow-hidden">
                {/* Projekt-Kopf: Akkordeon-Schalter + projektweiter Abo-Toggle. */}
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleExpand(panel.nummer)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left"
                    aria-expanded={offen}
                  >
                    <span className="shrink-0 text-ping-text-light">
                      {offen ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <ProjektChip nummer={panel.nummer} />
                      <span className="mt-1 block truncate text-[15px] font-semibold text-ping-text">
                        {panel.name}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-ping-text-light">
                        {abonniert} / {gesamt} abonniert
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleProjekt(panel)}
                    title={alleAbonniert ? 'Alle Gruppen abbestellen' : 'Alle Gruppen abonnieren'}
                    className={`m-3 flex shrink-0 items-center gap-1 self-center rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold whitespace-nowrap ${
                      alleAbonniert ? 'bg-ping-blue-light text-ping-blue' : 'border border-black/10 bg-white text-ping-text-mid'
                    }`}
                  >
                    {alleAbonniert ? <IconCheck size={13} /> : <IconPlus size={13} className="text-ping-blue" />}
                    Alle
                  </button>
                </div>

                {/* Gruppen-Liste des Projekts (jede Zeile ist eine Abo-Checkbox). */}
                {offen && (
                  <div className="px-4 pb-1">
                    {panel.gruppen.map((g) => {
                      const sub = aboStore.isSubscribed(g.id);
                      const themen = themenCount(g.themen);
                      return (
                        <label
                          key={g.id}
                          className="flex cursor-pointer items-center gap-3 border-t border-black/5 py-3 first:border-t-0"
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={sub}
                            onChange={() => toggleGruppe(g.id)}
                            aria-label={`Protokollgruppe ${g.name} abonnieren`}
                          />
                          {/* Sichtbare Checkbox — visuell aus dem Abo-Status abgeleitet. */}
                          <span
                            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg"
                            style={{
                              background: sub ? 'var(--color-ping-blue)' : '#fff',
                              border: sub ? 'none' : '2px solid #cbd2dc',
                            }}
                          >
                            {sub && <IconCheck size={15} className="text-white" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold text-ping-text">{g.name}</span>
                            <span className="mt-0.5 block text-[11.5px] text-ping-text-light">
                              {themen > 0 ? `${themen} Themen` : 'Keine Themen'}
                              {g.protokollnummer > 0 ? ` · Protokoll ${g.protokollnummer}` : ''}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </Screen>
  );
}
