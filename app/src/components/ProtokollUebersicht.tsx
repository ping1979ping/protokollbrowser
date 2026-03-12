import { useEffect, useState } from 'react';
import type { Protokoll, Protokollelement } from '../types';
import { getProtokolle, getElemente } from '../db';
import StatusBadge from './StatusBadge';

interface Props {
  onSelectElement: (element: Protokollelement, protokoll: Protokoll) => void;
  onNeuesElement: (protokoll: Protokoll) => void;
  onExport: (protokoll: Protokoll) => void;
  onZurueck: () => void;
}

export default function ProtokollUebersicht({ onSelectElement, onNeuesElement, onExport, onZurueck }: Props) {
  const [protokoll, setProtokoll] = useState<Protokoll | null>(null);
  const [elemente, setElemente] = useState<Protokollelement[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  useEffect(() => { laden(); }, []);

  async function laden() {
    const prots = await getProtokolle();
    if (prots.length > 0) {
      const p = prots[0];
      setProtokoll(p);
      const elems = await getElemente(p.Id);
      elems.sort((a, b) => a.Position.localeCompare(b.Position, undefined, { numeric: true }));
      setElemente(elems);
    }
  }

  const gefilterteElemente = elemente.filter((e) => {
    if (statusFilter !== null && e.Status !== statusFilter) return false;
    if (filter) {
      const s = filter.toLowerCase();
      return (
        e.Positionstitel.toLowerCase().includes(s) ||
        e.Position.toLowerCase().includes(s) ||
        e.Thema.toLowerCase().includes(s) ||
        e.VerantwortlicherName.toLowerCase().includes(s)
      );
    }
    return true;
  });

  if (!protokoll) return <div className="p-6 text-gray-500">Keine Protokolle geladen.</div>;

  const datum = new Date(protokoll.Datum).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-700 text-white p-4 pb-5">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onZurueck} className="text-blue-200 hover:text-white text-sm">&larr; Import</button>
          <button
            onClick={() => onExport(protokoll)}
            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg text-sm"
          >
            Export
          </button>
        </div>
        <h1 className="text-lg font-bold">{protokoll.Name}</h1>
        <p className="text-blue-200 text-sm">
          {datum} &middot; {protokoll.Ort} &middot; {protokoll.Autor}
        </p>
      </div>

      {/* Filter */}
      <div className="p-3 bg-white border-b space-y-2">
        <input
          type="text"
          placeholder="Suche..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <div className="flex gap-1.5 flex-wrap">
          <FilterBtn label="Alle" active={statusFilter === null} onClick={() => setStatusFilter(null)} />
          <FilterBtn label="Offen" active={statusFilter === 10} onClick={() => setStatusFilter(10)} />
          <FilterBtn label="Mängel" active={statusFilter === 11} onClick={() => setStatusFilter(11)} />
          <FilterBtn label="Erledigt" active={statusFilter === 20} onClick={() => setStatusFilter(20)} />
          <FilterBtn label="Neu" active={statusFilter === 0} onClick={() => setStatusFilter(0)} />
        </div>
      </div>

      {/* Liste */}
      <div className="p-3 space-y-2">
        {gefilterteElemente.map((elem) => (
          <button
            key={elem.Id}
            onClick={() => onSelectElement(elem, protokoll)}
            className="w-full text-left bg-white rounded-xl shadow-sm p-3 hover:shadow-md transition border border-gray-100 active:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">{elem.Position}</span>
                  <StatusBadge status={elem.Status} />
                  {elem._geaendert && <span className="text-xs text-orange-500 font-medium">geändert</span>}
                  {elem._neu && <span className="text-xs text-green-600 font-medium">neu</span>}
                </div>
                <p className="font-medium text-gray-900 text-sm truncate">{elem.Positionstitel}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {elem.VerantwortlicherName}
                  {elem.Termin && <> &middot; {new Date(elem.Termin).toLocaleDateString('de-DE')}</>}
                </p>
              </div>
              {elem.MobileErfassung.Fotos.length > 0 && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {elem.MobileErfassung.Fotos.length} Foto{elem.MobileErfassung.Fotos.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => onNeuesElement(protokoll)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg hover:bg-blue-700 active:bg-blue-800 text-2xl font-light flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition ${
        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
