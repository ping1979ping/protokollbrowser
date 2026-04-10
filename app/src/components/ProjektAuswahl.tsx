import { useEffect, useMemo, useState } from 'react';
import type { Protokollgruppe } from '../types';
import { getAllGruppen, getProtokolleByGruppe, clearProjekt } from '../db';
import logo from '../assets/ping-logo.png';

interface Props {
  onSelect: (gruppeId: string) => void;
  onZurueck: () => void;
  onNeuesImport?: () => void;
}

interface ProjektInfo {
  gruppe: Protokollgruppe;
  anzahlProtokolle: number;
}

export default function ProjektAuswahl({ onSelect, onZurueck, onNeuesImport }: Props) {
  const [projekte, setProjekte] = useState<ProjektInfo[]>([]);
  const [suchtext, setSuchtext] = useState('');

  const gefiltert = useMemo(() => {
    if (!suchtext.trim()) return projekte;
    const s = suchtext.toLowerCase();
    return projekte.filter(p =>
      (p.gruppe.projekt_name || '').toLowerCase().includes(s) ||
      (p.gruppe.projekt_nummer || '').toLowerCase().includes(s) ||
      (p.gruppe.name || '').toLowerCase().includes(s)
    );
  }, [projekte, suchtext]);

  async function laden() {
    const gruppen = await getAllGruppen();
    const infos: ProjektInfo[] = [];
    for (const grp of gruppen) {
      const prots = await getProtokolleByGruppe(grp.id);
      infos.push({ gruppe: grp, anzahlProtokolle: prots.length });
    }
    setProjekte(infos);
  }

  useEffect(() => { laden(); }, []);

  async function handleDelete(gruppeId: string, projektName: string) {
    if (!confirm(`Projekt "${projektName}" wirklich löschen?\nAlle Protokolle, Elemente und Fotos dieses Projekts werden entfernt.`)) return;
    await clearProjekt(gruppeId);
    await laden();
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onZurueck} className="text-ping-blue-light hover:text-white text-sm">&larr; Import</button>
          <span className="bg-white rounded-lg px-3 py-1.5 inline-flex items-center"><img src={logo} alt="PING" className="h-16" /></span>
        </div>
        <h1 className="text-lg font-bold mt-1">Projektauswahl</h1>
      </div>
      <div className="p-3 space-y-2">
        <input
          type="text"
          value={suchtext}
          onChange={e => setSuchtext(e.target.value)}
          placeholder="Projektnummer oder Name suchen..."
          className="w-full border-2 border-gray-300 rounded-lg text-sm px-3 py-2 focus:border-ping-blue focus:outline-none"
        />
        {gefiltert.map(p => (
          <div key={p.gruppe.id} className="flex items-stretch bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => onSelect(p.gruppe.id)}
              className="flex-1 text-left p-4 hover:bg-ping-blue-light active:bg-ping-blue-light transition"
            >
              <p className="font-medium text-ping-text">{p.gruppe.projekt_name}</p>
              <p className="text-sm text-ping-text-mid mt-0.5">
                {p.gruppe.name} &middot; {p.anzahlProtokolle} Protokoll{p.anzahlProtokolle !== 1 ? 'e' : ''}
              </p>
              <p className="text-xs text-ping-text-light mt-0.5">Projekt {p.gruppe.projekt_nummer}</p>
            </button>
            <button
              onClick={() => handleDelete(p.gruppe.id, p.gruppe.projekt_name)}
              className="px-3 text-red-400 hover:text-red-600 hover:bg-red-50 transition text-lg"
              title="Projekt löschen"
            >
              &times;
            </button>
          </div>
        ))}
        {gefiltert.length === 0 && suchtext.trim() && (
          <p className="text-center text-ping-text-light py-8">Keine Treffer für &ldquo;{suchtext}&rdquo;</p>
        )}
        {projekte.length === 0 && (
          <p className="text-center text-ping-text-light py-8">Keine Projekte geladen.</p>
        )}
        {onNeuesImport && (
          <button
            onClick={onNeuesImport}
            className="w-full bg-ping-blue-light text-ping-blue py-3 px-4 rounded-xl font-medium hover:bg-ping-blue hover:text-white transition mt-4"
          >
            + Neues Projekt laden
          </button>
        )}
      </div>
    </div>
  );
}
