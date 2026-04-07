import { useState, useRef, useEffect } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from './map/mapUtils';
import BautagebuchWizard from './BautagebuchWizard';
import ScrollToTopFab from './ScrollToTopFab';
import StatusBadge from './StatusBadge';

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

const HAUPT_STATUS = [0, 10, 20];
const WEITERE_STATUS = [19, 11, 25, 17, 21];

/**
 * Erkennt das Positions-Nummernschema im Bautagebuch-Protokoll und setzt fort.
 * Beispiele: "1","2","3" -> "4" | "BT-001","BT-002" -> "BT-003" | "1.1","1.2" -> "1.3"
 */
function naechsteBtPosition(elems: { position: string }[]): string {
  if (elems.length === 0) return '1';

  const positionen = elems.map(e => e.position).filter(Boolean);
  positionen.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const letzte = positionen[positionen.length - 1];

  // Pattern: Prefix + Zahl (evtl. mit fuehrenden Nullen)
  const match = letzte.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + 1;
    // Fuehrende Nullen beibehalten
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
  const [position, setPosition] = useState('');
  const [thema, setThema] = useState(clone?.thema ?? vorgaenger?.thema ?? '');
  const [positionstext, setPositionstext] = useState('');
  const [status, setStatus] = useState(clone?.status ?? (isBautagebuch ? 20 : vorgaenger?.thema === 'Mangel' ? 11 : 0));
  const [termin, setTermin] = useState(clone?.termin ?? '');
  const [verantwFirmaOid, setVerantwFirmaOid] = useState(clone?.verantwOid ?? vorgaenger?.verantwortlicher_id ?? '');
  const [bemerkung, setBemerkung] = useState('');
  const [titel, setTitel] = useState('');
  const [geoText, setGeoText] = useState(clone?.geoText ?? vorgaenger?.mobile_erfassung.geo_text ?? '');
  const [geoLat, setGeoLat] = useState<number | null>(clone?.geoLat ?? vorgaenger?.mobile_erfassung.geo_lat ?? null);
  const [geoLon, setGeoLon] = useState<number | null>(clone?.geoLon ?? vorgaenger?.mobile_erfassung.geo_lon ?? null);
  const [geoAcc, setGeoAcc] = useState<number | null>(clone?.geoAcc ?? vorgaenger?.mobile_erfassung.geo_accuracy ?? null);
  const [geoHeading, setGeoHeading] = useState<number | null>(clone?.geoHeading ?? vorgaenger?.mobile_erfassung.geo_heading ?? null);
  const [karteOffen, setKarteOffen] = useState(false);
  const [tempFotos, setTempFotos] = useState<File[]>([]);
  const [firmen, setFirmen] = useState<Verantwortlicher[]>([]);
  const [themenVorschlaege, setThemenVorschlaege] = useState<string[]>([]);
  const [autoGps, setAutoGps] = useState(() => localStorage.getItem('autoGps') === 'true');
  const [dirty, setDirty] = useState(false);
  const [showBtWizard, setShowBtWizard] = useState(!!isBautagebuch);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);

  // Auto-GPS mit BBox-Fallback
  useEffect(() => {
    if (!autoGps || clone || geoLat != null || protokoll.nummer < 0) return;

    let deviceErfolg = false;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          deviceErfolg = true;
          const lat = p.coords.latitude, lon = p.coords.longitude;
          const acc = Math.round(p.coords.accuracy);
          setGeoLat(lat); setGeoLon(lon); setGeoAcc(acc);
          setGeoText(`${lat.toFixed(7)}, ${lon.toFixed(7)} (${acc} m)`);
        },
        () => { if (!deviceErfolg) fallbackAusBbox(); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } else {
      fallbackAusBbox();
    }

    async function fallbackAusBbox() {
      const prots = await getProtokolleByGruppe(gruppe.id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      const mitGps = alleElems.filter(e => e.mobile_erfassung.geo_lat != null);
      if (mitGps.length > 0) {
        const lats = mitGps.map(e => e.mobile_erfassung.geo_lat!);
        const lons = mitGps.map(e => e.mobile_erfassung.geo_lon!);
        const lat = Math.min(...lats);
        const lon = Math.max(...lons);
        // Kleiner Versatz basierend auf Anzahl existierender Punkte
        const offset = 0.000018 * mitGps.length;
        setGeoLat(lat - offset); setGeoLon(lon + offset); setGeoAcc(50);
        setGeoText(`${(lat - offset).toFixed(7)}, ${(lon + offset).toFixed(7)} (geschaetzt)`);
      }
    }
  }, []);

  // Auto-Kompass
  useEffect(() => {
    if (protokoll.nummer < 0) return;
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
      const prots = await getProtokolleByGruppe(gruppe.id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      const themen = [...new Set(alleElems.map(e => e.thema).filter(t => t && t !== 'Bautagebuch'))];
      themen.sort();
      setThemenVorschlaege(themen);
    })();
  }, []);

  // Kein Auto-Select der ersten Firma — Standard ist "(keine)"

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ oid: f.id, kuerzel: f.kuerzel, name: f.name }))
    : [
        ...protokoll.teilnehmer.map(t => ({ oid: t.oid, kuerzel: t.nummer || '', name: t.name })),
        ...protokoll.verteiler
          .filter(v => !protokoll.teilnehmer.some(t => t.oid === v.oid))
          .map(v => ({ oid: v.oid, kuerzel: v.nummer || '', name: v.name })),
      ];

  function gpsErfassen() {
    if (!window.isSecureContext) { alert('GPS erfordert eine HTTPS-Verbindung.\nBitte Server mit SSL-Zertifikat starten.'); return; }
    if (!navigator.geolocation) { alert('GPS nicht verfuegbar.'); return; }
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

  const terminUeberfaellig = termin && [0, 10].includes(status) && new Date(termin) < new Date(new Date().toDateString());

  async function doSave(): Promise<boolean> {
    if (!positionstext.trim()) { alert('Bitte Positionstext eingeben.'); return false; }

    let pos = position.trim();
    if (!pos) {
      if (protokoll.nummer < 0) {
        // Anhangprotokoll (BT, Mehrkosten, QM): Nummernschema innerhalb des Protokolls fortsetzen
        const protElems = await getElemente(protokoll.id);
        pos = naechsteBtPosition(protElems);
      } else {
        const allProts = await getProtokolleByGruppe(gruppe.id);
        let maxPos = 0;
        for (const p of allProts) {
          const elems = await getElemente(p.id);
          for (const e of elems) {
            const num = parseFloat(e.position);
            if (num > maxPos) maxPos = num;
          }
        }
        pos = `${Math.floor(maxPos) + 1}`;
      }
    }

    const verantw = alleFirmen.find(t => t.oid === verantwFirmaOid);
    const now = new Date().toISOString();

    // Einheitliche Bild-Benennung: [ProjektNr]_[Gruppe]_[Position]_Bild_[Nr].jpg
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').replace(/_+/g, '_');
    const fotoRefs = [];
    const fotoNamen: string[] = [];
    const elemId = crypto.randomUUID();
    for (let i = 0; i < tempFotos.length; i++) {
      const fotoId = `foto-${Date.now()}-${i}`;
      const fileName = `${gruppe.protokollnummer}_${sanitize(gruppe.name)}_${pos}_Bild_${i + 1}.jpg`;
      await saveFoto(fotoId, elemId, tempFotos[i], fileName);
      fotoRefs.push({ file_name: fileName, relative_path: `photos/${fileName}`, ziel_pfad: '' });
      fotoNamen.push(fileName);
    }

    // Bildnamen in Bemerkung anfuegen
    let finalBemerkung = bemerkung;
    if (fotoNamen.length > 0) {
      const bilderText = `{Bilder: ${fotoNamen.join(', ')}}`;
      finalBemerkung = finalBemerkung.trim() ? `${finalBemerkung.trim()} ${bilderText}` : bilderText;
    }

    const verweise: string[] = vorgaenger ? [vorgaenger.id] : [];

    const neuesElem: Protokollelement = {
      id: elemId,
      created_at: now,
      updated_at: now,
      created_by: null,
      object_type: 'protokollelement',
      legacy_id: '',
      protokoll_id: protokoll.id,
      position: pos,
      positionstitel: titel,
      positionstext: positionstext,
      thema: thema,
      status: status,
      termin: termin ? termin + 'T00:00:00' : '',
      verantwortlicher_id: verantw?.oid || null,
      verantwortlicher_name: verantw?.name || '',
      bemerkung: finalBemerkung,
      erinnerung: false,
      wert: 0,
      verweise: verweise,
      mobile_erfassung: {
        geo_lat: geoLat, geo_lon: geoLon, geo_accuracy: geoAcc,
        geo_text: geoText || null, geo_heading: geoHeading, geo_altitude: null, fotos: fotoRefs,
      },
      is_new: true,
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
      {/* Compact Header — 2 lines */}
      <div className="bg-ping-blue text-white p-3">
        {/* Line 1: 3 equal buttons */}
        <div className="flex gap-2">
          <button onClick={() => {
            if (dirty && !confirm('Aenderungen werden nicht gespeichert. Zur Uebersicht?')) return;
            onBack();
          }} className="flex-1 py-2 rounded-lg font-bold text-sm bg-ping-blue-dark hover:bg-ping-blue-dark/80 transition">
            &larr; Uebersicht
          </button>
          <button onClick={speichern}
            className={`flex-1 py-2 rounded-lg font-bold text-sm text-white transition ${
              dirty ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
            }`}>
            &#10003; Speichern
          </button>
          <button onClick={speichernUndNeu}
            className="flex-1 py-2 rounded-lg font-bold text-sm bg-ping-blue-dark hover:bg-ping-blue-dark/80 transition">
            + Speichern &amp; Neu
          </button>
          {onSavedAndClone && (
            <button onClick={speichernUndKlonen}
              className="flex-1 py-2 rounded-lg font-bold text-sm bg-ping-blue-dark hover:bg-ping-blue-dark/80 transition">
              &#x2398; Klonen
            </button>
          )}
        </div>
        {/* Line 2: Status + Protocol name + title */}
        <div className="flex items-center gap-2 mt-2 text-sm">
          <StatusBadge status={0} />
          <span className="text-ping-blue-light/70 truncate">{protokoll.name}</span>
          <span className="font-semibold ml-auto whitespace-nowrap">
            {vorgaenger ? 'Nachfolger erstellen' : 'Neues Element'}
          </span>
        </div>
        {vorgaenger && (
          <p className="text-xs text-ping-blue-light mt-1">
            Vorgaenger: Pos. {vorgaenger.position} — {vorgaenger.positionstext.slice(0, 50)}...
          </p>
        )}
      </div>

      {/* Body — viewport-filling */}
      <div className="flex flex-col p-3 gap-2.5" style={{ minHeight: 'calc(100vh - 76px)' }}>

        {/* 1. Positionstext — flex-1 */}
        <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300 flex flex-col">
          <label className="text-xs text-gray-700 font-semibold block mb-0.5">Positionstext *</label>
          <textarea value={positionstext} onChange={(e) => { setPositionstext(e.target.value); setDirty(true); }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            placeholder="Beschreibung des Punktes..."
            className="flex-1 w-full px-2 py-1 border border-gray-200 rounded text-sm text-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none min-h-[9rem] max-h-[50vh] overflow-auto" />
        </div>

        {/* 2. Termin (flex:1) + Verantwortlich (flex:1) + Thema (flex:1) — one row */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300 overflow-hidden">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Termin</label>
            <input type="date" value={termin} onChange={(e) => { setTermin(e.target.value); setDirty(true); }}
              className={`w-full max-w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue box-border ${terminUeberfaellig ? 'text-red-600 font-semibold' : ''}`} />
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Verantwortlich</label>
            <select value={verantwFirmaOid} onChange={(e) => { setVerantwFirmaOid(e.target.value); setDirty(true); }}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
              <option value=""></option>
              {alleFirmen.map(t => (
                <option key={t.oid} value={t.oid}>{t.kuerzel ? `${t.kuerzel} — ${t.name}` : t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Thema</label>
            <div className="flex gap-1">
              <select value={thema}
                onChange={(e) => { setThema(e.target.value); setDirty(true); }}
                className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                <option value=""></option>
                {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
                {thema && !themenVorschlaege.includes(thema) && <option value={thema}>{thema}</option>}
              </select>
              <button onClick={() => { const val = prompt('Neues Thema eingeben:', thema); if (val != null) { setThema(val); setDirty(true); } }}
                className="px-1.5 bg-ping-blue text-white rounded text-xs font-bold shrink-0" title="Neues Thema">+</button>
            </div>
          </div>
        </div>

        {/* 3. Status (flex:2) + Titel (flex:2) — one row */}
        <div className="flex gap-2">
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-700 font-semibold">Status</span>
              <StatusBadge status={status} />
              <button onClick={() => setShowStatusPicker(!showStatusPicker)}
                className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 transition">
                &middot;&middot;&middot;
              </button>
            </div>
            {showStatusPicker && (
              <div className="flex gap-1 flex-wrap mt-2 pt-2 border-t border-gray-100">
                {[...HAUPT_STATUS, ...WEITERE_STATUS].map(s => STATUS_MAP[s] && (
                  <button key={s} onClick={() => { setStatus(s); setShowStatusPicker(false); setDirty(true); }}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                      status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                    }`}>
                    {STATUS_MAP[s].label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-[2] bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Titel</span>
            <input type="text" value={titel} onChange={(e) => { setTitel(e.target.value); setDirty(true); }}
              placeholder="optional"
              className="flex-1 min-w-0 px-2 py-0.5 text-xs focus:outline-none" />
          </div>
        </div>

        {/* 5. Position (flex:1) + Bemerkung (flex:2) — one row, NO labels */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-lg p-2.5 border border-gray-200">
            <input type="text" value={position} onChange={(e) => setPosition(e.target.value)}
              placeholder="Position (auto)"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            <textarea value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} rows={1}
              placeholder="Optionale Bemerkung (intern)"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
          </div>
        </div>

        {/* 6. Standort + Fotos — combined in ONE card */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <div className="flex gap-4">
            {/* Left: Standort */}
            <div className="flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium block mb-1">Standort</span>
              <div className="flex gap-1">
                <button onClick={gpsErfassen}
                  className="bg-ping-blue text-white px-2 py-1 rounded text-xs font-medium">
                  GPS
                </button>
                <button onClick={() => setKarteOffen(true)}
                  className="bg-ping-blue text-white px-2 py-1 rounded text-xs font-medium">
                  Karte
                </button>
                {geoLat != null && (
                  <button onClick={() => { setGeoLat(null); setGeoLon(null); setGeoAcc(null); setGeoHeading(null); setGeoText(''); }}
                    className="bg-gray-100 text-gray-700 border border-gray-300 px-2 py-1 rounded text-xs font-medium">
                    x
                  </button>
                )}
              </div>
            </div>
            {/* Right: Fotos */}
            <div className="flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium block mb-1">Fotos</span>
              <div className="flex gap-1 items-center">
                <button onClick={() => fotoRef.current?.click()}
                  className="bg-ping-blue text-white px-2 py-1 rounded text-xs font-medium">
                  Kamera
                </button>
                <button onClick={() => galerieRef.current?.click()}
                  className="bg-gray-100 text-gray-700 border border-gray-300 px-2 py-1 rounded text-xs font-medium">
                  MEDIA
                </button>
                {tempFotos.length > 0 && (
                  <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    {tempFotos.length}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* GPS text + Auto-GPS toggle */}
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
            <div className="text-xs text-gray-600">
              {geoText ? geoText : (autoGps ? 'Wird ermittelt...' : 'Kein Standort')}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">Auto-GPS</span>
              <button
                onClick={toggleAutoGps}
                className={`relative inline-flex items-center w-8 h-4 rounded-full transition ${autoGps ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block w-3 h-3 bg-white rounded-full shadow transition-transform ${autoGps ? 'translate-x-[1rem]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          {/* Foto thumbnails */}
          {tempFotos.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {tempFotos.map((f, i) => (
                <div key={i} className="relative w-10 h-10">
                  <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover rounded" />
                  <button onClick={() => setTempFotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">x</button>
                </div>
              ))}
            </div>
          )}
          {/* Hidden file inputs */}
          <input ref={fotoRef} type="file" accept="image/*" capture="environment"
            onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); fotoRef.current!.value = ''; } }}
            className="hidden" />
          <input ref={galerieRef} type="file" accept="image/*" multiple
            onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); } }}
            className="hidden" />
        </div>

        {/* Map Editor Modal */}
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

      <ScrollToTopFab />
    </div>
  );
}
