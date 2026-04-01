import { useEffect, useState, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { getProtokolleByGruppe, getElemente, getProtokollgruppe, getOrCreateDraftProtokoll, findBautagebuchProtokoll } from '../db';
import MapOverview from './map/MapOverview';
import SyncIndicator from './SyncIndicator';
import { useSyncStatus } from '../useSyncStatus';

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
}

export default function ProtokollUebersicht({ gruppeId, initialState, onStateChange, onSelectElement, onNeuesElement, onBautagebuch, onSchnellErstellung, onExport, onZurueck }: Props) {
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
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Refs für synchronen Zugriff auf aktuellen State (vermeidet Race Conditions)
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
      gewaehlteProtId: gewaehlteProtRef.current?.Id ?? null,
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
  }, [gewaehltesProt?.Id, ansicht]);

  useEffect(() => { laden(); }, []);

  async function laden() {
    const grp = await getProtokollgruppe(gruppeId);
    if (!grp) return;
    setGruppe(grp);
    const prots = await getProtokolleByGruppe(gruppeId);
    prots.sort((a, b) => b.Nummer - a.Nummer);
    setProtokolle(prots);

    // Protokoll-Tab wiederherstellen: gespeichertes > Draft > erstes
    const restored = restoredProtId.current ? prots.find(p => p.Id === restoredProtId.current) : null;
    const draftProt = prots.find(p => (p as typeof p & { _neu?: boolean })._neu);
    const selectProt = restored || draftProt || prots[0];
    if (selectProt) {
      await ladeElemente(selectProt);
    }

    // Alle Elemente aller Protokolle laden
    const alle: (Protokollelement & { _protName: string })[] = [];
    for (const p of prots) {
      const elems = await getElemente(p.Id);
      for (const e of elems) {
        alle.push({ ...e, _protName: `Nr. ${p.Nummer}` });
      }
    }
    alle.sort((a, b) => a.Position.localeCompare(b.Position, undefined, { numeric: true }));
    setAlleElemente(alle);

    // Bautagebuch-Protokoll prüfen
    const btProt = await findBautagebuchProtokoll(gruppeId);
    setHatBautagebuch(!!btProt);

    // Exportierbare Änderungen prüfen
    const geaendert = alle.filter(e => e._geaendert && !e._neu).length;
    const neu = alle.filter(e => e._neu).length;
    setAnzahlGeaendert(geaendert);
    setAnzahlNeu(neu);
    setHatAenderungen(geaendert + neu > 0);
  }

  async function ladeElemente(prot: Protokoll) {
    setGewaehltesProt(prot);
    const elems = await getElemente(prot.Id);
    elems.sort((a, b) => a.Position.localeCompare(b.Position, undefined, { numeric: true }));
    setElemente(elems);
  }

  function filtern(liste: Protokollelement[]) {
    return liste.filter((e) => {
      if (statusFilter !== null && e.Status !== statusFilter) return false;
      if (filter) {
        const s = filter.toLowerCase();
        return (
          e.Positionstext.toLowerCase().includes(s) ||
          e.Positionstitel.toLowerCase().includes(s) ||
          e.Position.toLowerCase().includes(s) ||
          e.Thema.toLowerCase().includes(s) ||
          e.VerantwortlicherFirmaName.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }

  const aktuelleElemente = ansicht === 'einzeln' ? filtern(elemente) : filtern(alleElemente);
  const aktivProt = gewaehltesProt || protokolle[0];

  if (!gruppe) return <div className="p-6 text-gray-500">Laden...</div>;

  return (
    <div className="h-[100dvh] bg-ping-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onZurueck} className="text-ping-blue-light hover:text-white text-sm">&larr; Projekte</button>
          <div className="flex items-center gap-2">
            <SyncIndicator sync={sync} />
            {hatAenderungen && (
              <button
                onClick={() => setZeigeAenderungen(!zeigeAenderungen)}
                className="bg-orange-500 text-white px-3 h-7 rounded-lg text-[10px] font-bold flex items-center"
              >
                {anzahlGeaendert > 0 && <span>{anzahlGeaendert}*</span>}
                {anzahlGeaendert > 0 && anzahlNeu > 0 && ' '}
                {anzahlNeu > 0 && <span>+{anzahlNeu}</span>}
              </button>
            )}
            {aktivProt && (
              <button
                onClick={() => handleExport(aktivProt, gruppe)}
                className={`px-3 h-7 rounded-lg text-xs text-white flex items-center ${
                  hatAenderungen ? 'bg-red-500 hover:bg-red-600' : 'bg-ping-blue-dark hover:bg-ping-blue'
                }`}
              >
                Export
              </button>
            )}
          </div>
        </div>
        <h1 className="text-base font-bold leading-tight">{gruppe.ProjektName}</h1>
        <p className="text-ping-blue-light text-xs">{gruppe.Name}</p>
      </div>

      {/* Protokoll-Tabs */}
      <div className="bg-white border-b overflow-x-auto">
        <div className="flex">
          <button
            onClick={() => setAnsicht('alle')}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
              ansicht === 'alle' ? 'border-ping-gold-dark bg-ping-gold-dark text-white' : 'border-transparent text-ping-gold-dark bg-ping-gold-light/40'
            }`}
          >
            Gesamt
          </button>
          <button
            onClick={() => setAnsicht('karte')}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
              ansicht === 'karte' ? 'border-ping-gold-dark bg-ping-gold-dark text-white' : 'border-transparent bg-ping-blue-light text-ping-blue'
            }`}
          >
            Karte
          </button>
          {protokolle.map(p => {
            const isDraft = (p as typeof p & { _neu?: boolean })._neu;
            return (
              <button
                key={p.Id}
                ref={ansicht === 'einzeln' && gewaehltesProt?.Id === p.Id ? activeTabRef : undefined}
                onClick={() => { setAnsicht('einzeln'); ladeElemente(p); }}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
                  ansicht === 'einzeln' && gewaehltesProt?.Id === p.Id
                    ? isDraft ? 'border-green-600 bg-green-600 text-white' : 'border-ping-blue bg-ping-blue text-white'
                    : isDraft ? 'border-transparent text-green-600' : 'border-transparent text-gray-500'
                }`}
              >
                {p.Nummer < 0
                  ? p.Name.replace(/\s*-?\d+\s*[-–]\s*\d+$/, '').trim() || p.Name
                  : <>Nr. {p.Nummer}<span className="text-gray-400 ml-1">{new Date(p.Datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></>
                }
                {isDraft && <span className="text-green-500 ml-0.5">*</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      <div className="px-2 py-1.5 bg-white border-b flex gap-1.5 items-center">
        <input
          type="text"
          placeholder="Text suchen..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue"
        />
        {[null, 10, 11, 20, 0].map(s => (
          <button
            key={String(s)}
            onClick={() => setStatusFilter(s)}
            className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
              statusFilter === s ? 'bg-ping-blue text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {s === null ? 'Alle' : s === 10 ? 'Offen' : s === 11 ? 'Mängel' : s === 20 ? 'Erledigt' : 'Neu'}
          </button>
        ))}
      </div>

      {/* Protokollkopf */}
      {ansicht === 'alle' && (
        <div className="px-3 py-1.5 bg-ping-blue-light border-b text-xs text-gray-600 font-medium">
          Gesamtprotokoll
        </div>
      )}
      {ansicht === 'einzeln' && aktivProt && (
        <div className="px-3 py-1.5 bg-ping-blue-light border-b text-xs text-gray-600">
          <span className="font-medium">{aktivProt.Name}</span> &middot; {new Date(aktivProt.Datum).toLocaleDateString('de-DE')} &middot; {aktivProt.Ort} &middot; {aktivProt.Autor}
          {aktivProt.Erledigt && <span className="ml-2 text-green-600 font-medium">erledigt</span>}
        </div>
      )}

      {/* Änderungsübersicht */}
      {zeigeAenderungen && (
        <div className="bg-orange-50 border-b border-orange-200 max-h-[40vh] overflow-auto">
          <div className="px-3 py-1.5 flex items-center justify-between sticky top-0 bg-orange-50">
            <span className="text-xs font-medium text-orange-800">
              {anzahlGeaendert} geändert, {anzahlNeu} neu
            </span>
            <button onClick={() => setZeigeAenderungen(false)} className="text-orange-400 hover:text-orange-600 text-sm px-1">×</button>
          </div>
          {alleElemente.filter(e => e._geaendert || e._neu).map(elem => {
            const st = STATUS_MAP[elem.Status];
            return (
              <button
                key={elem.Id}
                onClick={() => {
                  const prot = protokolle.find(p => p.Id === elem.ProtokollId) || aktivProt;
                  if (prot) handleSelectElement(elem, prot, gruppe, undefined);
                  setZeigeAenderungen(false);
                }}
                className="w-full text-left px-3 py-1.5 border-t border-orange-100 hover:bg-orange-100 flex items-center gap-2"
              >
                <span className="text-[10px] font-mono text-gray-400 w-8 shrink-0">{elem.Position}</span>
                {elem._neu && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded shrink-0">+neu</span>}
                {elem._geaendert && !elem._neu && <span className="text-[9px] bg-orange-100 text-orange-700 px-1 rounded shrink-0">*</span>}
                {st && <span className={`text-[9px] px-1 rounded shrink-0 ${st.css}`}>{st.label}</span>}
                <span className="text-xs text-gray-700 truncate">{elem.Positionstext?.slice(0, 60) || elem.Positionstitel || '—'}</span>
                <span className="text-[9px] text-gray-400 shrink-0 ml-auto">{elem._protName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Kartenansicht oder Tabelle */}
      {ansicht === 'karte' ? (
        <MapOverview
          elemente={aktuelleElemente}
          onElementClick={(elem) => aktivProt && handleSelectElement(elem, protokolle.find(p => p.Id === elem.ProtokollId) || aktivProt, gruppe, aktuelleElemente.map(e => e.Id))}
          onRefresh={laden}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-gray-200">
            {aktuelleElemente.map((elem) => {
              const st = STATUS_MAP[elem.Status];
              const ueberfaellig = elem.Termin && [0, 10].includes(elem.Status) && new Date(elem.Termin) < new Date(new Date().toDateString());
              return (
                <button
                  key={elem.Id}
                  onClick={() => aktivProt && handleSelectElement(elem, ansicht === 'einzeln' ? aktivProt : protokolle.find(p => p.Id === elem.ProtokollId) || aktivProt, gruppe, aktuelleElemente.map(e => e.Id))}
                  className="w-full text-left px-3 py-3 hover:bg-ping-blue-light active:bg-ping-blue-light flex gap-3"
                >
                  {/* Linke Spalte: Position + Thema + Badges */}
                  <div className="w-24 shrink-0">
                    <div className={`text-base font-mono font-semibold ${elem.MobileErfassung?.GeoLat != null ? 'text-ping-blue' : 'text-gray-500'}`}>
                      {elem.Position}
                    </div>
                    <div className="text-sm text-gray-500 leading-tight mt-0.5">{elem.Thema || '-'}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {(elem.Verweise?.length > 0) && <span className="text-amber-500 text-sm">↩</span>}
                      {elem._neu && <span className="text-sm bg-green-100 text-green-700 px-1.5 rounded">+neu</span>}
                      {elem._geaendert && !elem._neu && <span className="text-sm bg-orange-100 text-orange-700 px-1.5 rounded">*</span>}
                    </div>
                  </div>

                  {/* Mitte: Positionstext (dreizeilig) */}
                  <div className="flex-1 min-w-0">
                    <div className="text-base text-gray-800 leading-snug line-clamp-3">
                      {elem.Positionstext || elem.Positionstitel || '—'}
                    </div>
                  </div>

                  {/* Rechte Spalte: Status + Termin + Verantwortlich */}
                  <div className="w-24 shrink-0 text-right">
                    {st && (
                      <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${st.css}`}>
                        {st.label}
                      </span>
                    )}
                    <div className={`text-sm mt-1 ${ueberfaellig ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {elem.Termin ? new Date(elem.Termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5 truncate">
                      {elem.VerantwortlicherFirmaName || ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {aktuelleElemente.length === 0 && (
            <p className="text-center text-gray-400 py-6 text-sm">Keine Elemente gefunden.</p>
          )}
        </div>
      )}

      {/* FABs */}
      {aktivProt && gruppe && (
        <div className="fixed bottom-4 right-4 flex flex-row gap-2 items-center">
          {hatBautagebuch && onBautagebuch && (
            <button
              onClick={() => {
                saveState();
                onBautagebuch(gruppe);
              }}
              className="bg-amber-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-amber-700 active:bg-amber-700 text-sm font-bold flex items-center justify-center"
            >
              BT
            </button>
          )}
          {onSchnellErstellung && (
            <button
              onClick={async () => {
                const prot = aktivProt.Nummer < 0 ? aktivProt : await getOrCreateDraftProtokoll(gruppe.Id, {
                  Name: aktivProt.Name, Ort: aktivProt.Ort, Autor: aktivProt.Autor,
                });
                saveState();
                onSchnellErstellung(prot, gruppe);
              }}
              className="bg-purple-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-purple-700 active:bg-purple-700 text-lg flex items-center justify-center"
            >
              &#9889;
            </button>
          )}
          <button
            onClick={async () => {
              const prot = aktivProt.Nummer < 0 ? aktivProt : await getOrCreateDraftProtokoll(gruppe.Id, {
                Name: aktivProt.Name, Ort: aktivProt.Ort, Autor: aktivProt.Autor,
              });
              handleNeuesElement(prot, gruppe);
            }}
            className="bg-ping-blue text-white w-14 h-14 rounded-full shadow-lg hover:bg-ping-blue-dark active:bg-ping-blue-dark text-xl font-light flex items-center justify-center"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}
