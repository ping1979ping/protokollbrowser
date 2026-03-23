import { useState, useEffect, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto } from '../db';
import type { Verantwortlicher } from '../db';
import { extractGpsFromImage } from '../exifGps';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  onBack: () => void;
  onDone: () => void;
}

const HAUPT_STATUS = [0, 10, 11];

export default function SchnellErstellung({ protokoll, gruppe, onBack, onDone }: Props) {
  const [phase, setPhase] = useState<'einstellungen' | 'fotos' | 'fertig'>('einstellungen');

  // Voreinstellungen
  const [positionstext, setPositionstext] = useState('');
  const [thema, setThema] = useState('');
  const [status, setStatus] = useState(0);
  const [termin, setTermin] = useState('');
  const [verantwFirmaOid, setVerantwFirmaOid] = useState('');
  const [firmen, setFirmen] = useState<Verantwortlicher[]>([]);
  const [themenVorschlaege, setThemenVorschlaege] = useState<string[]>([]);

  // Fotos
  const [fotos, setFotos] = useState<File[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);

  // GPS-Fallback (Fix 1)
  const [deviceGps, setDeviceGps] = useState<{ lat: number; lon: number; acc: number } | null>(null);

  // Ergebnis
  const [erstellt, setErstellt] = useState(0);
  const [verarbeitet, setVerarbeitet] = useState(false);

  useEffect(() => {
    getVerantwortliche().then(setFirmen);
    (async () => {
      const prots = await getProtokolleByGruppe(gruppe.Id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      const themen = [...new Set(alleElems.map(e => e.Thema).filter(t => t && t !== 'Bautagebuch'))];
      themen.sort();
      setThemenVorschlaege(themen);
    })();
    return () => { fotoUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  // Device-GPS erfassen beim Betreten der Fotos-Phase (Fix 1)
  useEffect(() => {
    if (phase === 'fotos' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setDeviceGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    }
  }, [phase]);

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ Oid: f.ID, Name: f.Name }))
    : [
        ...protokoll.Teilnehmer,
        ...protokoll.Verteiler.filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid)),
      ];

  function fotoHinzufuegenBase(files: FileList | null) {
    if (!files || files.length === 0) return;
    const neueFiles = Array.from(files);
    setFotos(prev => [...prev, ...neueFiles]);
    setFotoUrls(prev => [...prev, ...neueFiles.map(f => URL.createObjectURL(f))]);
  }

  function fotoVonKamera(e: React.ChangeEvent<HTMLInputElement>) {
    fotoHinzufuegenBase(e.target.files);
    if (fotoRef.current) fotoRef.current.value = '';
    // Auto-Reopen Kamera (Fix 4)
    if (autoCapture && e.target.files && e.target.files.length > 0) {
      setTimeout(() => { fotoRef.current?.click(); }, 300);
    }
  }

  function fotoAusGalerie(e: React.ChangeEvent<HTMLInputElement>) {
    fotoHinzufuegenBase(e.target.files);
    if (galerieRef.current) galerieRef.current.value = '';
  }

  function fotoEntfernen(index: number) {
    URL.revokeObjectURL(fotoUrls[index]);
    setFotos(prev => prev.filter((_, i) => i !== index));
    setFotoUrls(prev => prev.filter((_, i) => i !== index));
  }

  async function abschliessen() {
    if (fotos.length === 0) { alert('Keine Fotos aufgenommen.'); return; }
    setVerarbeitet(true);

    // Höchste Position finden — bei Anhangprotokoll nur im aktuellen Protokoll
    let maxPos = 0;
    if (protokoll.Nummer < 0) {
      const elems = await getElemente(protokoll.Id);
      for (const e of elems) {
        const num = parseFloat(e.Position);
        if (num > maxPos) maxPos = num;
      }
    } else {
      const allProts = await getProtokolleByGruppe(gruppe.Id);
      for (const p of allProts) {
        const elems = await getElemente(p.Id);
        for (const e of elems) {
          const num = parseFloat(e.Position);
          if (num > maxPos) maxPos = num;
        }
      }
    }

    const verantw = alleFirmen.find(t => t.Oid === verantwFirmaOid);
    let count = 0;

    for (let i = 0; i < fotos.length; i++) {
      const file = fotos[i];
      const exifGps = await extractGpsFromImage(file);

      // GPS-Fallback: EXIF > Device-GPS > null (Fix 1)
      const finalGps = exifGps ?? (deviceGps ? { lat: deviceGps.lat, lon: deviceGps.lon } : null);
      const accuracy = exifGps ? 10 : (deviceGps?.acc ?? null);

      const pos = `${Math.floor(maxPos) + 1 + i}`;
      const elemId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Foto speichern
      const fotoId = `foto-${Date.now()}-${i}`;
      const fileName = `PE-${elemId.replace(/[^a-zA-Z0-9]/g, '')}_001.jpg`;
      await saveFoto(fotoId, elemId, file, fileName);

      const text = positionstext.trim() || file.name.replace(/\.[^.]+$/, '');

      const neuesElem: Protokollelement = {
        Id: elemId,
        ProtokollId: protokoll.Id,
        Position: pos,
        Positionstitel: '',
        Positionstext: text,
        Thema: thema,
        Status: status,
        Termin: termin ? termin + 'T00:00:00' : '',
        VerantwortlicherFirmaOid: verantw?.Oid || '',
        VerantwortlicherFirmaName: verantw?.Name || '',
        Bemerkung: '',
        Erinnerung: false,
        Wert: 0,
        Verweise: [],
        MobileErfassung: {
          GeoLat: finalGps?.lat ?? null,
          GeoLon: finalGps?.lon ?? null,
          GeoAccuracy: finalGps ? accuracy : null,
          GeoText: finalGps ? `${finalGps.lat.toFixed(7)}, ${finalGps.lon.toFixed(7)} (${exifGps ? 'EXIF' : accuracy + ' m'})` : null,
          GeoHeading: null,
          GeoAltitude: null,
          Fotos: [{ FileName: fileName, RelativePath: `photos/${fileName}`, ZielPfad: '' }],
        },
        _neu: true,
      };

      await addElement(neuesElem);
      count++;
    }

    setErstellt(count);
    setPhase('fertig');
  }

  // --- Phase: Einstellungen ---
  if (phase === 'einstellungen') {
    return (
      <div className="min-h-screen bg-ping-bg">
        <div className="bg-ping-blue text-white p-3">
          <button onClick={onBack} className="text-ping-blue-light hover:text-white text-xs">&larr; Übersicht</button>
          <h1 className="text-base font-bold mt-0.5">Schnellerstellung</h1>
          <p className="text-xs text-ping-blue-light">Voreinstellungen für Foto-Batch</p>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Positionstext */}
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Positionstext (optional)</label>
            <textarea value={positionstext} onChange={(e) => setPositionstext(e.target.value)} rows={3}
              placeholder="Wird für alle Punkte übernommen. Leer = Dateiname."
              className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
          </div>

          {/* Status */}
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase mb-1.5 block">Status</label>
            <div className="flex gap-1 flex-wrap">
              {HAUPT_STATUS.map(s => (
                <button key={s} onClick={() => setStatus(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
          </div>

          {/* Thema / Termin */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Thema</label>
              <select value={thema}
                onChange={(e) => setThema(e.target.value)}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                <option value="">(keins)</option>
                {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Termin</label>
              <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            </div>
          </div>

          {/* Verantwortlich */}
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Verantwortlich</label>
            <select value={verantwFirmaOid} onChange={(e) => setVerantwFirmaOid(e.target.value)}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
              <option value="">(keine)</option>
              {alleFirmen.map(t => (
                <option key={t.Oid} value={t.Oid}>{t.Name}</option>
              ))}
            </select>
          </div>

          {/* Weiter-Button */}
          <button
            onClick={() => setPhase('fotos')}
            className="w-full py-3 rounded-lg font-medium text-white text-sm bg-green-600 hover:bg-green-700 transition"
          >
            Fotos aufnehmen &rarr;
          </button>
        </div>
      </div>
    );
  }

  // --- Phase: Fotos ---
  if (phase === 'fotos') {
    return (
      <div className="min-h-screen bg-ping-bg">
        <div className="bg-ping-blue text-white p-3">
          <button onClick={() => setPhase('einstellungen')} className="text-ping-blue-light hover:text-white text-xs">&larr; Einstellungen</button>
          <div className="flex items-center gap-2 mt-0.5">
            <h1 className="text-base font-bold">Fotos aufnehmen</h1>
            {/* GPS-Status-Indikator (Fix 1) */}
            <span className={`w-2 h-2 rounded-full ${deviceGps ? 'bg-green-400' : 'bg-red-400'}`}
              title={deviceGps ? `GPS: ${deviceGps.acc} m` : 'Kein GPS'} />
          </div>
          <p className="text-xs text-ping-blue-light">{fotos.length} Foto{fotos.length !== 1 ? 's' : ''} aufgenommen</p>
        </div>

        <div className="p-3 space-y-3">
          {/* Kamera + Galerie Buttons (Fix 5) */}
          <div className="flex gap-2">
            <button
              onClick={() => fotoRef.current?.click()}
              className="flex-1 py-6 rounded-xl bg-purple-600 text-white font-medium text-base hover:bg-purple-700 active:bg-purple-800 transition shadow-lg"
            >
              Foto aufnehmen
            </button>
            <button
              onClick={() => galerieRef.current?.click()}
              className="flex-1 py-6 rounded-xl bg-blue-600 text-white font-medium text-base hover:bg-blue-700 active:bg-blue-800 transition shadow-lg"
            >
              Aus Galerie
            </button>
          </div>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment"
            onChange={fotoVonKamera} className="hidden" />
          <input ref={galerieRef} type="file" accept="image/*" multiple
            onChange={fotoAusGalerie} className="hidden" />

          {/* Auto-Capture Toggle (Fix 4) */}
          <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-100">
            <span className="text-xs text-gray-600">Kamera automatisch erneut öffnen</span>
            <button
              onClick={() => setAutoCapture(!autoCapture)}
              className={`relative w-10 h-5 rounded-full transition ${autoCapture ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoCapture ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Kompakte Foto-Anzeige (Fix 4) */}
          {fotos.length > 0 && (
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-purple-600">{fotos.length}</span>
                <span className="text-sm text-gray-500">Fotos</span>
                {fotoUrls.length > 0 && (
                  <img src={fotoUrls[fotoUrls.length - 1]} alt="" className="w-10 h-10 rounded object-cover ml-auto" />
                )}
                <button onClick={() => setShowGrid(!showGrid)}
                  className="text-xs text-ping-blue hover:underline">
                  {showGrid ? 'Zuklappen' : 'Alle anzeigen'}
                </button>
              </div>
              {showGrid && (
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {fotos.map((_, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={fotoUrls[i]} alt="" className="w-full h-full object-cover rounded-lg" />
                      <button onClick={() => fotoEntfernen(i)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center shadow">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Abschließen */}
          {fotos.length > 0 && (
            <button
              onClick={abschliessen}
              disabled={verarbeitet}
              className="w-full py-3 rounded-lg font-medium text-white text-sm bg-green-600 hover:bg-green-700 transition disabled:opacity-50"
            >
              {verarbeitet ? 'Wird erstellt...' : `Abschließen (${fotos.length} Punkte erstellen)`}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Phase: Fertig ---
  return (
    <div className="min-h-screen bg-ping-bg flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-lg text-center max-w-sm mx-4">
        <div className="text-4xl mb-3 text-green-600">&#10003;</div>
        <h2 className="text-lg font-bold text-gray-800 mb-1">{erstellt} Punkte erstellt</h2>
        <p className="text-sm text-gray-500 mb-4">
          Alle Fotos wurden als neue Protokollpunkte angelegt.
        </p>
        <button
          onClick={onDone}
          className="w-full py-2.5 rounded-lg font-medium text-white text-sm bg-ping-blue hover:bg-ping-blue-dark transition"
        >
          Zur Übersicht
        </button>
      </div>
    </div>
  );
}
