import { useState } from 'react';
import type { Protokoll, Protokollelement, Teilnehmer } from '../types';
import { addElement, getElemente } from '../db';

interface Props {
  protokoll: Protokoll;
  onBack: () => void;
  onSaved: () => void;
}

const SCHNELLTYPEN = [
  { label: 'Allgemein', thema: '', status: 0 },
  { label: 'Mangel', thema: 'Mangel', status: 11 },
  { label: 'Info', thema: 'Info', status: 0 },
];

export default function NeuesElement({ protokoll, onBack, onSaved }: Props) {
  const [typ, setTyp] = useState(0);
  const [titel, setTitel] = useState('');
  const [text, setText] = useState('');
  const [termin, setTermin] = useState('');
  const [verantwOid, setVerantwOid] = useState(protokoll.Teilnehmer[0]?.Oid || '');

  const alleTeilnehmer: Teilnehmer[] = [
    ...protokoll.Teilnehmer,
    ...protokoll.Verteiler.filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid)),
  ];

  async function speichern() {
    if (!titel.trim()) {
      alert('Bitte Positionstitel eingeben.');
      return;
    }

    const bestehendeElemente = await getElemente(protokoll.Id);
    const maxPos = bestehendeElemente.reduce((max, e) => {
      const num = parseFloat(e.Position);
      return num > max ? num : max;
    }, 0);
    const neuePos = `${Math.floor(maxPos) + 1}.1`;

    const verantw = alleTeilnehmer.find(t => t.Oid === verantwOid);
    const schnell = SCHNELLTYPEN[typ];

    const neuesElem: Protokollelement = {
      Id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ProtokollId: protokoll.Id,
      Position: neuePos,
      Positionstitel: titel,
      Positionstext: text,
      Thema: schnell.thema,
      Status: schnell.status,
      Termin: termin ? termin + 'T00:00:00' : '',
      VerantwortlicherOid: verantw?.Oid || '',
      VerantwortlicherId: verantw?.Nummer || '',
      VerantwortlicherName: verantw?.Name || '',
      Bemerkung: '',
      Erinnerung: false,
      Wert: 0,
      MobileErfassung: {
        GeoLat: null,
        GeoLon: null,
        GeoAccuracy: null,
        GeoText: null,
        Notiz: null,
        Transkript: null,
        Fotos: [],
      },
      _neu: true,
    };

    await addElement(neuesElem);
    onSaved();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-700 text-white p-4">
        <button onClick={onBack} className="text-blue-200 hover:text-white text-sm">&larr; Zurück</button>
        <h1 className="text-lg font-bold mt-1">Neues Element</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Schnelltyp */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-2">Typ</label>
          <div className="flex gap-2">
            {SCHNELLTYPEN.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setTyp(i)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  typ === i
                    ? i === 1 ? 'bg-red-100 text-red-700 ring-2 ring-red-400'
                    : 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Titel */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Positionstitel *</label>
          <input
            type="text"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="z.B. Riss in Fassade Gebäude A"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Text */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Positionstext</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
        </div>

        {/* Termin */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Termin</label>
          <input
            type="date"
            value={termin}
            onChange={(e) => setTermin(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Verantwortlicher */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Verantwortlicher</label>
          <select
            value={verantwOid}
            onChange={(e) => setVerantwOid(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {alleTeilnehmer.map(t => (
              <option key={t.Oid} value={t.Oid}>{t.Name}{t.Rolle ? ` (${t.Rolle})` : ''}</option>
            ))}
          </select>
        </div>

        <button
          onClick={speichern}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 active:bg-blue-800 transition"
        >
          Speichern
        </button>
      </div>
    </div>
  );
}
