import { useState, useEffect, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe, Teilnehmer } from '../types';
import { STATUS_MAP } from '../types';
import { updateElement, saveFoto, getFotos, deleteFoto, getElement, findNachfolger, getElemente } from '../db';

interface Props {
  element: Protokollelement;
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  onBack: () => void;
  onNachfolger: (vorgaenger: Protokollelement) => void;
  onNavigate: (element: Protokollelement) => void;
}

const AENDERBARE_STATUS = [0, 10, 19, 20, 11, 25];

export default function ElementDetail({ element, protokoll, gruppe: _gruppe, onBack, onNachfolger, onNavigate }: Props) {
  const [elem, setElem] = useState<Protokollelement>({ ...element });
  const [fotos, setFotos] = useState<{ fotoId: string; blob: Blob; fileName: string; url?: string }[]>([]);
  const [gespeichert, setGespeichert] = useState(false);
  const [vorgaenger, setVorgaenger] = useState<Protokollelement[]>([]);
  const [nachfolger, setNachfolger] = useState<Protokollelement[]>([]);
  const [prevElem, setPrevElem] = useState<Protokollelement | null>(null);
  const [nextElem, setNextElem] = useState<Protokollelement | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const istNeu = !!elem._neu;

  useEffect(() => {
    ladenFotos();
    ladenVerweise();
    ladenGeschwister();
    return () => { fotos.forEach(f => f.url && URL.revokeObjectURL(f.url)); };
  }, [element.Id]);

  async function ladenFotos() {
    const dbFotos = await getFotos(elem.Id);
    setFotos(dbFotos.map(f => ({ ...f, url: URL.createObjectURL(f.blob) })));
  }

  async function ladenVerweise() {
    // Vorgänger laden (aus Verweise-Array)
    const vorg: Protokollelement[] = [];
    for (const oid of (elem.Verweise || [])) {
      const e = await getElement(oid);
      if (e) vorg.push(e);
    }
    setVorgaenger(vorg);

    // Nachfolger suchen (andere Elemente die auf dieses verweisen)
    const nachf = await findNachfolger(elem.Id);
    setNachfolger(nachf);
  }

  async function ladenGeschwister() {
    const alle = await getElemente(protokoll.Id);
    alle.sort((a, b) => a.Position.localeCompare(b.Position, undefined, { numeric: true }));
    const idx = alle.findIndex(e => e.Id === elem.Id);
    setPrevElem(idx > 0 ? alle[idx - 1] : null);
    setNextElem(idx < alle.length - 1 ? alle[idx + 1] : null);
  }

  function updateStatus(status: number) {
    setElem(prev => ({ ...prev, Status: status, _geaendert: true }));
    setGespeichert(false);
  }

  function update(patch: Partial<Protokollelement>) {
    if (!istNeu) return; // alte Elemente: nur Status
    setElem(prev => ({ ...prev, ...patch, _geaendert: true }));
    setGespeichert(false);
  }

  function updateMobile(patch: Partial<Protokollelement['MobileErfassung']>) {
    if (!istNeu) return;
    setElem(prev => ({
      ...prev, _geaendert: true,
      MobileErfassung: { ...prev.MobileErfassung, ...patch },
    }));
    setGespeichert(false);
  }

  async function speichern() {
    await updateElement(elem);
    setGespeichert(true);
  }

  async function gpsErfassen() {
    if (!navigator.geolocation) { alert('GPS nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        updateMobile({ GeoLat: lat, GeoLon: lon, GeoAccuracy: acc, GeoText: `${lat.toFixed(7)}, ${lon.toFixed(7)} (${acc} m)` });
      },
      (err) => alert('GPS-Fehler: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function fotoHinzufuegen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const fotoId = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const fileName = `PE-${elem.Id.replace(/[^a-zA-Z0-9]/g, '')}_${String(fotos.length + 1).padStart(3, '0')}.jpg`;
      await saveFoto(fotoId, elem.Id, file, fileName);
    }
    await ladenFotos();
    const aktFotos = await getFotos(elem.Id);
    updateMobile({ Fotos: aktFotos.map(f => ({ FileName: f.fileName, RelativePath: `photos/${f.fileName}`, ZielPfad: '' })) });
    if (fotoRef.current) fotoRef.current.value = '';
  }

  async function fotoLoeschen(fotoId: string) {
    await deleteFoto(fotoId);
    await ladenFotos();
  }

  const alleTeilnehmer: Teilnehmer[] = [
    ...protokoll.Teilnehmer,
    ...protokoll.Verteiler.filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid)),
  ];

  const st = STATUS_MAP[elem.Status];

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurück</button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ping-blue-light">Pos. {elem.Position}</span>
            {st && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${st.css}`}>{st.label}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <div>
            {!istNeu && <p className="text-xs text-ping-blue-light">Nur Status änderbar</p>}
            {istNeu && <p className="text-xs text-green-300">Neues Element — alle Felder editierbar</p>}
          </div>
          <div className="flex gap-1">
            <button onClick={() => prevElem && onNavigate(prevElem)} disabled={!prevElem}
              className={`px-2 py-0.5 rounded text-xs ${prevElem ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
              &larr; Vorh.
            </button>
            <button onClick={() => nextElem && onNavigate(nextElem)} disabled={!nextElem}
              className={`px-2 py-0.5 rounded text-xs ${nextElem ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
              Nächst. &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="p-3 space-y-2.5">

        {/* Vorgänger/Nachfolger Navigation */}
        {(vorgaenger.length > 0 || nachfolger.length > 0) && (
          <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
            {vorgaenger.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-amber-600 font-medium">Vorgänger:</span>
                {vorgaenger.map(v => (
                  <button key={v.Id} onClick={() => onNavigate(v)}
                    className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-200">
                    Pos. {v.Position} — {v.Positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
            {nachfolger.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                <span className="text-[10px] text-amber-600 font-medium">Nachfolger:</span>
                {nachfolger.map(n => (
                  <button key={n.Id} onClick={() => onNavigate(n)}
                    className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-200">
                    Pos. {n.Position} — {n.Positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Positionstext = Hauptfeld */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase">Positionstext</label>
          {istNeu ? (
            <textarea value={elem.Positionstext} onChange={(e) => update({ Positionstext: e.target.value })} rows={3}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none mt-0.5" />
          ) : (
            <p className="text-xs text-gray-700 mt-0.5">{elem.Positionstext || '—'}</p>
          )}
        </div>

        {/* Status — immer editierbar */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase mb-1.5 block">Status</label>
          <div className="flex gap-1 flex-wrap">
            {AENDERBARE_STATUS.map(s => (
              <button key={s} onClick={() => updateStatus(s)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  elem.Status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                }`}>
                {STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Readonly-Felder bei alten Elementen, editierbar bei neuen */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Thema</label>
            {istNeu ? (
              <input type="text" value={elem.Thema} onChange={(e) => update({ Thema: e.target.value })}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700">{elem.Thema || '—'}</p>
            )}
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Position</label>
            {istNeu ? (
              <input type="text" value={elem.Position} onChange={(e) => update({ Position: e.target.value })}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700 font-mono">{elem.Position}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Termin</label>
            {istNeu ? (
              <input type="date" value={elem.Termin ? elem.Termin.slice(0, 10) : ''}
                onChange={(e) => update({ Termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700">{elem.Termin ? new Date(elem.Termin).toLocaleDateString('de-DE') : '—'}</p>
            )}
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Verantwortlich</label>
            {istNeu ? (
              <select value={elem.VerantwortlicherOid}
                onChange={(e) => {
                  const t = alleTeilnehmer.find(t => t.Oid === e.target.value);
                  if (t) update({ VerantwortlicherOid: t.Oid, VerantwortlicherId: t.Nummer, VerantwortlicherName: t.Name });
                }}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                {alleTeilnehmer.map(t => (
                  <option key={t.Oid} value={t.Oid}>{t.Name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-700">{elem.VerantwortlicherName || '—'}</p>
            )}
          </div>
        </div>

        {/* Bemerkung */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-100">
          <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Bemerkung (intern)</label>
          {istNeu ? (
            <textarea value={elem.Bemerkung} onChange={(e) => update({ Bemerkung: e.target.value })} rows={2}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
          ) : (
            <p className="text-xs text-gray-700">{elem.Bemerkung || '—'}</p>
          )}
        </div>

        {/* GPS + Fotos — nur bei neuen Elementen */}
        {istNeu && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-gray-400 font-medium uppercase">GPS</label>
                <button onClick={gpsErfassen} className="bg-green-600 text-white px-2 py-0.5 rounded text-[10px]">Erfassen</button>
              </div>
              {elem.MobileErfassung.GeoText
                ? <p className="text-[10px] text-gray-600">{elem.MobileErfassung.GeoText}</p>
                : <p className="text-[10px] text-gray-300">Kein Standort</p>}
            </div>
            <div className="bg-white rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] text-gray-400 font-medium uppercase">Fotos ({fotos.length})</label>
                <button onClick={() => fotoRef.current?.click()} className="bg-purple-600 text-white px-2 py-0.5 rounded text-[10px]">Hinzufügen</button>
                <input ref={fotoRef} type="file" accept="image/*" capture="environment" multiple onChange={fotoHinzufuegen} className="hidden" />
              </div>
              {fotos.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {fotos.map(f => (
                    <div key={f.fotoId} className="relative w-10 h-10">
                      <img src={f.url} alt="" className="w-full h-full object-cover rounded" />
                      <button onClick={() => fotoLoeschen(f.fotoId)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Titel (optional, untergeordnet) */}
        {istNeu && (
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Titel (optional, für Gestaltung)</label>
            <input type="text" value={elem.Positionstitel} onChange={(e) => update({ Positionstitel: e.target.value })}
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
        )}

        {/* Titel readonly bei alten Elementen, wenn vorhanden */}
        {!istNeu && elem.Positionstitel && (
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Titel</label>
            <p className="text-xs text-gray-700">{elem.Positionstitel}</p>
          </div>
        )}

        {/* GPS/Fotos readonly bei alten Elementen, wenn vorhanden */}
        {!istNeu && (elem.MobileErfassung.GeoText || fotos.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {elem.MobileErfassung.GeoText && (
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <label className="text-[10px] text-gray-400 font-medium uppercase">GPS</label>
                <p className="text-[10px] text-gray-600">{elem.MobileErfassung.GeoText}</p>
              </div>
            )}
            {fotos.length > 0 && (
              <div className="bg-white rounded-lg p-2.5 border border-gray-100">
                <label className="text-[10px] text-gray-400 font-medium uppercase">Fotos ({fotos.length})</label>
                <div className="flex gap-1 flex-wrap mt-1">
                  {fotos.map(f => (
                    <img key={f.fotoId} src={f.url} alt="" className="w-10 h-10 object-cover rounded" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Aktionen */}
        <div className="space-y-2">
          <button onClick={speichern}
            className={`w-full py-2.5 rounded-lg font-medium text-white text-sm transition ${
              gespeichert ? 'bg-green-600' : 'bg-ping-blue hover:bg-ping-blue-dark active:bg-ping-blue-dark'
            }`}>
            {gespeichert ? 'Gespeichert' : 'Speichern'}
          </button>

          {!istNeu && (
            <button onClick={() => onNachfolger(elem)}
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-ping-gold text-white hover:bg-ping-gold-dark active:bg-ping-gold-dark transition">
              Nachfolger erstellen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
