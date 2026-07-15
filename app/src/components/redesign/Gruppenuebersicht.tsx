import { useCallback, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Protokollgruppe } from '../../types';
import { getAllGruppen, getProtokolleByGruppe, clearProjekt } from '../../db';
import type { ProtokollMitGruppe } from '../../db';
import { aboStore, useAboState } from '../../store/aboStore';
import { useFormFactor } from '../../hooks/useFormFactor';
import {
  Screen,
  ScreenHeader,
  StickyFooter,
  Card,
  SectionLabel,
  PrimaryButton,
  EmptyState,
  Toast,
} from '../../ui/primitives';
import { IconPlus, IconTrash, IconLock, IconFolder } from '../../ui/icons';
import StatusBadge from '../StatusBadge';

interface GruppenuebersichtProps {
  projektNummer: string;
  onOpenGruppeDetail: (gruppeId: string) => void;
  onNeueGruppe: () => void;
  onBack: () => void;
}

/** Angereicherte Zeile: Gruppe plus abgeleitete Kennzahlen (Protokolle, Themen, Status). */
interface GruppeRow {
  gruppe: Protokollgruppe;
  protokolleCount: number;
  themenCount: number;
  /** Status des neuesten Protokolls (aus `erledigt` abgeleitet) — null, wenn keiner ableitbar. */
  status: number | null;
  /** Gruppe ist leer (kein einziges Protokoll) → loeschbar. */
  leer: boolean;
}

/** Themen werden als String gefuehrt (`;`- oder Zeilen-getrennt). Nicht-leere Segmente zaehlen. */
function zaehleThemen(themen: string): number {
  if (!themen) return 0;
  return themen
    .split(/[;\n\r]+/)
    .map((t) => t.trim())
    .filter(Boolean).length;
}

/**
 * Status des neuesten Protokolls (hoechste Nummer). Als einziges ehrliches Signal
 * traegt das Protokoll `erledigt` — erledigt => 20 (Erledigt), sonst 10 (Offen).
 * Gibt es kein Protokoll, ist kein sinnvoller Status ableitbar => null (Badge weglassen).
 */
function neuesterStatus(prots: ProtokollMitGruppe[]): number | null {
  if (prots.length === 0) return null;
  const neuestes = prots.reduce((a, b) => (b.nummer > a.nummer ? b : a));
  return neuestes.erledigt ? 20 : 10;
}

/** Kompakter Abo-Schalter (Switch), Touch-Ziel >= 44px. */
function AboSwitch({ an, onToggle }: { an: boolean; onToggle: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={an ? 'Abo aktiv — antippen zum Abbestellen' : 'Nicht abonniert — antippen zum Abonnieren'}
      onClick={onToggle}
      className="inline-flex h-11 items-center"
    >
      <span
        className="relative inline-block h-[24px] w-[42px] rounded-full"
        style={{ background: an ? 'var(--color-ping-blue)' : '#cbd2dc', transition: 'background .18s ease' }}
      >
        <span
          className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow"
          style={{ left: an ? '21px' : '3px', transition: 'left .18s ease' }}
        />
      </span>
    </button>
  );
}

