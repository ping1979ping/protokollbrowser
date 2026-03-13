import { useEffect, useState } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { getProtokolleByGruppe, getElemente, getProtokollgruppe } from '../db';

interface Props {
  gruppeId: string;
  onSelectElement: (element: Protokollelement, protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onNeuesElement: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onExport: (protokoll: Protokoll, gruppe: Protokollgruppe) => void;
  onZurueck: () => void;
}

export default function ProtokollUebersicht({ gruppeId, onSelectElement, onNeuesElement, onExport, onZurueck }: Props) {
  const [gruppe, setGruppe] = useState<Protokollgruppe | null>(null);
  const [protokolle, setProtokolle] = useState<Protokoll[]>([]);
  const [gewaehltesProt, setGewaehltesProt] = useState<Protokoll | null>(null);
  const [elemente, setElemente] = useState<Protokollelement[]>([]);
  const [alleElemente, setAlleElemente] = useState<(Protokollelement & { _protName: string })[]>([]);
  const [ansicht, setAnsicht] = useState<'alle' | 'einzeln'>('einzeln');
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  useEffect(() => { laden(); }, []);

  async function laden() {
    const grp = await getProtokollgruppe(gruppeId);
    if (!grp) return;
    setGruppe(grp);
    const prots = await getProtokolleByGruppe(gruppeId);
    prots.sort((a, b) => b.Nummer - a.Nummer);
    setProtokolle(prots);
    if (prots.length > 0) {
      await ladeElemente(prots[0]);
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

  const aktuelleElemente = ansicht === 'alle' ? filtern(alleElemente) : filtern(elemente);
  const aktivProt = gewaehltesProt || protokolle[0];

  if (!gruppe) return <div className="p-6 text-gray-500">Laden...</div>;

  return (
    <div className="min-h-screen bg-ping-bg flex flex-col">
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onZurueck} className="text-ping-blue-light hover:text-white text-sm">&larr; Projekte</button>
          {aktivProt && (
            <button
              onClick={() => onExport(aktivProt, gruppe)}
              className="bg-ping-blue-dark hover:bg-ping-blue px-3 py-1 rounded-lg text-xs"
            >
              Export
            </button>
          )}
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
              ansicht === 'alle' ? 'border-ping-blue text-ping-blue' : 'border-transparent text-gray-500'
            }`}
          >
            Gesamt
          </button>
          {protokolle.map(p => (
            <button
              key={p.Id}
              onClick={() => { setAnsicht('einzeln'); ladeElemente(p); }}
              className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 ${
                ansicht === 'einzeln' && gewaehltesProt?.Id === p.Id
                  ? 'border-ping-blue text-ping-blue'
                  : 'border-transparent text-gray-500'
              }`}
            >
              Nr. {p.Nummer}
              <span className="text-gray-400 ml-1">
                {new Date(p.Datum).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="px-2 py-1.5 bg-white border-b flex gap-1.5 items-center">
        <input
          type="text"
          placeholder="Positionstext suchen..."
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

      {/* Protokollkopf (nur bei Einzelansicht) */}
      {ansicht === 'einzeln' && aktivProt && (
        <div className="px-3 py-1.5 bg-ping-blue-light border-b text-xs text-gray-600">
          {new Date(aktivProt.Datum).toLocaleDateString('de-DE')} &middot; {aktivProt.Ort} &middot; {aktivProt.Autor}
          {aktivProt.Erledigt && <span className="ml-2 text-green-600 font-medium">erledigt</span>}
        </div>
      )}

      {/* Tabelle */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%] hidden sm:table-column" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-gray-100 sticky top-0">
            <tr className="text-left text-gray-500">
              <th className="px-2 py-1.5 font-medium">Pos.</th>
              <th className="px-1 py-1.5 font-medium">Thema</th>
              <th className="px-1 py-1.5 font-medium">Positionstext</th>
              <th className="px-1 py-1.5 font-medium">Status</th>
              <th className="px-1 py-1.5 font-medium">Termin</th>
              <th className="px-1 py-1.5 font-medium hidden sm:table-cell">Bemerkung</th>
              <th className="px-1 py-1.5 font-medium">Verantw.</th>
            </tr>
          </thead>
          <tbody>
            {aktuelleElemente.map((elem) => {
              const st = STATUS_MAP[elem.Status];
              return (
                <tr
                  key={elem.Id}
                  onClick={() => aktivProt && onSelectElement(elem, ansicht === 'einzeln' ? aktivProt : protokolle.find(p => p.Id === elem.ProtokollId) || aktivProt, gruppe)}
                  className="border-b border-gray-100 hover:bg-ping-blue-light active:bg-ping-blue-light cursor-pointer"
                >
                  <td className="px-2 py-1.5 font-mono text-gray-400">{elem.Position}</td>
                  <td className="px-1 py-1.5 text-gray-600 text-[10px] leading-tight break-all overflow-hidden">{elem.Thema || '-'}</td>
                  <td className="px-1 py-1.5 text-gray-800">
                    <div className="leading-tight line-clamp-2">{elem.Positionstext || elem.Positionstitel || '—'}</div>
                    {elem._geaendert && <span className="text-orange-500 font-medium"> *</span>}
                    {elem._neu && <span className="text-green-600 font-medium"> +neu</span>}
                    {(elem.Verweise?.length > 0) && <span className="text-amber-500"> ↩</span>}
                  </td>
                  <td className="px-1 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium leading-tight ${st?.css || 'bg-gray-100'}`}>
                      {st?.label || elem.Status}
                    </span>
                  </td>
                  <td className="px-1 py-1.5 text-gray-500 whitespace-nowrap">
                    {elem.Termin ? new Date(elem.Termin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '-'}
                  </td>
                  <td className="px-1 py-1.5 text-gray-400 hidden sm:table-cell truncate">
                    {elem.Bemerkung || '-'}
                  </td>
                  <td className="px-1 py-1.5 text-gray-600 truncate max-w-[80px]">{elem.VerantwortlicherFirmaName || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {aktuelleElemente.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Keine Elemente gefunden.</p>
        )}
      </div>

      {/* FAB */}
      {aktivProt && (
        <button
          onClick={() => onNeuesElement(aktivProt, gruppe)}
          className="fixed bottom-4 right-4 bg-ping-blue text-white w-12 h-12 rounded-full shadow-lg hover:bg-ping-blue-dark active:bg-ping-blue-dark text-xl font-light flex items-center justify-center"
        >
          +
        </button>
      )}
    </div>
  );
}
