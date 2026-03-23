import { useState, useRef, useEffect } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from './map/mapUtils';
import BautagebuchWizard from './BautagebuchWizard';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  vorgaenger?: Protokollelement;
  clone?: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string };
  isBautagebuch?: boolean;
  onBack: () => void;
  onSaved: () => void;
  onSavedAndNew?: () => void;
  onSavedAndClone?: (clone: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string }) => void;
}

const SCHNELLTYPEN = [
  { label: 'Allgemein', thema: '', status: 0 },
  { label: 'Mangel', thema: 'Mangel', status: 11 },
  { label: 'Info', thema: 'Info', status: 0 },
];

const HAUPT_STATUS = [0, 10, 20];
const WEITERE_STATUS = [19, 11, 25, 17, 21];

/**
 * Erkennt das Positions-Nummernschema im Bautagebuch-Protokoll und setzt fort.
 * Beispiele: "1","2","3" → "4" | "BT-001","BT-002" → "BT-003" | "1.1","1.2" → "1.3"
 */
function naechsteBtPosition(elems: { Position: string }[]): string {
  if (elems.length === 0) return '1';

  const positionen = elems.map(e => e.Position).filter(Boolean);
  positionen.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const letzte = positionen[positionen.length - 1];

  // Pattern: Prefix + Zahl (evtl. mit führenden Nullen)
  const match = letzte.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + 1;
    // Führende Nullen beibehalten
    const padded = String(nextNum).padStart(numStr.length, '0');
    return prefix + padded;
  }

  // Fallback: rein numerisch max + 1
  let maxNum = 0;
  for (const p of positionen) {
    const n = parseFloat(p);
    if (n > maxNum) maxNum = n;
  }
  return `${Math.floor(maxNum) + 1}`;
}

