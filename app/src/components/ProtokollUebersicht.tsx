import { useEffect, useState, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { getProtokolleByGruppe, getElemente, getProtokollgruppe, zielOderEntwurfFuerNeuanlage, findBautagebuchProtokoll, getVerantwortliche } from '../db';
import MapOverview from './map/MapOverview';
import ScrollToTopFab from './ScrollToTopFab';
import SyncIndicator from './SyncIndicator';
import StatusBadge from './StatusBadge';
import { useSyncStatus } from '../useSyncStatus';
import { EmptyState } from '../ui/primitives';
import { IconSearch, IconX, IconPlus, IconLock, IconKebab, IconChevronLeft, IconCamera } from '../ui/icons';
import { neuanlageErlaubt, obersterPunkt, aktuellesProtokoll, istVerteilt } from '../protokollRegeln';

export interface UebersichtState {
  ansicht: 'alle' | 'einzeln' | 'karte';
  filter: string;
  statusFilter: number | null;
  gewaehlteProtId: string | null;
}

// Tab-Stile im blauen Kopf (Handoff: inaktiv weiß, aktiv PING-Blau mit weißer Schrift)
const TAB_BASIS = 'shrink-0 whitespace-nowrap rounded-[9px] px-3 py-2 text-[12.5px] font-semibold transition';
const TAB_AKTIV = 'bg-ping-blue-dark text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.55)]';
const TAB_INAKTIV = 'bg-white text-ping-text-mid hover:bg-ping-blue-light';

interface Props {
  gruppeId: string;
  initialState?: UebersichtState;
  onStateChange?: (state: UebersichtState) => void;
  onSelectElement: (element: Protokollelement, protokoll: Protokoll, gruppe: Protokollgruppe, filteredIds?: string[]) => void;
  onNeuesElement: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onBautagebuch?: (gruppe: Protokollgruppe) => void;
  onSchnellErstellung?: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onExport: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  /** Zurück „Meine Protokolle" (Handoff). */
  onZurueck: () => void;
  /** ⋮ im Kopf: Einstellungen der Protokollgruppe (Gruppen-Detail). */
  onEinstellungen?: () => void;
  /** Docking-Variante: Wurzel füllt den Container (h-full), Aktionsleiste rechtsbündig. Ändert keine Logik. */
  embedded?: boolean;
  /** Tablet quer: nach dem Laden einmalig den obersten Punkt der Liste aktivieren (Tablet-Handoff, Abschnitt 1). Ohne Punkte bleibt nur die Liste. */
  autoAuswahlOberster?: boolean;
}

export default function ProtokollUebersicht({ gruppeId, initialState, onStateChange, onSelectElement, onNeuesElement, onBautagebuch, onSchnellErstellung, onExport, onZurueck, onEinstellungen, embedded = false, autoAuswahlOberster = false }: Props) {
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
  const [btProt, setBtProt] = useState<Protokoll | null>(null);
  const [hatAenderungen, setHatAenderungen] = useState(false);
  const [anzahlGeaendert, setAnzahlGeaendert] = useState(0);
  const [anzahlNeu, setAnzahlNeu] = useState(0);
  const [zeigeAenderungen, setZeigeAenderungen] = useState(false);
  const [verantwMap, setVerantwMap] = useState<Map<string, string>>(new Map());
  const [geladen, setGeladen] = useState(false);
  const autoAuswahlErledigt = useRef(false);
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

    // Protokoll-Tab wiederherstellen: gespeichertes > aktuelles Protokoll > erstes
    const restored = restoredProtId.current ? prots.find(p => p.id === restoredProtId.current) : null;
    const selectProt = restored || aktuellesProtokoll(prots) || prots[0];
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

    // Bautagebuch-Protokoll (Anhang) — eigener Tab „Bautagebuch" und BT-Knopf
    setBtProt(await findBautagebuchProtokoll(gruppeId));

    // Exportierbare Aenderungen pruefen
    const geaendert = alle.filter(e => e.is_modified && !e.is_new).length;
    const neu = alle.filter(e => e.is_new).length;
    setAnzahlGeaendert(geaendert);
    setAnzahlNeu(neu);
    setHatAenderungen(geaendert + neu > 0);
    setGeladen(true);
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
  // Neuanlage (Neuer Punkt/Schnell/BT) nur außerhalb des Tabs eines verteilten Protokolls
  const neuErlaubt = neuanlageErlaubt(ansicht, aktivProt, protokolle);

  // Tablet quer: Protokoll öffnen aktiviert sofort den obersten Punkt (einmal je Öffnen)
  useEffect(() => {
    if (!autoAuswahlOberster || autoAuswahlErledigt.current || !geladen || !gruppe) return;
    autoAuswahlErledigt.current = true;
    const erster = obersterPunkt(aktuelleElemente);
    if (!erster) return;
    const prot = protokolle.find(p => p.id === erster.protokoll_id) || aktivProt;
    if (prot) handleSelectElement(erster, prot, gruppe, aktuelleElemente.map(e => e.id));
  });

  if (!gruppe) return <div className="p-6 text-ping-text-light">Laden...</div>;

  return (
    <div className={`flex flex-col overflow-hidden bg-ping-surface ${embedded ? 'relative h-full' : 'h-[100dvh]'}`}>
      {/* Kopf nach Handoff: Zeile 1 Zurück „Meine Protokolle" + Sync/Änderungen/Export,
          Zeile 2 Gruppenname · Projekt + ⋮ (Einstellungen der Protokollgruppe), darunter die Tabs */}
      <header className="shrink-0 bg-ping-blue px-4 pb-3 pt-1.5 text-white">
        <div className="flex items-center gap-2">
          <button
            onClick={onZurueck}
            className="flex min-h-[36px] min-w-0 items-center gap-1 text-[14px] text-white/85 transition hover:text-white"
          >
            <IconChevronLeft size={16} className="shrink-0" />
            <span className="truncate">Meine Protokolle</span>
          </button>
          <span className="flex-1" />
          <div className="flex shrink-0 items-center gap-1.5">
            <SyncIndicator sync={sync} />
            {hatAenderungen && (
              <button
                onClick={() => setZeigeAenderungen(!zeigeAenderungen)}
                className="flex h-8 items-center gap-0.5 rounded-full bg-ping-gold px-3 text-[11px] font-semibold text-white transition hover:brightness-95"
                title="Geänderte und neue Punkte anzeigen"
              >
                {anzahlGeaendert > 0 && <span>{anzahlGeaendert}*</span>}
                {anzahlGeaendert > 0 && anzahlNeu > 0 && ' '}
                {anzahlNeu > 0 && <span>+{anzahlNeu}</span>}
              </button>
            )}
            {aktivProt && (
              <button
                onClick={() => handleExport(aktivProt, gruppe)}
                className="flex h-8 items-center rounded-full bg-white/15 px-3 text-xs font-semibold text-white transition hover:bg-white/25"
              >
                Export
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 shrink truncate text-[18px] font-bold leading-tight">{gruppe.name}</h1>
          <p className="min-w-0 flex-1 truncate text-[12px] text-white/75">
            {[gruppe.projekt_nummer, gruppe.projekt_name].filter(Boolean).join(' · ')}
          </p>
          {onEinstellungen && (
            <button
              onClick={() => { saveState(); onEinstellungen(); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white/15 text-white transition hover:bg-white/25"
              title="Einstellungen der Protokollgruppe"
              aria-label="Einstellungen der Protokollgruppe"
            >
              <IconKebab size={18} />
            </button>
          )}
        </div>

        {/* Tabs Gesamt | Karte | Nr. … | Bautagebuch — horizontal scrollbar */}
        <div className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
          <button
            onClick={() => setAnsicht('alle')}
            className={`${TAB_BASIS} ${ansicht === 'alle' ? TAB_AKTIV : TAB_INAKTIV}`}
          >
            Gesamt
          </button>
          <button
            onClick={() => setAnsicht('karte')}
            className={`${TAB_BASIS} ${ansicht === 'karte' ? TAB_AKTIV : TAB_INAKTIV}`}
          >
            Karte
          </button>
          {protokolle.filter(p => p.id !== btProt?.id).map(p => {
            const isDraft = p.is_new;
            const aktiv = ansicht === 'einzeln' && gewaehltesProt?.id === p.id;
            return (
              <button
                key={p.id}
                ref={aktiv ? activeTabRef : undefined}
                onClick={() => { setAnsicht('einzeln'); ladeElemente(p); }}
                className={`${TAB_BASIS} ${aktiv ? TAB_AKTIV : TAB_INAKTIV}`}
              >
                {p.nummer < 0
                  ? p.name.replace(/\s*-?\d+\s*[-–]\s*\d+$/, '').trim() || p.name
                  : <>Nr. {p.nummer}<span className="ml-1 opacity-70">{new Date(p.datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></>
                }
                {isDraft && <span className={`ml-0.5 ${aktiv ? '' : 'text-ping-gold-dark'}`} title="Entwurf">*</span>}
              </button>
            );
          })}
          {btProt && (
            <button
              ref={ansicht === 'einzeln' && gewaehltesProt?.id === btProt.id ? activeTabRef : undefined}
              onClick={() => { setAnsicht('einzeln'); ladeElemente(btProt); }}
              className={`${TAB_BASIS} ${ansicht === 'einzeln' && gewaehltesProt?.id === btProt.id ? 'bg-ping-gold text-white' : 'bg-ping-gold-light text-ping-gold-dark'}`}
            >
              Bautagebuch
            </button>
          )}
        </div>
      </header>

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

      {/* Feste Aktionsleiste unten (Handoff): BT gold, Schnell hellblau, Neuer Punkt PING-Blau.
          Eigene Zeile außerhalb des Scrollbereichs — bleibt beim Scrollen der Liste stehen.
          Im Tab eines verteilten Protokolls stattdessen der Hinweis (Tablet-Handoff, Abschnitt 3). */}
      {aktivProt && gruppe && (
        <div
          className="shrink-0 border-t border-black/5 bg-ping-surface px-3 pt-2.5"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
        >
          {neuErlaubt ? (
            <div className={`flex items-center gap-2 ${embedded ? 'justify-end' : ''}`}>
              {/* BT nur, solange das Bautagebuch nicht als verteilt gilt (Serverwert, H1) */}
              {btProt && onBautagebuch && !istVerteilt(btProt, protokolle) && (
                <button
                  onClick={() => {
                    saveState();
                    onBautagebuch(gruppe);
                  }}
                  className="flex min-h-[46px] shrink-0 items-center justify-center rounded-[13px] bg-ping-gold px-4 text-[13px] font-semibold text-white shadow-[0_8px_18px_rgba(138,90,20,0.35)] transition hover:bg-ping-gold-dark active:scale-[.98]"
                  title="Bautagebuch-Eintrag"
                  aria-label="Bautagebuch-Eintrag"
                >
                  BT
                </button>
              )}
              {onSchnellErstellung && (
                <button
                  onClick={async () => {
                    // M1: Ziel ist das aktuelle Protokoll (nie ein Anhang); ein Entwurf entsteht erst beim Speichern
                    const prot = await zielOderEntwurfFuerNeuanlage(gruppe.id, ansicht, aktivProt.id);
                    saveState();
                    onSchnellErstellung(prot, gruppe);
                  }}
                  className={`flex min-h-[46px] items-center justify-center gap-1.5 rounded-[13px] bg-ping-blue-light px-4 text-[13.5px] font-semibold text-ping-blue shadow-[0_8px_18px_rgba(15,23,42,0.15)] transition hover:brightness-95 active:scale-[.98] ${embedded ? '' : 'flex-1'}`}
                  title="Schnellerstellung: Punkte aus Fotos"
                >
                  <IconCamera size={16} />
                  Schnell
                </button>
              )}
              <button
                onClick={async () => {
                  // M1: Ziel ist das aktuelle Protokoll (nie ein Anhang); ein Entwurf entsteht erst beim Speichern
                  const prot = await zielOderEntwurfFuerNeuanlage(gruppe.id, ansicht, aktivProt.id);
                  handleNeuesElement(prot, gruppe);
                }}
                className={`flex min-h-[46px] items-center justify-center gap-1.5 rounded-[13px] bg-ping-blue px-5 text-[13.5px] font-semibold text-white shadow-[0_8px_22px_rgba(0,72,153,0.4)] transition hover:bg-ping-blue-dark active:scale-[.98] ${embedded ? '' : 'flex-[1.5]'}`}
              >
                <IconPlus size={16} />
                Neuer Punkt
              </button>
            </div>
          ) : (
            <div
              role="status"
              className={`flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-ping-bg px-3.5 py-3 text-[12px] font-semibold text-ping-text-mid ${embedded ? 'ml-auto w-fit' : ''}`}
            >
              <IconLock size={13} className="shrink-0" />
              Protokoll abgeschlossen — keine neuen Punkte
            </div>
          )}
        </div>
      )}
      <ScrollToTopFab />
    </div>
  );
}
