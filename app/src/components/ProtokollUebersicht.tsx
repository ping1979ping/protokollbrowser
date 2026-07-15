import { useEffect, useState, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { getProtokolleByGruppe, getElemente, getProtokollgruppe, getOrCreateDraftProtokoll, findBautagebuchProtokoll, getVerantwortliche } from '../db';
import MapOverview from './map/MapOverview';
import ScrollToTopFab from './ScrollToTopFab';
import SyncIndicator from './SyncIndicator';
import StatusBadge from './StatusBadge';
import { useSyncStatus } from '../useSyncStatus';
import { ScreenHeader, EmptyState } from '../ui/primitives';
import { IconSearch, IconX, IconPlus } from '../ui/icons';

export interface UebersichtState {
  ansicht: 'alle' | 'einzeln' | 'karte';
  filter: string;
  statusFilter: number | null;
  gewaehlteProtId: string | null;
}

interface Props {
  gruppeId: string;
  initialState?: UebersichtState;
  onStateChange?: (state: UebersichtState) => void;
  onSelectElement: (element: Protokollelement, protokoll: Protokoll, gruppe: Protokollgruppe, filteredIds?: string[]) => void;
  onNeuesElement: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onBautagebuch?: (gruppe: Protokollgruppe) => void;
  onSchnellErstellung?: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onExport: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onZurueck: () => void;
  /** Docking-Variante: Wurzel fuellt den Container (h-full) und FABs positionieren absolut statt fixed. Aendert keine Logik. */
  embedded?: boolean;
}

export default function ProtokollUebersicht({ gruppeId, initialState, onStateChange, onSelectElement, onNeuesElement, onBautagebuch, onSchnellErstellung, onExport, onZurueck, embedded = false }: Props) {
  const [gruppe, setGruppe] = useState<Protokollgruppe | null>(null);
  const [protokolle, setProtokolle] = useState<Protokoll[]>([]);
  const [gewaehltesProt, setGewaehltesProt] = useState<Protokoll | null>(null);
  const [elemente, setElemente] = useState<Protokollelement[]>([]);
  const [alleElemente, setAlleElemente] = useState<(Protokollelement & { _protName: string })[]>([]);
  const [ansicht, setAnsicht] = useState<'alle' | 'einzeln' | 'karte'>(initialState?.ansicht ?? 'einzeln');
  const [filter, setFilter] = useState(initialState?.filter ?? '');
  const [statusFilter, setStatusFilter] = useState<number | null>(initialState?.statusFilter ?? null);
  const restoredProtId = useRef(initialState?.gewaehlteProtId ?? null);
  const sync = useSyncStatus(gruppeId);
  const [hatBautagebuch, setHatBautagebuch] = useState(false);
  const [hatAenderungen, setHatAenderungen] = useState(false);
  const [anzahlGeaendert, setAnzahlGeaendert] = useState(0);
  const [anzahlNeu, setAnzahlNeu] = useState(0);
  const [zeigeAenderungen, setZeigeAenderungen] = useState(false);
  const [verantwMap, setVerantwMap] = useState<Map<string, string>>(new Map());
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Refs fuer synchronen Zugriff auf aktuellen State (vermeidet Race Conditions)
  const ansichtRef = useRef(ansicht);
  const filterRef = useRef(filter);
  const statusFilterRef = useRef(statusFilter);
  const gewaehlteProtRef = useRef(gewaehltesProt);
  ansichtRef.current = ansicht;
  filterRef.current = filter;
  statusFilterRef.current = statusFilter;
  gewaehlteProtRef.current = gewaehltesProt;

  // State synchron sichern — wird VOR jeder Navigation aufgerufen
  function saveState() {
    onStateChange?.({
      ansicht: ansichtRef.current,
      filter: filterRef.current,
      statusFilter: statusFilterRef.current,
      gewaehlteProtId: gewaehlteProtRef.current?.id ?? null,
    });
  }

  // Navigations-Wrapper: State synchron sichern, dann weiterleiten
  function handleSelectElement(elem: Protokollelement, prot: Protokoll, grp: Protokollgruppe, filteredIds?: string[]) {
    saveState();
    onSelectElement(elem, prot, grp, filteredIds);
  }

  function handleNeuesElement(prot: Protokoll, grp: Protokollgruppe) {
    saveState();
    onNeuesElement(prot, grp);
  }

  function handleExport(prot: Protokoll, grp: Protokollgruppe) {
    saveState();
    onExport(prot, grp);
  }

  // Aktiven Tab ins Sichtfeld scrollen
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
    }
  }, [gewaehltesProt?.id, ansicht]);

  useEffect(() => { laden(); }, []);

  useEffect(() => {
    getVerantwortliche().then(firmen => {
      const map = new Map<string, string>();
      for (const f of firmen) {
        map.set(f.id, f.kuerzel || f.name);
      }
      setVerantwMap(map);
    });
  }, []);

  async function laden() {
    const grp = await getProtokollgruppe(gruppeId);
    if (!grp) return;
    setGruppe(grp);
    const prots = await getProtokolleByGruppe(gruppeId);
    prots.sort((a, b) => b.nummer - a.nummer);
    setProtokolle(prots);

    // Protokoll-Tab wiederherstellen: gespeichertes > Draft > erstes
    const restored = restoredProtId.current ? prots.find(p => p.id === restoredProtId.current) : null;
    const draftProt = prots.find(p => (p as typeof p & { is_new?: boolean }).is_new);
    const selectProt = restored || draftProt || prots[0];
    if (selectProt) {
      await ladeElemente(selectProt);
    }

    // Alle Elemente aller Protokolle laden
    const alle: (Protokollelement & { _protName: string })[] = [];
    for (const p of prots) {
      const elems = await getElemente(p.id);
      for (const e of elems) {
        alle.push({ ...e, _protName: `Nr. ${p.nummer}` });
      }
    }
    alle.sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true }));
    setAlleElemente(alle);

    // Bautagebuch-Protokoll pruefen
    const btProt = await findBautagebuchProtokoll(gruppeId);
    setHatBautagebuch(!!btProt);

    // Exportierbare Aenderungen pruefen
    const geaendert = alle.filter(e => e.is_modified && !e.is_new).length;
    const neu = alle.filter(e => e.is_new).length;
    setAnzahlGeaendert(geaendert);
    setAnzahlNeu(neu);
    setHatAenderungen(geaendert + neu > 0);
  }

  async function ladeElemente(prot: Protokoll) {
    setGewaehltesProt(prot);
    const elems = await getElemente(prot.id);
    elems.sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true }));
    setElemente(elems);
  }

  function filtern(liste: Protokollelement[]) {
    return liste.filter((e) => {
      if (statusFilter !== null && e.status !== statusFilter) return false;
      if (filter) {
        const s = filter.toLowerCase();
        return (
          e.positionstext.toLowerCase().includes(s) ||
          e.positionstitel.toLowerCase().includes(s) ||
          e.position.toLowerCase().includes(s) ||
          e.thema.toLowerCase().includes(s) ||
          e.verantwortlicher_name.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }

  const aktuelleElemente = ansicht === 'einzeln' ? filtern(elemente) : filtern(alleElemente);
  const aktivProt = gewaehltesProt || protokolle[0];

  if (!gruppe) return <div className="p-6 text-ping-text-light">Laden...</div>;

  return (
    <div className={`flex flex-col overflow-hidden bg-ping-surface ${embedded ? 'relative h-full' : 'h-[100dvh]'}`}>
      {/* Header — blau, Projektname gross + Gruppenname klein, rechts Sync/Aenderungen/Export als Pills */}
      <ScreenHeader
        title={gruppe.projekt_name}
        subtitle={gruppe.name}
        onBack={onZurueck}
        backLabel="Projekte"
        right={
          <>
            <SyncIndicator sync={sync} />
            {hatAenderungen && (
              <button
                onClick={() => setZeigeAenderungen(!zeigeAenderungen)}
                className="flex h-7 items-center gap-0.5 rounded-full px-3 text-[11px] font-bold text-white transition hover:brightness-95"
                style={{ background: 'var(--color-ping-gold)' }}
              >
                {anzahlGeaendert > 0 && <span>{anzahlGeaendert}*</span>}
                {anzahlGeaendert > 0 && anzahlNeu > 0 && ' '}
                {anzahlNeu > 0 && <span>+{anzahlNeu}</span>}
              </button>
            )}
            {aktivProt && (
              <button
                onClick={() => handleExport(aktivProt, gruppe)}
                className="flex h-7 items-center rounded-full bg-white/15 px-3 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                Export
              </button>
            )}
          </>
        }
      />

      {/* Protokoll-Tabs — horizontal scrollbar, Gesamt gold-akzentuiert, aktiv PING-gefuellt */}
      <div className="shrink-0 overflow-x-auto border-b border-black/5 bg-white">
        <div className="flex gap-1 px-2 py-2">
          <button
            onClick={() => setAnsicht('alle')}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
              ansicht === 'alle' ? 'bg-ping-gold-dark text-white' : 'bg-ping-gold-light text-ping-gold-dark'
            }`}
          >
            Gesamt
          </button>
          <button
            onClick={() => setAnsicht('karte')}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
              ansicht === 'karte' ? 'bg-ping-blue text-white' : 'bg-ping-blue-light text-ping-blue'
            }`}
          >
            Karte
          </button>
          {protokolle.map(p => {
            const isDraft = (p as typeof p & { is_new?: boolean }).is_new;
            return (
              <button
                key={p.id}
                ref={ansicht === 'einzeln' && gewaehltesProt?.id === p.id ? activeTabRef : undefined}
                onClick={() => { setAnsicht('einzeln'); ladeElemente(p); }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  ansicht === 'einzeln' && gewaehltesProt?.id === p.id
                    ? isDraft ? 'bg-green-600 text-white' : 'bg-ping-blue text-white'
                    : isDraft ? 'bg-green-50 text-green-700' : 'bg-ping-bg text-ping-text-mid'
                }`}
              >
                {p.nummer < 0
                  ? p.name.replace(/\s*-?\d+\s*[-–]\s*\d+$/, '').trim() || p.name
                  : <>Nr. {p.nummer}<span className="ml-1 opacity-70">{new Date(p.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></>
                }
                {isDraft && <span className="ml-0.5">*</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filterzeile — dunkelgrau, helles Suchfeld mit Loeschen, Status-Chips */}
      <div className="shrink-0 flex items-center gap-1.5 bg-ping-filter px-2 py-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/60" />
          <input
            type="text"
            placeholder="Text suchen..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-lg bg-white/15 py-1.5 pl-8 pr-8 text-xs text-white placeholder-white/50 outline-none focus:bg-white/25"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/70 hover:bg-white/15"
              aria-label="Löschen"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
        {[null, 10, 11, 20, 0].map(s => (
          <button
            key={String(s)}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap transition ${
              statusFilter === s ? 'bg-white text-ping-text' : 'bg-white/10 text-white/80 hover:bg-white/20'
            }`}
          >
            {s === null ? 'Alle' : s === 10 ? 'Offen' : s === 11 ? 'Mängel' : s === 20 ? 'Erledigt' : 'Neu'}
          </button>
        ))}
      </div>

      {/* Protokollkopf */}
      {ansicht === 'alle' && (
        <div className="shrink-0 border-b border-black/5 bg-ping-blue-light px-3 py-1.5 text-xs font-semibold text-ping-text-mid">
          Gesamtprotokoll
        </div>
      )}
      {ansicht === 'einzeln' && aktivProt && (
        <div className="shrink-0 border-b border-black/5 bg-ping-blue-light px-3 py-1.5 text-xs text-ping-text-mid">
          <span className="font-semibold text-ping-text">{aktivProt.name}</span> · {new Date(aktivProt.datum).toLocaleDateString('de-DE')} · {aktivProt.ort} · {aktivProt.autor}
          {aktivProt.erledigt && <span className="ml-2 font-semibold" style={{ color: 'var(--color-ping-success-dark)' }}>erledigt</span>}
        </div>
      )}

      {/* Aenderungsuebersicht */}
      {zeigeAenderungen && (
        <div className="shrink-0 max-h-[40vh] overflow-auto border-b" style={{ background: '#FBF1E2', borderColor: '#F5EDE0' }}>
          <div className="sticky top-0 flex items-center justify-between px-3 py-1.5" style={{ background: '#FBF1E2' }}>
            <span className="text-xs font-semibold text-ping-gold-dark">
              {anzahlGeaendert} geändert, {anzahlNeu} neu
            </span>
            <button
              onClick={() => setZeigeAenderungen(false)}
              className="rounded-full p-1 text-ping-gold-dark hover:bg-ping-gold-light"
              aria-label="Schließen"
            >
              <IconX size={15} />
            </button>
          </div>
          {alleElemente.filter(e => e.is_modified || e.is_new).map(elem => (
            <button
              key={elem.id}
              onClick={() => {
                const prot = protokolle.find(p => p.id === elem.protokoll_id) || aktivProt;
                if (prot) handleSelectElement(elem, prot, gruppe, undefined);
                setZeigeAenderungen(false);
              }}
              className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left hover:bg-ping-gold-light"
              style={{ borderColor: '#F5EDE0' }}
            >
              <span className="w-8 shrink-0 font-mono text-[10px] text-ping-text-light">{elem.position}</span>
              {elem.is_new && <span className="shrink-0 rounded bg-ping-gold-light px-1 text-[9px] font-semibold text-ping-gold-dark">+neu</span>}
              {elem.is_modified && !elem.is_new && <span className="shrink-0 rounded bg-ping-gold-light px-1 text-[9px] font-semibold text-ping-gold-dark">*</span>}
              <StatusBadge status={elem.status} size="sm" />
              <span className="truncate text-xs text-ping-text">{elem.positionstext?.slice(0, 60) || elem.positionstitel || '—'}</span>
              <span className="ml-auto shrink-0 text-[9px] text-ping-text-light">{elem._protName}</span>
            </button>
          ))}
        </div>
      )}

      {/* Kartenansicht oder Tabelle */}
      {ansicht === 'karte' ? (
        <MapOverview
          elemente={aktuelleElemente}
          onElementClick={(elem) => aktivProt && handleSelectElement(elem, protokolle.find(p => p.id === elem.protokoll_id) || aktivProt, gruppe, aktuelleElemente.map(e => e.id))}
          onRefresh={laden}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-black/5">
            {aktuelleElemente.map((elem) => {
              const ueberfaellig = elem.termin && [0, 10].includes(elem.status) && new Date(elem.termin) < new Date(new Date().toDateString());
              return (
                <button
                  key={elem.id}
                  onClick={() => aktivProt && handleSelectElement(elem, ansicht === 'einzeln' ? aktivProt : protokolle.find(p => p.id === elem.protokoll_id) || aktivProt, gruppe, aktuelleElemente.map(e => e.id))}
                  className="flex w-full gap-3 px-3 py-3 text-left transition hover:bg-ping-blue-light active:bg-ping-blue-light"
                >
                  {/* Linke Spalte: Position + Thema + Badges */}
                  <div className="w-24 shrink-0">
                    <div className={`font-mono text-base font-semibold ${elem.mobile_erfassung?.geo_lat != null ? 'text-ping-blue' : 'text-ping-text-mid'}`}>
                      {elem.position}
                    </div>
                    <div className="mt-0.5 truncate text-sm leading-tight text-ping-text-light">{elem.thema || '-'}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(elem.verweise?.length > 0) && <span className="text-sm" style={{ color: 'var(--color-ping-gold)' }}>&#8617;</span>}
                      {elem.is_new && <span className="rounded bg-ping-gold-light px-1.5 text-sm font-medium text-ping-gold-dark">+neu</span>}
                      {elem.is_modified && !elem.is_new && <span className="rounded bg-ping-gold-light px-1.5 text-sm font-medium text-ping-gold-dark">*</span>}
                    </div>
                  </div>

                  {/* Mitte: Positionstext (dreizeilig geklemmt) */}
                  <div className="min-w-0 flex-1">
                    <div className="text-base leading-snug text-ping-text line-clamp-3">
                      {elem.positionstext || elem.positionstitel || '—'}
                    </div>
                  </div>

                  {/* Rechte Spalte: Status + Termin + Verantwortlich */}
                  <div className="w-24 shrink-0 text-right">
                    <div className="flex justify-end">
                      <StatusBadge status={elem.status} />
                    </div>
                    <div className={`mt-1 text-sm ${ueberfaellig ? 'font-semibold' : 'text-ping-text-light'}`} style={ueberfaellig ? { color: 'var(--color-ping-danger)' } : undefined}>
                      {elem.termin ? new Date(elem.termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-ping-text-light">
                      {verantwMap.get(elem.verantwortlicher_id || '') || elem.verantwortlicher_name || ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {aktuelleElemente.length === 0 && (
            <EmptyState title="Keine Elemente gefunden." />
          )}
        </div>
      )}

      {/* FABs — rund mit Schatten: + blau, BT gold, Schnell violett */}
      {aktivProt && gruppe && (
        <div className={`${embedded ? 'absolute' : 'fixed'} bottom-4 right-4 flex flex-row items-center gap-2`}>
          {hatBautagebuch && onBautagebuch && (
            <button
              onClick={() => {
                saveState();
                onBautagebuch(gruppe);
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg transition hover:brightness-95 active:scale-95"
              style={{ background: 'var(--color-ping-gold)' }}
            >
              BT
            </button>
          )}
          {onSchnellErstellung && (
            <button
              onClick={async () => {
                const prot = aktivProt.nummer < 0 ? aktivProt : await getOrCreateDraftProtokoll(gruppe.id, {
                  name: aktivProt.name, ort: aktivProt.ort, autor: aktivProt.autor,
                });
                saveState();
                onSchnellErstellung(prot, gruppe);
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-lg text-white shadow-lg transition hover:bg-violet-700 active:scale-95"
            >
              &#9889;
            </button>
          )}
          <button
            onClick={async () => {
              const prot = aktivProt.nummer < 0 ? aktivProt : await getOrCreateDraftProtokoll(gruppe.id, {
                name: aktivProt.name, ort: aktivProt.ort, autor: aktivProt.autor,
              });
              handleNeuesElement(prot, gruppe);
            }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-ping-blue text-white shadow-lg transition hover:bg-ping-blue-dark active:scale-95"
          >
            <IconPlus size={26} />
          </button>
        </div>
      )}
      <ScrollToTopFab />
    </div>
  );
}
