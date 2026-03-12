import { useEffect, useState } from 'react';
import type { Protokollgruppe } from '../types';
import { getAllGruppen, getProtokolleByGruppe } from '../db';
import logo from '../assets/ping-logo.png';

interface Props {
  onSelect: (gruppeId: string) => void;
  onZurueck: () => void;
}

interface ProjektInfo {
  gruppe: Protokollgruppe;
  anzahlProtokolle: number;
}

export default function ProjektAuswahl({ onSelect, onZurueck }: Props) {
  const [projekte, setProjekte] = useState<ProjektInfo[]>([]);

  useEffect(() => {
    (async () => {
      const gruppen = await getAllGruppen();
      const infos: ProjektInfo[] = [];
      for (const grp of gruppen) {
        const prots = await getProtokolleByGruppe(grp.Id);
        infos.push({ gruppe: grp, anzahlProtokolle: prots.length });
      }
      setProjekte(infos);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onZurueck} className="text-ping-blue-light hover:text-white text-sm">&larr; Import</button>
          <img src={logo} alt="PING" className="h-6 invert" />
        </div>
        <h1 className="text-lg font-bold mt-1">Projektauswahl</h1>
      </div>
      <div className="p-3 space-y-2">
        {projekte.map(p => (
          <button
            key={p.gruppe.Id}
            onClick={() => onSelect(p.gruppe.Id)}
            className="w-full text-left bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition border border-gray-100 active:bg-ping-blue-light"
          >
            <p className="font-medium text-ping-text">{p.gruppe.ProjektName}</p>
            <p className="text-sm text-ping-text-mid mt-0.5">
              {p.gruppe.Name} &middot; {p.anzahlProtokolle} Protokoll{p.anzahlProtokolle !== 1 ? 'e' : ''}
            </p>
            <p className="text-xs text-ping-text-light mt-0.5">Projekt {p.gruppe.ProjektId}</p>
          </button>
        ))}
        {projekte.length === 0 && (
          <p className="text-center text-ping-text-light py-8">Keine Projekte geladen.</p>
        )}
      </div>
    </div>
  );
}
