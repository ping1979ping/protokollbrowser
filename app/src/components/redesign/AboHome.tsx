import { useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';

import {
  Card,
  EmptyState,
  PrimaryButton,
  ProjektChip,
  Screen,
  ScreenHeader,
  SecondaryButton,
  SectionLabel,
  StatusDot,
  StickyFooter,
  Toast,
} from '../../ui/primitives';
import { IconBook, IconClock, IconDrag, IconPlus, IconSettings, IconSync } from '../../ui/icons';
import { aboStore, useAboState } from '../../store/aboStore';
import { useFormFactor } from '../../hooks/useFormFactor';
import { getAllGruppen, getElemente, getPendingChangesCount, getProtokolleByGruppe } from '../../db';
import type { Protokoll, Protokollgruppe } from '../../types';

/**
 * „Meine Protokolle" — Abo-Startseite des Redesigns.
 * Zeigt die abonnierten Protokollgruppen als Karten-Grid (auf dem Smartphone
 * einspaltig, auf dem Tablet mehrspaltig). Klick auf die Karte öffnet den
 * Browser (Gesamtansicht), Klick/Ziehen am Handle öffnet das Gruppen-Detail
 * bzw. sortiert die Karten. Frontend-only: der Sync-Button setzt nur den
 * lokalen Zeitstempel und die optischen „neu"-Punkte zurück.
 */

interface AboHomeProps {
  onOpenGruppeDetail: (gruppeId: string) => void; // Kebab-Klick auf Abo-Karte
  onOpenBrowser: (gruppeId: string) => void; // Klick auf Karte (Gesamtansicht)
  onAbonnieren: () => void; // Button „Protokoll abonnieren"
  onAlleProjekte: () => void; // Button „Alle Projekte"
  onSettings?: () => void;
}

/** Pro Gruppe asynchron ermittelte Kennzahlen (Punkte-Bilanz, Sync-Stand). */
interface AboKennzahlen {
  pending: number; // offene lokale Änderungen (getPendingChangesCount)
  protCount: number; // Anzahl Protokolle der Gruppe
  offen: number; // Punkte im neuesten Protokoll mit Status 10/11
  erledigt: number; // Punkte im neuesten Protokoll mit Status 17/20/25
  aktualisiert: string; // relative Zeit „vor …" aus updated_at/datum
}

/** Fertiges View-Model einer Abo-Karte (Stammdaten + Kennzahlen). */
interface AboKarteVM extends AboKennzahlen {
  id: string;
  projektNummer: string;
  projektName: string;
  gruppenName: string;
}

/** Relative deutsche Zeitangabe („gerade eben", „vor 3 Std." …) aus ISO-String. */
function relativeZeit(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sek = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sek < 60) return 'gerade eben';
  const min = Math.round(sek / 60);
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.round(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.round(std / 24);
  if (tage < 7) return `vor ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
  if (tage < 30) {
    const wochen = Math.round(tage / 7);
    return `vor ${wochen} ${wochen === 1 ? 'Woche' : 'Wochen'}`;
  }
  if (tage < 365) {
    const monate = Math.round(tage / 30);
    return `vor ${monate} ${monate === 1 ? 'Monat' : 'Monaten'}`;
  }
  const jahre = Math.round(tage / 365);
  return `vor ${jahre} ${jahre === 1 ? 'Jahr' : 'Jahren'}`;
}

/** Untertitel „Letzter Sync: …" — relativ, sonst Rohwert, sonst „noch nie". */
function syncLabel(iso: string | null): string {
  if (!iso) return 'noch nie';
  return relativeZeit(iso) || iso;
}

export default function AboHome({
  onOpenGruppeDetail,
  onOpenBrowser,
  onAbonnieren,
  onAlleProjekte,
  onSettings,
}: AboHomeProps) {
  const { isPhone } = useFormFactor();
  const aboState = useAboState(); // reaktiv: Reihenfolge, Abo-Menge, lastSync

  const [gruppen, setGruppen] = useState<Protokollgruppe[]>([]);
  const [kennzahlen, setKennzahlen] = useState<Record<string, AboKennzahlen>>({});
  const [loading, setLoading] = useState(true);

  // Nach dem Sync-Klick werden alle „neu"-Punkte optisch als synchron gezeigt.
  const [optischGesynct, setOptischGesynct] = useState(false);

  // Drag&Drop-Zustand der Karten-Sortierung.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Toast (Sync-Bestätigung, 2,6 s).
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // --- Daten laden: Gruppen + je Gruppe Kennzahlen (einmalig beim Mount) ---
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const gs = await getAllGruppen();
      const paare = await Promise.all(
        gs.map(async (g): Promise<readonly [string, AboKennzahlen]> => {
          const [pending, prots] = await Promise.all([
            getPendingChangesCount(g.id),
            getProtokolleByGruppe(g.id),
          ]);
          // Neuestes Protokoll = höchste Nummer.
          let neuestes: Protokoll | null = null;
          for (const p of prots) {
            if (!neuestes || p.nummer > neuestes.nummer) neuestes = p;
          }
          let offen = 0;
          let erledigt = 0;
          let aktualisiert = '';
          if (neuestes) {
            const elemente = await getElemente(neuestes.id);
            for (const e of elemente) {
              if (e.status === 10 || e.status === 11) offen += 1;
              else if (e.status === 17 || e.status === 20 || e.status === 25) erledigt += 1;
            }
            aktualisiert = relativeZeit(neuestes.updated_at || neuestes.datum);
          }
          return [g.id, { pending, protCount: prots.length, offen, erledigt, aktualisiert }] as const;
        }),
      );
      if (abgebrochen) return;
      setGruppen(gs);
      setKennzahlen(Object.fromEntries(paare));
      setLoading(false);
    })();
    return () => {
      abgebrochen = true;
    };
  }, []);

  // Toast-Timer beim Unmount aufräumen.
  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // --- Abgeleitete, sortierte Karten-Liste ---
  // Jede Render-Runde neu berechnet: useAboState() löst bei Änderung von
  // Reihenfolge/Abo-Menge ohnehin ein Re-Render aus, daher liest der Store
  // hier stets den aktuellen Stand. (aboState.order/subscribed als Trigger.)
  const abonniert = gruppen.filter((g) => aboStore.isSubscribed(g.id));
  // Fallback: aufsteigend nach Projektnummer; manuelle Reihenfolge überschreibt.
  const fallback = [...abonniert].sort((a, b) =>
    a.projekt_nummer.localeCompare(b.projekt_nummer, undefined, { numeric: true }),
  );
  const karten: AboKarteVM[] = aboStore.applyOrder(fallback, (g) => g.id).map((g) => {
    const k = kennzahlen[g.id];
    return {
      id: g.id,
      projektNummer: g.projekt_nummer,
      projektName: g.projekt_name,
      gruppenName: g.name,
      pending: k?.pending ?? 0,
      protCount: k?.protCount ?? 0,
      offen: k?.offen ?? 0,
      erledigt: k?.erledigt ?? 0,
      aktualisiert: k?.aktualisiert ?? '',
    };
  });

  // --- Aktionen ---
  function zeigeToast(nachricht: string) {
    setToast(nachricht);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  function handleSync() {
    aboStore.markSyncedNow(new Date().toISOString());
    setOptischGesynct(true); // „neu"-Punkte nur optisch zurücksetzen
    zeigeToast('Synchronisiert');
  }

  // Neue Reihenfolge nach einem Drop berechnen und im Store ablegen.
  function sortiereNeu(zielId: string) {
    const von = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!von || von === zielId) return;
    const ids = karten.map((k) => k.id);
    const vonIdx = ids.indexOf(von);
    if (vonIdx < 0) return;
    ids.splice(vonIdx, 1);
    const zielIdx = ids.indexOf(zielId);
    ids.splice(zielIdx < 0 ? ids.length : zielIdx, 0, von);
    aboStore.setOrder(ids);
  }

  function onHandleDragStart(id: string, e: DragEvent<HTMLButtonElement>) {
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id); // Firefox verlangt gesetzte Daten
    } catch {
      /* manche Browser blocken dataTransfer — ignorieren */
    }
    setDragId(id);
  }

  function onHandleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  function onCardDragOver(id: string, e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (dragId && dragId !== id && dragOverId !== id) setDragOverId(id);
  }

  function onCardDrop(id: string, e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    sortiereNeu(id);
  }

  // --- Header (blau) mit Sync-Status + Sync-Button ---
  const header = (
    <ScreenHeader
      title="Meine Protokolle"
      subtitle={`Letzter Sync: ${syncLabel(aboState.lastSync)}`}
      right={
        <>
          {onSettings && (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Einstellungen"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/15 active:scale-[.98]"
            >
              <IconSettings size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={handleSync}
            className="flex h-11 items-center gap-1.5 rounded-lg bg-white/90 px-3 text-[13px] font-semibold text-ping-blue transition hover:bg-white active:scale-[.98]"
          >
            <IconSync size={16} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </>
      }
    />
  );

  // --- Footer (sticky) mit „Alle Projekte" + „Protokoll abonnieren" ---
  const footer = (
    <StickyFooter>
      <SecondaryButton type="button" onClick={onAlleProjekte}>
        Alle Projekte
      </SecondaryButton>
      <PrimaryButton type="button" onClick={onAbonnieren}>
        <IconPlus size={16} />
        Protokoll abonnieren
      </PrimaryButton>
    </StickyFooter>
  );

  return (
    <Screen header={header} footer={footer}>
      <div className="p-4">
        {loading ? (
          <div className="px-1 py-10 text-center text-[13px] text-ping-text-light">
            Abonnements werden geladen …
          </div>
        ) : (
          <>
            <SectionLabel>Abonnierte Protokollgruppen · {karten.length}</SectionLabel>
            {karten.length === 0 ? (
              <EmptyState
                icon={<IconBook size={40} />}
                title="Noch keine Protokolle abonniert"
                hint="Abonniere Protokollgruppen, um Aktualisierungen hier gebündelt zu sehen."
              />
            ) : (
              <div
                className="grid"
                style={{
                  gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: 12,
                  alignContent: 'start',
                }}
              >
                {karten.map((k) => {
                  const wirdGezogen = dragId === k.id;
                  const dropZiel = dragOverId === k.id && dragId !== null && dragId !== k.id;
                  // Gold-Punkt bei offenen lokalen Änderungen, sonst grün (synchron).
                  const tone: 'neu' | 'sync' = !optischGesynct && k.pending > 0 ? 'neu' : 'sync';
                  return (
                    <div
                      key={k.id}
                      onDragOver={(e) => onCardDragOver(k.id, e)}
                      onDrop={(e) => onCardDrop(k.id, e)}
                      style={{ opacity: wirdGezogen ? 0.5 : 1, transition: 'opacity .12s' }}
                    >
                      <Card active={dropZiel} onClick={() => onOpenBrowser(k.id)} className="p-3">
                        {/* Zeile 1: Projekt-Nr + Projektname + Drag-/Kebab-Handle */}
                        <div className="flex items-center gap-2">
                          <ProjektChip nummer={k.projektNummer} />
                          <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-ping-blue">
                            {k.projektName}
                          </span>
                          <button
                            type="button"
                            draggable
                            onDragStart={(e) => onHandleDragStart(k.id, e)}
                            onDragEnd={onHandleDragEnd}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenGruppeDetail(k.id);
                            }}
                            title="Klick: Gruppe öffnen · Ziehen: sortieren"
                            aria-label="Gruppe bearbeiten oder sortieren"
                            className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-lg bg-ping-bg text-ping-text-mid transition hover:bg-black/10 active:cursor-grabbing"
                          >
                            <IconDrag size={18} />
                          </button>
                        </div>

                        {/* Zeile 2: Statuspunkt + Gruppenname + Protokoll-Anzahl */}
                        <div className="mt-2 flex items-center gap-2">
                          <StatusDot tone={tone} />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ping-text">
                            {k.gruppenName}
                          </span>
                          <span className="shrink-0 text-[11px] text-ping-text-mid">
                            {k.protCount} Prot.
                          </span>
                        </div>

                        {/* Zeile 3: Punkte-Bilanz + Aktualisierungszeit */}
                        <div className="mt-2 flex items-center gap-1.5">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-bold text-ping-gold-dark"
                            style={{ background: '#FBF1E2' }}
                          >
                            {k.offen} offen
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                            style={{ background: '#EAFAF0', color: '#16803C' }}
                          >
                            {k.erledigt} erledigt
                          </span>
                          <span className="flex-1" />
                          {k.aktualisiert && (
                            <span
                              className="flex items-center gap-1 text-[10.5px] text-ping-text-light"
                              title="Zuletzt aktualisiert"
                            >
                              <IconClock size={11} />
                              {k.aktualisiert}
                            </span>
                          )}
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <Toast message={toast} />
    </Screen>
  );
}