export default function NeuesElement({ protokoll, gruppe, vorgaenger, clone, isBautagebuch, onBack, onSaved, onSavedAndNew, onSavedAndClone }: Props) {
  const [typ, setTyp] = useState(clone ? (clone.thema === 'Mangel' ? 1 : 0) : vorgaenger?.Thema === 'Mangel' ? 1 : 0);
  const [position, setPosition] = useState('');
  const [thema, setThema] = useState(clone?.thema ?? vorgaenger?.Thema ?? SCHNELLTYPEN[0].thema);
  const [positionstext, setPositionstext] = useState('');
  const [status, setStatus] = useState(clone?.status ?? (isBautagebuch ? 20 : vorgaenger?.Thema === 'Mangel' ? 11 : 0));
  const [termin, setTermin] = useState(clone?.termin ?? '');
  const [verantwFirmaOid, setVerantwFirmaOid] = useState(clone?.verantwOid ?? vorgaenger?.VerantwortlicherFirmaOid ?? '');
  const [bemerkung, setBemerkung] = useState('');
  const [titel, setTitel] = useState('');
  const [geoText, setGeoText] = useState(clone?.geoText ?? vorgaenger?.MobileErfassung.GeoText ?? '');
  const [geoLat, setGeoLat] = useState<number | null>(clone?.geoLat ?? vorgaenger?.MobileErfassung.GeoLat ?? null);
  const [geoLon, setGeoLon] = useState<number | null>(clone?.geoLon ?? vorgaenger?.MobileErfassung.GeoLon ?? null);
  const [geoAcc, setGeoAcc] = useState<number | null>(clone?.geoAcc ?? vorgaenger?.MobileErfassung.GeoAccuracy ?? null);
  const [geoHeading, setGeoHeading] = useState<number | null>(clone?.geoHeading ?? vorgaenger?.MobileErfassung.GeoHeading ?? null);
  const [karteOffen, setKarteOffen] = useState(false);
  const [tempFotos, setTempFotos] = useState<File[]>([]);
  const [firmen, setFirmen] = useState<Verantwortlicher[]>([]);
  const [themenVorschlaege, setThemenVorschlaege] = useState<string[]>([]);
  const [autoGps, setAutoGps] = useState(() => localStorage.getItem('autoGps') !== 'false');
  const [showWeitereStatus, setShowWeitereStatus] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBtWizard, setShowBtWizard] = useState(!!isBautagebuch);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);

  // Auto-GPS
  useEffect(() => {
    if (autoGps && !clone && geoLat == null && protokoll.Nummer >= 0 && navigator.geolocation) {
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

  // Auto-Kompass
  useEffect(() => {
    if (!autoGps || protokoll.Nummer < 0) return;
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
        if (result === 'granted') window.addEventListener('deviceorientation', handler as EventListener);
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
    (async () => {
      const prots = await getProtokolleByGruppe(gruppe.Id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      const themen = [...new Set(alleElems.map(e => e.Thema).filter(t => t && t !== 'Bautagebuch'))];
      themen.sort();
      setThemenVorschlaege(themen);
    })();
  }, []);

  // Kein Auto-Select der ersten Firma — Standard ist "(keine)"

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
    setDirty(true);
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

  const istWeitererStatus = WEITERE_STATUS.includes(status);
  const terminUeberfaellig = termin && [0, 10].includes(status) && new Date(termin) < new Date(new Date().toDateString());

  async function doSave(): Promise<boolean> {
    if (!positionstext.trim()) { alert('Bitte Positionstext eingeben.'); return false; }

    let pos = position.trim();
    if (!pos) {
      if (protokoll.Nummer < 0) {
        // Anhangprotokoll (BT, Mehrkosten, QM): Nummernschema innerhalb des Protokolls fortsetzen
        const protElems = await getElemente(protokoll.Id);
        pos = naechsteBtPosition(protElems);
      } else {
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
    }

    const verantw = alleFirmen.find(t => t.Oid === verantwFirmaOid);
    const elemId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Einheitliche Bild-Benennung: [ProjektNr]_[Gruppe]_[Position]_Bild_[Nr].jpg
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').replace(/_+/g, '_');
    const fotoRefs = [];
    const fotoNamen: string[] = [];
    for (let i = 0; i < tempFotos.length; i++) {
      const fotoId = `foto-${Date.now()}-${i}`;
      const fileName = `${gruppe.Protokollnummer}_${sanitize(gruppe.Name)}_${pos}_Bild_${i + 1}.jpg`;
      await saveFoto(fotoId, elemId, tempFotos[i], fileName);
      fotoRefs.push({ FileName: fileName, RelativePath: `photos/${fileName}`, ZielPfad: '' });
      fotoNamen.push(fileName);
    }

    // Bildnamen in Bemerkung anfügen
    let finalBemerkung = bemerkung;
    if (fotoNamen.length > 0) {
      const bilderText = `{Bilder: ${fotoNamen.join(', ')}}`;
      finalBemerkung = finalBemerkung.trim() ? `${finalBemerkung.trim()} ${bilderText}` : bilderText;
    }

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
      Bemerkung: finalBemerkung,
      Erinnerung: false,
      Wert: 0,
      Verweise: verweise,
      MobileErfassung: {
        GeoLat: geoLat, GeoLon: geoLon, GeoAccuracy: geoAcc,
        GeoText: geoText || null, GeoHeading: geoHeading, GeoAltitude: null, Fotos: fotoRefs,
      },
      _neu: true,
    };

    await addElement(neuesElem);
    setDirty(false);
    return true;
  }

  async function speichern() {
    if (await doSave()) onSaved();
  }

  async function speichernUndNeu() {
    if (await doSave()) {
      if (onSavedAndNew) onSavedAndNew();
      else onSaved();
    }
  }

  async function speichernUndKlonen() {
    if (await doSave()) {
      if (onSavedAndClone) {
        onSavedAndClone({
          thema, status, termin, verantwOid: verantwFirmaOid,
          geoLat, geoLon, geoAcc, geoHeading, geoText,
        });
      } else {
        onSaved();
      }
    }
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        <div className="text-center">
          <button onClick={() => {
            if (dirty && !confirm('Änderungen werden nicht gespeichert. Zur Übersicht?')) return;
            onBack();
          }} className="text-ping-blue-light hover:text-white text-xs">&larr; Übersicht</button>
          <p className="text-[10px] text-ping-blue-light/70 mt-0.5">{protokoll.Name}</p>
          <h1 className="text-base font-bold mt-0.5">
            {vorgaenger ? 'Nachfolger erstellen' : 'Neues Element'}
          </h1>
          {vorgaenger && (
            <p className="text-xs text-ping-blue-light mt-0.5">
              Vorgänger: Pos. {vorgaenger.Position} — {vorgaenger.Positionstext.slice(0, 50)}...
            </p>
          )}
        </div>
      </div>

      {/* Buttons direkt unter Header */}
      <div className="px-3 pt-2 flex gap-1.5">
        <button onClick={speichern}
          className={`flex-[2] py-2.5 rounded-lg font-bold text-white text-xs transition ${
            dirty ? 'bg-red-500 hover:bg-red-600' : 'bg-ping-blue hover:bg-ping-blue-dark'
          }`}>
          Speichern
        </button>
        <button onClick={speichernUndNeu}
          className="flex-1 py-2.5 rounded-lg font-medium text-xs transition bg-gray-200 text-gray-700 hover:bg-gray-300">
          & Neu
        </button>
        <button onClick={speichernUndKlonen}
          className="flex-1 py-2.5 rounded-lg font-medium text-xs transition bg-gray-200 text-gray-700 hover:bg-gray-300">
          & Klonen
        </button>
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

        {/* Positionstext */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Positionstext *</label>
          <textarea value={positionstext} onChange={(e) => { setPositionstext(e.target.value); setDirty(true); }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            placeholder="Beschreibung des Punktes..."
            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none min-h-[9rem] max-h-[50vh] overflow-auto" />
        </div>

        {/* Status — Neu/Offen/Erledigt direkt, Rest unter "..." */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase mb-1.5 block">Status</label>
          <div className="flex gap-1 flex-wrap">
            {HAUPT_STATUS.map(s => (
              <button key={s} onClick={() => { setStatus(s); setShowWeitereStatus(false); }}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                }`}>
                {STATUS_MAP[s].label}
              </button>
            ))}
            <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                istWeitererStatus && !showWeitereStatus ? STATUS_MAP[status].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
              }`}>
              {istWeitererStatus && !showWeitereStatus ? STATUS_MAP[status].label : '...'}
            </button>
          </div>
          {showWeitereStatus && (
            <div className="flex gap-1 flex-wrap mt-1.5 pt-1.5 border-t border-gray-100">
              {WEITERE_STATUS.map(s => STATUS_MAP[s] && (
                <button key={s} onClick={() => { setStatus(s); setShowWeitereStatus(false); }}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Position / Thema / Termin in einer Zeile */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Position</label>
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="auto"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Thema</label>
            <select value={themenVorschlaege.includes(thema) ? thema : '__custom'}
              onChange={(e) => {
                if (e.target.value === '__custom') {
                  const val = prompt('Neues Thema eingeben:', thema);
                  if (val != null) setThema(val);
                } else {
                  setThema(e.target.value);
                }
              }}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
              {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__custom">{thema && !themenVorschlaege.includes(thema) ? `✎ ${thema}` : '✎ Anderes...'}</option>
            </select>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Termin</label>
            <input type="date" value={termin} onChange={(e) => { setTermin(e.target.value); setDirty(true); }}
              className={`w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue ${terminUeberfaellig ? 'text-red-600 font-semibold' : ''}`} />
          </div>
        </div>

        {/* Verantwortlich */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Verantwortlich</label>
          <select value={verantwFirmaOid} onChange={(e) => setVerantwFirmaOid(e.target.value)}
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
            <option value=""></option>
            {alleFirmen.map(t => (
              <option key={t.Oid} value={t.Oid}>{t.Name}</option>
            ))}
          </select>
        </div>

        {/* GPS */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-gray-400 font-medium uppercase">GPS-Standort</label>
            <div className="flex gap-1">
              <button onClick={gpsErfassen} className="bg-green-600 text-white px-2 py-0.5 rounded text-[10px]">Erfassen</button>
              <button onClick={() => setKarteOffen(true)} className="bg-ping-blue text-white px-2 py-0.5 rounded text-[10px]">Karte</button>
              {geoLat != null && (
                <button onClick={() => { setGeoLat(null); setGeoLon(null); setGeoAcc(null); setGeoHeading(null); setGeoText(''); }}
                  className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px]">Löschen</button>
              )}
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
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoGps ? 'translate-x-[1.35rem]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Fotos */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-gray-400 font-medium uppercase">Fotos ({tempFotos.length})</label>
            <div className="flex gap-1">
              <button onClick={() => fotoRef.current?.click()} className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px] flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>Foto</button>
              <button onClick={() => galerieRef.current?.click()} className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">Galerie</button>
            </div>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment"
              onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); fotoRef.current!.value = ''; } }}
              className="hidden" />
            <input ref={galerieRef} type="file" accept="image/*" multiple
              onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); } }}
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

        {/* Bemerkung (intern) — unten */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Bemerkung (intern)</label>
          <textarea value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} rows={2}
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
        </div>

        {/* Titel — ganz unten */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Titel (optional, für Gestaltung)</label>
          <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)}
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
        </div>
      </div>

      {/* Bautagebuch Wizard */}
      {showBtWizard && (
        <BautagebuchWizard
          gruppe={gruppe}
          onUebernehmen={(result) => {
            setPositionstext(result.positionstext);
            setThema('Bautagebuch');
            setTermin(result.datum);
            if (result.geoLat != null) {
              setGeoLat(result.geoLat);
              setGeoLon(result.geoLon);
              setGeoAcc(result.geoAcc);
              setGeoText(result.geoLat != null ? `${result.geoLat.toFixed(7)}, ${result.geoLon!.toFixed(7)}` : '');
            }
            setDirty(true);
            setShowBtWizard(false);
          }}
          onAbbrechen={() => {
            setShowBtWizard(false);
            if (isBautagebuch) onBack();
          }}
        />
      )}
    </div>
  );
}