export default function Gruppenuebersicht({
  projektNummer,
  onOpenGruppeDetail,
  onNeueGruppe,
  onBack,
}: GruppenuebersichtProps) {
  const { isTablet, orientation } = useFormFactor();
  // Reaktiv an den Abo-Store binden: Toggle rendert die Karten neu.
  const aboState = useAboState();

  const [rows, setRows] = useState<GruppeRow[]>([]);
  const [alleIds, setAlleIds] = useState<string[]>([]);
  const [projektName, setProjektName] = useState('');
  const [geladen, setGeladen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const alle = await getAllGruppen();
    // Fuer den Abo-Store: das gesamte Gruppen-Universum, nicht nur dieses Projekt
    // (sonst wuerde das erste Toggle fremde Projekte faelschlich abbestellen).
    setAlleIds(alle.map((g) => g.id));

    const meine = alle.filter((g) => g.projekt_nummer === projektNummer);
    setProjektName(meine[0]?.projekt_name ?? '');

    const angereichert = await Promise.all(
      meine.map(async (g): Promise<GruppeRow> => {
        const prots = await getProtokolleByGruppe(g.id);
        return {
          gruppe: g,
          protokolleCount: prots.length,
          themenCount: zaehleThemen(g.themen),
          status: neuesterStatus(prots),
          leer: prots.length === 0,
        };
      }),
    );
    setRows(angereichert);
    setGeladen(true);
  }, [projektNummer]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Toast automatisch ausblenden (2,6 s).
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleToggleAbo(e: MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    aboStore.toggle(id, alleIds);
  }

  async function handleDelete(e: MouseEvent<HTMLButtonElement>, row: GruppeRow) {
    e.stopPropagation();
    // Doppelte Absicherung: clearProjekt nur bei wirklich leerer Gruppe.
    if (!row.leer) {
      setToast('Gruppe enthält Protokolle — Löschen gesperrt');
      return;
    }
    if (!window.confirm(`Gruppe „${row.gruppe.name}" wirklich löschen?`)) return;
    await clearProjekt(row.gruppe.id);
    await laden();
  }

  function handleLocked(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    setToast('Gruppe enthält Protokolle — Löschen gesperrt');
  }

  const zweiSpaltig = isTablet && orientation === 'quer';

  const header = (
    <ScreenHeader
      title={projektName || `Projekt ${projektNummer}`}
      subtitle={`Projekt ${projektNummer}`}
      onBack={onBack}
      backLabel="Projekte"
    />
  );

  const footer = (
    <StickyFooter>
      <PrimaryButton onClick={onNeueGruppe}>
        <IconPlus size={18} />
        Neue Gruppe
      </PrimaryButton>
    </StickyFooter>
  );

  return (
    <Screen header={header} footer={footer}>
      {geladen && rows.length === 0 ? (
        <EmptyState
          icon={<IconFolder size={40} />}
          title="Keine Protokollgruppen"
          hint="Für dieses Projekt ist noch keine Gruppe angelegt."
        />
      ) : (
        <div className="p-4">
          <div className="mb-3">
            <SectionLabel>Protokollgruppen · {rows.length}</SectionLabel>
          </div>

          <div className={`grid gap-3 ${zweiSpaltig ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {rows.map((row) => {
              const g = row.gruppe;
              // subscribed === null ⇒ Default: alle Gruppen gelten als abonniert.
              const abonniert = aboState.subscribed === null ? true : aboState.subscribed.includes(g.id);
              return (
                <Card key={g.id} className="relative p-[15px]" onClick={() => onOpenGruppeDetail(g.id)}>
                  {/* Kopfzeile: Name/Bemerkung/Ablage links, Status + Abo rechts */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-bold text-ping-text">{g.name}</div>
                      {g.bemerkung && (
                        <div className="mt-0.5 text-[12px] text-ping-text-mid">{g.bemerkung}</div>
                      )}
                      <div className="mt-1.5 truncate font-mono text-[11.5px] text-ping-text-light">
                        {g.projekt_stammverzeichnis}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {row.status !== null && <StatusBadge status={row.status} size="sm" />}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-ping-text-light">
                          Abo
                        </span>
                        <AboSwitch an={abonniert} onToggle={(e) => handleToggleAbo(e, g.id)} />
                      </div>
                    </div>
                  </div>

                  {/* Stat-Zeile + Loeschen/Sperre */}
                  <div className="mt-3 flex items-center gap-4 border-t border-black/5 pt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[16px] font-bold text-ping-blue">{row.protokolleCount}</span>
                      <span className="text-[12px] text-ping-text-mid">Protokolle</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[16px] font-bold text-ping-blue">{row.themenCount}</span>
                      <span className="text-[12px] text-ping-text-mid">Themen</span>
                    </div>
                    <div className="flex-1" />
                    {row.leer ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          void handleDelete(e, row);
                        }}
                        aria-label="Gruppe löschen"
                        title="Gruppe löschen"
                        className="flex h-11 w-11 items-center justify-center rounded-[9px]"
                        style={{ background: '#FEF2F2', color: 'var(--color-ping-danger)' }}
                      >
                        <IconTrash size={16} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleLocked}
                        aria-label="Gruppe enthält Protokolle — Löschen gesperrt"
                        title="Enthält Protokolle — Löschen gesperrt"
                        className="flex h-11 w-11 items-center justify-center rounded-[9px]"
                        style={{ background: '#F1F3F7', color: '#AAB2BF' }}
                      >
                        <IconLock size={15} />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Toast message={toast} />
    </Screen>
  );
}
