import { useState, useRef, useEffect } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from './map/mapUtils';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
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

export default function NeuesElement({ protokoll, gruppe, vorgaenger, onBack, onSaved }: Props) {
  const [typ, setTyp] = useState(vorgaenger?.Thema === 'Mangel' ? 1 : 0);
  const [position, setPosition] = useState('');
  const [thema, setThema] = useState(vorgaenger?.Thema || SCHNELLTYPEN[0].thema);
  const [positionstext, setPositionstext] = useState('');
  const [status, setStatus] = useState(vorgaenger?.Thema === 'Mangel' ? 11 : 0);
  const [termin, setTermin] = useState('');
  const [verantwFirmaOid, setVerantwFirmaOid] = useState(vorgaenger?.VerantwortlicherFirmaOid || '');
  const [bemerkung, setBemerkung] = useState('');
  const [titel, setTitel] = useState('');
  const [geoText, setGeoText] = useState(vorgaenger?.MobileErfassung.GeoText || '');
  const [geoLat, setGeoLat] = useState<number | null>(vorgaenger?.MobileErfassung.GeoLat ?? null);
  const [geoLon, setGeoLon] = useState<number | null>(vorgaenger?.MobileErfassung.GeoLon ?? null);
  const [geoAcc, setGeoAcc] = useState<number | null>(vorgaenger?.MobileErfassung.GeoAccuracy ?? null);
  const [geoHeading, setGeoHeading] = useState<number | null>(vorgaenger?.MobileErfassung.GeoHeading ?? null);
  const [karteOffen, setKarteOffen] = useState(false);
  const [tempFotos, setTempFotos] = useState<File[]>([]);
  const [firmen, setFirmen] = useState<Verantwortlicher[]>([]);
  const [themenVorschlaege, setThemenVorschlaege] = useState<string[]>([]);
  const [autoGps, setAutoGps] = useState(() => localStorage.getItem('autoGps') !== 'false');
  const fotoRef = useRef<HTMLInputElement>(null);

  // Auto-GPS: bei Erstellung automatisch aktuelle Position erfassen
  useEffect(() => {
    if (autoGps && geoLat == null && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const lat = p.coords.latitude, lon = p.coords.longitude;
          const acc = Math.round(p.coords.accuracy);
          setGeoLat(lat); setGeoLon(lon); setGeoAcc(acc);
          setGeoText(`${lat.toFixed(7)}, ${lon.toFixed(7)} (${acc} m)`);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }
  }, []);

  // Auto-Kompass: Heading automatisch erfassen wenn verfügbar
  useEffect(() => {
    if (!autoGps) return;
    if (!('DeviceOrientationEvent' in window)) return;
    let captured = false;
    const handler = (e: DeviceOrientationEvent) => {
      if (captured) return;
      if (e.alpha != null) {
        const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
        const h = Math.round(iosHeading ?? (360 - e.alpha));
        setGeoHeading(h);
        captured = true;
        window.removeEventListener('deviceorientation', handler as EventListener);
      }
    };
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DOE.requestPermission) {
      DOE.requestPermission().then((result) => {
        if (result === 'granted') {
          window.addEventListener('deviceorientation', handler as EventListener);
        }
      });
    } else {
      window.addEventListener('deviceorientation', handler as EventListener);
    }
    return () => window.removeEventListener('deviceorientation', handler as EventListener);
  }, []);

  function toggleAutoGps() {
    const next = !autoGps;
    setAutoGps(next);
    localStorage.setItem('autoGps', String(next));
  }

  useEffect(() => {
    getVerantwortliche().then(setFirmen);
    // Thema-Vorschläge aus allen Elementen der Gruppe laden
    (async () => {
      const prots = await getProtokolleByGruppe(gruppe.Id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      const themen = [...new Set(alleElems.map(e => e.Thema).filter(Boolean))];
      themen.sort();
      setThemenVorschlaege(themen);
    })();
  }, []);

  // Set default firma after loading
  useEffect(() => {
    if (!verantwFirmaOid && alleFirmen.length > 0) {
      setVerantwFirmaOid(alleFirmen[0].Oid);
    }
  }, [firmen]);

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ Oid: f.ID, Name: f.Name }))
    : [
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

    // Position: manuell oder auto-generiert (über ALLE Protokolle der Gruppe)
    let pos = position.trim();
    if (!pos) {
      const allProts = await getProtokolleByGruppe(gruppe.Id);
      let maxPos = 0;
      for (const p of allProts) {
        const elems = await getElemente(p.Id);
        for (const e of elems) {
          const num = parseFloat(e.Position);
          if (num > maxPos) maxPos = num;
        }
      }
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
        GeoText: geoText || null, GeoHeading: geoHeading, Fotos: fotoRefs,
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
            <input type="text" list="themen-liste" value={thema} onChange={(e) => setThema(e.target.value)} placeholder="z.B. Tiefbau"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            <datalist id="themen-liste">
              {themenVorschlaege.map(t => <option key={t} value={t} />)}
            </datalist>
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

        {/* Auto-GPS Toggle */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100 flex items-center justify-between">
          <div>
            <label className="text-[10px] text-gray-400 font-medium uppercase block">Auto-GPS</label>
            <p className="text-[10px] text-gray-500">Position automatisch erfassen</p>
          </div>
          <button
            onClick={toggleAutoGps}
            className={`relative w-10 h-5 rounded-full transition ${autoGps ? 'bg-green-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoGps ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* GPS + Fotos */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-400 font-medium uppercase">GPS</label>
              <div className="flex gap-1">
                <button onClick={gpsErfassen} className="bg-green-600 text-white px-2 py-0.5 rounded text-[10px]">Erfassen</button>
                <button onClick={() => setKarteOffen(true)} className="bg-ping-blue text-white px-2 py-0.5 rounded text-[10px]">Karte</button>
              </div>
            </div>
            {geoText ? <p className="text-[10px] text-gray-600">{geoText}</p> : <p className="text-[10px] text-gray-300">{autoGps ? 'Wird ermittelt...' : 'Kein Standort'}</p>}
            {karteOffen && (
              <MapEditorModal
                lat={geoLat}
                lon={geoLon}
                heading={geoHeading}
                onSave={(lat, lon, heading) => {
                  setGeoLat(lat); setGeoLon(lon); setGeoHeading(heading);
                  setGeoText(formatCoord(lat, lon, null, heading));
                  setKarteOffen(false);
                }}
                onCancel={() => setKarteOffen(false)}
              />
            )}
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
