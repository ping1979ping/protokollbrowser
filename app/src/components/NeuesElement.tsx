import { useState, useRef } from 'react';
import type { Protokoll, Protokollelement } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, saveFoto } from '../db';

interface Props {
  protokoll: Protokoll;
  vorgaenger?: Protokollelement;
  onBack: () => void;
  onSaved: () => void;
}

const SCHNELLTYPEN = [
  { label: 'Allgemein', thema: '', status: 0 },
  { label: 'Mangel', thema: 'Mangel', status: 11 },
  { label: 'Info', thema: 'Info', status: 0 },
];

const AENDERBARE_STATUS = [0, 10, 19, 20, 11, 25];

export default function NeuesElement({ protokoll, vorgaenger, onBack, onSaved }: Props) {
  const [typ, setTyp] = useState(vorgaenger?.Thema === 'Mangel' ? 1 : 0);
  const [position, setPosition] = useState('');
  const [thema, setThema] = useState(vorgaenger?.Thema || SCHNELLTYPEN[0].thema);
  const [positionstext, setPositionstext] = useState('');
  const [status, setStatus] = useState(vorgaenger?.Thema === 'Mangel' ? 11 : 0);
  const [termin, setTermin] = useState('');
  const [verantwFirmaOid, setVerantwFirmaOid] = useState(vorgaenger?.VerantwortlicherFirmaOid || protokoll.Teilnehmer[0]?.Oid || '');
  const [bemerkung, setBemerkung] = useState('');
  const [titel, setTitel] = useState('');
  const [geoText, setGeoText] = useState('');
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLon, setGeoLon] = useState<number | null>(null);
  const [geoAcc, setGeoAcc] = useState<number | null>(null);
  const [tempFotos, setTempFotos] = useState<File[]>([]);
  const fotoRef = useRef<HTMLInputElement>(null);

  const alleFirmen = [
    ...protokoll.Teilnehmer,
    ...protokoll.Verteiler.filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid)),
  ];

  function schnelltyp(i: number) {
    setTyp(i);
    setThema(SCHNELLTYPEN[i].thema);
    setStatus(SCHNELLTYPEN[i].status);
  }

  function gpsErfassen() {
    if (!navigator.geolocation) { alert('GPS nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        setGeoLat(lat); setGeoLon(lon); setGeoAcc(acc);
        setGeoText(`${lat.toFixed(7)}, ${lon.toFixed(7)} (${acc} m)`);
      },
      (err) => alert('GPS-Fehler: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function speichern() {
    if (!positionstext.trim()) { alert('Bitte Positionstext eingeben.'); return; }

    // Position: manuell oder auto-generiert
    let pos = position.trim();
    if (!pos) {
      const bestehende = await getElemente(protokoll.Id);
      const maxPos = bestehende.reduce((max, e) => {
        const num = parseFloat(e.Position);
        return num > max ? num : max;
      }, 0);
      pos = `${Math.floor(maxPos) + 1}`;
    }

    const verantw = alleFirmen.find(t => t.Oid === verantwFirmaOid);
    const elemId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Fotos speichern
    const fotoRefs = [];
    for (let i = 0; i < tempFotos.length; i++) {
      const fotoId = `foto-${Date.now()}-${i}`;
      const fileName = `PE-${elemId.replace(/[^a-zA-Z0-9]/g, '')}_${String(i + 1).padStart(3, '0')}.jpg`;
      await saveFoto(fotoId, elemId, tempFotos[i], fileName);
      fotoRefs.push({ FileName: fileName, RelativePath: `photos/${fileName}`, ZielPfad: '' });
    }

    // Verweise: wenn Nachfolger, dann OID des Vorgängers
    const verweise: string[] = vorgaenger ? [vorgaenger.Id] : [];

    const neuesElem: Protokollelement = {
      Id: elemId,
      ProtokollId: protokoll.Id,
      Position: pos,
      Positionstitel: titel,
      Positionstext: positionstext,
      Thema: thema,
      Status: status,
      Termin: termin ? termin + 'T00:00:00' : '',
      VerantwortlicherFirmaOid: verantw?.Oid || '',
      VerantwortlicherFirmaName: verantw?.Name || '',
      Bemerkung: bemerkung,
      Erinnerung: false,
      Wert: 0,
      Verweise: verweise,
      MobileErfassung: {
        GeoLat: geoLat, GeoLon: geoLon, GeoAccuracy: geoAcc,
        GeoText: geoText || null, Fotos: fotoRefs,
      },
      _neu: true,
    };

    await addElement(neuesElem);
    onSaved();
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-3">
        <button onClick={onBack} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurück</button>
        <h1 className="text-base font-bold mt-1">
          {vorgaenger ? 'Nachfolger erstellen' : 'Neues Element'}
        </h1>
        {vorgaenger && (
          <p className="text-xs text-ping-blue-light mt-0.5">
            Vorgänger: Pos. {vorgaenger.Position} — {vorgaenger.Positionstext.slice(0, 50)}...
          </p>
        )}
      </div>

      <div className="p-3 space-y-2.5">
        {/* Schnelltyp */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-1.5">Schnelltyp</label>
          <div className="flex gap-1.5">
            {SCHNELLTYPEN.map((s, i) => (
              <button key={s.label} onClick={() => schnelltyp(i)}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition ${
                  typ === i
                    ? i === 1 ? 'bg-red-100 text-red-700 ring-2 ring-red-400' : 'bg-ping-blue-light text-ping-blue ring-2 ring-ping-blue'
                    : 'bg-gray-50 text-gray-500'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position + Thema */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Position (leer = auto)</label>
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="z.B. 4.1"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Thema</label>
            <input type="text" value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z.B. Tiefbau"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
        </div>

        {/* Positionstext = Haupteingabefeld */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Positionstext *</label>
          <textarea value={positionstext} onChange={(e) => setPositionstext(e.target.value)} rows={3}
            placeholder="Beschreibung des Punktes..."
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase mb-1.5 block">Status</label>
          <div className="flex gap-1 flex-wrap">
            {AENDERBARE_STATUS.map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                }`}>
                {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Termin + Verantwortlicher */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Termin</label>
            <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Verantwortlich</label>
            <select value={verantwFirmaOid} onChange={(e) => setVerantwFirmaOid(e.target.value)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
              {alleFirmen.map(t => (
                <option key={t.Oid} value={t.Oid}>{t.Name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Bemerkung (intern)</label>
          <textarea value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} rows={2}
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
        </div>

        {/* GPS + Fotos */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-400 font-medium uppercase">GPS</label>
              <button onClick={gpsErfassen} className="bg-green-600 text-white px-2 py-0.5 rounded text-[10px]">Erfassen</button>
            </div>
            {geoText ? <p className="text-[10px] text-gray-600">{geoText}</p> : <p className="text-[10px] text-gray-300">Kein Standort</p>}
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-400 font-medium uppercase">Fotos ({tempFotos.length})</label>
              <button onClick={() => fotoRef.current?.click()} className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px]">Hinzufügen</button>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple
                onChange={(e) => { if (e.target.files) setTempFotos(prev => [...prev, ...Array.from(e.target.files!)]); }}
                className="hidden" />
            </div>
            {tempFotos.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tempFotos.map((f, i) => (
                  <div key={i} className="relative w-10 h-10">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover rounded" />
                    <button onClick={() => setTempFotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Titel (optional, ganz unten) */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Titel (optional, für Gestaltung)</label>
          <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)}
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
        </div>

        <button onClick={speichern}
          className="w-full bg-ping-blue text-white py-2.5 rounded-lg font-medium text-sm hover:bg-ping-blue-dark active:bg-ping-blue-dark transition">
          Speichern
        </button>
      </div>
    </div>
  );
}
