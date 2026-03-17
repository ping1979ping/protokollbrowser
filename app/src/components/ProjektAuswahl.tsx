import { useEffect, useState } from 'react';
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

  async function laden() {
    const gruppen = await getAllGruppen();
    const infos: ProjektInfo[] = [];
    for (const grp of gruppen) {
      const prots = await getProtokolleByGruppe(grp.Id);
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
        {projekte.map(p => (
          <div key={p.gruppe.Id} className="flex items-stretch bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              onClick={() => onSelect(p.gruppe.Id)}
              className="flex-1 text-left p-4 hover:bg-ping-blue-light active:bg-ping-blue-light transition"
            >
              <p className="font-medium text-ping-text">{p.gruppe.ProjektName}</p>
              <p className="text-sm text-ping-text-mid mt-0.5">
                {p.gruppe.Name} &middot; {p.anzahlProtokolle} Protokoll{p.anzahlProtokolle !== 1 ? 'e' : ''}
              </p>
              <p className="text-xs text-ping-text-light mt-0.5">Projekt {p.gruppe.ProjektId}</p>
            </button>
            <button
              onClick={() => handleDelete(p.gruppe.Id, p.gruppe.ProjektName)}
              className="px-3 text-red-400 hover:text-red-600 hover:bg-red-50 transition text-lg"
              title="Projekt löschen"
            >
              &times;
            </button>
          </div>
        ))}
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
