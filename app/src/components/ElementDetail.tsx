import { useState, useEffect, useRef, useCallback } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { updateElement, deleteElement, saveFoto, getFotos, deleteFoto, getElement, findNachfolger, getElemente, getVerantwortliche, getProtokolleByGruppe } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from './map/mapUtils';
import BautagebuchWizard from './BautagebuchWizard';
import ScrollToTopFab from './ScrollToTopFab';

interface Props {
  element: Protokollelement;
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  filteredIds?: string[];
  onBack: () => void;
  onNachfolger: (vorgaenger: Protokollelement) => void;
  onNavigate: (element: Protokollelement) => void;
  onClone?: (clone: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string }) => void;
}

const HAUPT_STATUS = [0, 10, 20];
const WEITERE_STATUS = [19, 11, 25, 17, 21];

function useSwipe(onLeft: () => void, onRight: () => void, enabled: boolean) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current || !enabled) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) onRight();
      else onLeft();
    }
    touchStart.current = null;
  }, [onLeft, onRight, enabled]);
  return { onTouchStart, onTouchEnd };
}

export default function ElementDetail({ element, protokoll, gruppe, filteredIds, onBack, onNachfolger, onNavigate, onClone }: Props) {
  const [elem, setElem] = useState<Protokollelement>({ ...element });
  const [fotos, setFotos] = useState<{ fotoId: string; blob: Blob; fileName: string; url?: string }[]>([]);
  const [gespeichert, setGespeichert] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [vorgaenger, setVorgaenger] = useState<Protokollelement[]>([]);
  const [nachfolger, setNachfolger] = useState<Protokollelement[]>([]);
  const [prevElem, setPrevElem] = useState<Protokollelement | null>(null);
  const [nextElem, setNextElem] = useState<Protokollelement | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galerieRef = useRef<HTMLInputElement>(null);
  const [karteOffen, setKarteOffen] = useState(false);
  const [firmen, setFirmen] = useState<Verantwortlicher[]>([]);
  const [themenVorschlaege, setThemenVorschlaege] = useState<string[]>([]);
  const [showWeitereStatus, setShowWeitereStatus] = useState(false);
  const [showBtWizard, setShowBtWizard] = useState(false);
  const [showProtokollWahl, setShowProtokollWahl] = useState(false);
  const [verschiebungsziele, setVerschiebungsziele] = useState<{ id: string; name: string; nummer: number; is_new?: boolean }[]>([]);

  const istNeu = !!elem.is_new;
  const istBautagebuch = elem.thema === 'Bautagebuch';

  const swipe = useSwipe(
    () => nextElem && onNavigate(nextElem),
    () => prevElem && onNavigate(prevElem),
    !dirty,
  );

  useEffect(() => {
    ladenFotos();
    ladenVerweise();
    ladenGeschwister();
    ladenFirmen();
    ladenThemen();
    ladenVerschiebungsziele();
    return () => { fotos.forEach(f => f.url && URL.revokeObjectURL(f.url)); };
  }, [element.id]);

  async function ladenFotos() {
    const dbFotos = await getFotos(elem.id);
    setFotos(dbFotos.map(f => ({ ...f, url: URL.createObjectURL(f.blob) })));
  }

  async function ladenVerweise() {
    const vorg: Protokollelement[] = [];
    for (const oid of (elem.verweise || [])) {
      const e = await getElement(oid);
      if (e) vorg.push(e);
    }
    setVorgaenger(vorg);
    const nachf = await findNachfolger(elem.id);
    setNachfolger(nachf);
  }

  async function ladenGeschwister() {
    // Alle Elemente der ganzen Gruppe laden (wie in der Uebersicht)
    const prots = await getProtokolleByGruppe(gruppe.id);
    const alle = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
    let liste = alle;
    if (filteredIds && filteredIds.length > 0) {
      liste = alle.filter(e => filteredIds.includes(e.id));
    }
    liste.sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true }));
    const idx = liste.findIndex(e => e.id === elem.id);
    setPrevElem(idx > 0 ? liste[idx - 1] : null);
    setNextElem(idx < liste.length - 1 ? liste[idx + 1] : null);
  }

  async function ladenFirmen() {
    const v = await getVerantwortliche();
    if (v.length > 0) setFirmen(v);
  }

  async function ladenThemen() {
    const prots = await getProtokolleByGruppe(gruppe.id);
    const themen = new Set<string>();
    for (const p of prots) {
      const elems = await getElemente(p.id);
      for (const e of elems) {
        if (e.thema?.trim() && e.thema.trim() !== 'Bautagebuch') themen.add(e.thema.trim());
      }
    }
    setThemenVorschlaege([...themen].sort());
  }

  async function ladenVerschiebungsziele() {
    const prots = await getProtokolleByGruppe(gruppe.id);
    const ziele = prots.filter(p =>
      p.id !== elem.protokoll_id && (p.nummer < 0 || (p as any).is_new)
    );
    setVerschiebungsziele(ziele.map(p => ({ id: p.id, name: p.name, nummer: p.nummer, is_new: (p as any).is_new })));
  }

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ oid: f.id, kuerzel: f.kuerzel, name: f.name }))
    : [
        ...protokoll.teilnehmer.map(t => ({ oid: t.oid, kuerzel: t.nummer || '', name: t.name })),
        ...protokoll.verteiler
          .filter(v => !protokoll.teilnehmer.some(t => t.oid === v.oid))
          .map(v => ({ oid: v.oid, kuerzel: v.nummer || '', name: v.name })),
      ];

  function markDirty() { setDirty(true); setGespeichert(false); }

  function updateStatus(status: number) {
    setElem(prev => ({ ...prev, status: status, is_modified: true }));
    markDirty();
    setShowWeitereStatus(false);
  }

  function update(patch: Partial<Protokollelement>) {
    if (!istNeu) return;
    setElem(prev => ({ ...prev, ...patch, is_modified: true }));
    markDirty();
  }

  function updateMobile(patch: Partial<Protokollelement['mobile_erfassung']>) {
    setElem(prev => ({
      ...prev, is_modified: true,
      mobile_erfassung: { ...prev.mobile_erfassung, ...patch },
    }));
    markDirty();
  }

  async function speichern() {
    await updateElement(elem);
    setGespeichert(true);
    setDirty(false);
  }

  async function gpsErfassen() {
    if (!window.isSecureContext) { alert('GPS erfordert eine HTTPS-Verbindung.\nBitte Server mit SSL-Zertifikat starten.'); return; }
    if (!navigator.geolocation) { alert('GPS nicht verfuegbar.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        updateMobile({ geo_lat: lat, geo_lon: lon, geo_accuracy: acc, geo_text: `${lat.toFixed(7)}, ${lon.toFixed(7)} (${acc} m)` });
      },
      (err) => alert('GPS-Fehler: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  async function fotoHinzufuegen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    // Files mit arrayBuffer() einlesen — iOS Safari invalidiert FileList-Referenzen
    const geklont: File[] = [];
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer();
      geklont.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified }));
    }
    // Einheitliche Bild-Benennung: [ProjektNr]_[Gruppe]_[Position]_Bild_[Nr].jpg
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').replace(/_+/g, '_');
    const neueFotoNamen: string[] = [];
    for (let idx = 0; idx < geklont.length; idx++) {
      const file = geklont[idx];
      const fotoId = `foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const bildNr = fotos.length + idx + 1;
      const fileName = `${gruppe.protokollnummer}_${sanitize(gruppe.name)}_${elem.position}_Bild_${bildNr}.jpg`;
      await saveFoto(fotoId, elem.id, file, fileName);
      neueFotoNamen.push(fileName);
    }
    await ladenFotos();
    const aktFotos = await getFotos(elem.id);
    updateMobile({ fotos: aktFotos.map(f => ({ file_name: f.fileName, relative_path: `photos/${f.fileName}`, ziel_pfad: '' })) });
    // Bildnamen in Bemerkung anfuegen
    if (neueFotoNamen.length > 0) {
      const bilderText = `{Bilder: ${neueFotoNamen.join(', ')}}`;
      const aktBemerkung = elem.bemerkung?.trim() || '';
      update({ bemerkung: aktBemerkung ? `${aktBemerkung} ${bilderText}` : bilderText });
    }
    if (fotoRef.current) fotoRef.current.value = '';
  }

  async function fotoLoeschen(fotoId: string) {
    await deleteFoto(fotoId);
    await ladenFotos();
  }

  const st = STATUS_MAP[elem.status];
  const terminUeberfaellig = elem.termin && [0, 10].includes(elem.status) && new Date(elem.termin) < new Date(new Date().toDateString());

  return (
    <div className="min-h-screen bg-ping-bg" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        {/* Zeile 1: Vorh. | Uebersicht | Naechst. — alle gleich breit */}
        <div className="flex gap-1.5">
          <button onClick={() => prevElem && !dirty && onNavigate(prevElem)} disabled={!prevElem || dirty}
            className={`flex-1 py-2 rounded-lg text-xs font-medium text-center ${prevElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
            &larr; Vorh.
          </button>
          <button onClick={onBack}
            className="flex-1 py-2 rounded-lg text-xs font-medium text-center bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue">
            &uarr; Uebersicht
          </button>
          <button onClick={() => nextElem && !dirty && onNavigate(nextElem)} disabled={!nextElem || dirty}
            className={`flex-1 py-2 rounded-lg text-xs font-medium text-center ${nextElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
            Naechst. &rarr;
          </button>
        </div>
        {/* Zeile 2: Status | Pos. | Protokollname | Modus */}
        <div className="flex items-center gap-2 mt-1.5">
          {st && <span className={`px-2 py-0.5 rounded text-[10px] font-medium w-20 text-center shrink-0 ${st.css}`}>{st.label}</span>}
          <span className="text-xs text-ping-blue-light">Pos. {elem.position}</span>
          <span className="text-[10px] text-ping-blue-light/70 truncate">{protokoll.name}</span>
          <span className={`text-[10px] shrink-0 ml-auto ${istNeu ? 'text-green-300' : 'text-ping-blue-light'}`}>
            ({istNeu ? 'editierbar' : 'Status/GPS'})
          </span>
        </div>
      </div>

      {/* Buttons direkt unter Header */}
      <div className="px-3 pt-2 flex gap-2">
        <button onClick={speichern}
          className={`flex-1 py-2.5 rounded-lg font-medium text-white text-sm transition ${
            gespeichert ? 'bg-green-600' : dirty ? 'bg-red-500 hover:bg-red-600' : 'bg-ping-blue hover:bg-ping-blue-dark'
          }`}>
          {gespeichert ? 'Gespeichert' : dirty ? 'Speichern!' : 'Speichern'}
        </button>
        <button onClick={() => { setElem({ ...element }); setDirty(false); setGespeichert(false); }}
          disabled={!dirty}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition ${dirty ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-default'}`}>
          Rueckgaengig
        </button>
      </div>

      <div className="p-3 space-y-2.5">

        {/* Vorgaenger/Nachfolger Navigation */}
        {(vorgaenger.length > 0 || nachfolger.length > 0) && (
          <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
            {vorgaenger.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-amber-600 font-medium">Vorgaenger:</span>
                {vorgaenger.map(v => (
                  <button key={v.id} onClick={() => onNavigate(v)}
                    className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-200">
                    Pos. {v.position} — {v.positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
            {nachfolger.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                <span className="text-[10px] text-amber-600 font-medium">Nachfolger:</span>
                {nachfolger.map(n => (
                  <button key={n.id} onClick={() => onNavigate(n)}
                    className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded hover:bg-amber-200">
                    Pos. {n.position} — {n.positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Positionstext */}
        <div className="bg-white rounded-lg p-2.5 border-2 border-gray-300">
          <label className="text-xs text-gray-700 font-semibold">Positionstext</label>
          {istNeu ? (
            <textarea value={elem.positionstext} onChange={(e) => update({ positionstext: e.target.value })}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none mt-0.5 min-h-[9rem] max-h-[50vh] overflow-auto" />
          ) : (
            <p className="text-sm text-gray-700 mt-0.5">{elem.positionstext || '—'}</p>
          )}
        </div>

        {/* Termin + Verantwortlich + Thema — eine Zeile */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Termin</label>
            {istNeu ? (
              <input type="date" value={elem.termin ? elem.termin.slice(0, 10) : ''}
                onChange={(e) => update({ termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className={`text-xs ${terminUeberfaellig ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>{elem.termin ? new Date(elem.termin).toLocaleDateString('de-DE') : '—'}</p>
            )}
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Verantwortlich</label>
            {istNeu ? (
              <select value={elem.verantwortlicher_id || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = alleFirmen.find(t => t.oid === v);
                  update({ verantwortlicher_id: t?.oid || null, verantwortlicher_name: t?.name || '' });
                }}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                <option value=""></option>
                {alleFirmen.map(t => (
                  <option key={t.oid} value={t.oid}>{t.kuerzel ? `${t.kuerzel} — ${t.name}` : t.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-700">{(() => { const f = alleFirmen.find(t => t.oid === (elem.verantwortlicher_id || '')); return f ? (f.kuerzel ? `${f.kuerzel} — ${f.name}` : f.name) : (elem.verantwortlicher_name || '—'); })()}</p>
            )}
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Thema</label>
            {istNeu ? (
              <div className="flex gap-1">
                <select value={elem.thema}
                  onChange={(e) => update({ thema: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                  {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
                  {elem.thema && !themenVorschlaege.includes(elem.thema) && <option value={elem.thema}>{elem.thema}</option>}
                </select>
                <button onClick={() => { const val = prompt('Neues Thema eingeben:', elem.thema); if (val != null) update({ thema: val }); }}
                  className="px-1.5 bg-ping-blue text-white rounded text-xs font-bold shrink-0" title="Neues Thema">+</button>
              </div>
            ) : (
              <p className="text-xs text-gray-700">{elem.thema || '—'}</p>
            )}
          </div>
        </div>

        {/* Status + Titel — eine Zeile */}
        <div className="flex gap-2">
          <div className="flex-[2] bg-white rounded-lg px-2.5 py-2 border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Status</span>
              {st && <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${st.css}`}>{st.label}</span>}
              <div className="flex gap-1 ml-auto">
                <button onClick={() => updateStatus(10)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                    elem.status === 10 ? 'bg-yellow-200 text-yellow-800 ring-2 ring-ping-blue' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  }`}>Offen</button>
                <button onClick={() => updateStatus(20)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                    elem.status === 20 ? 'bg-green-200 text-green-800 ring-2 ring-ping-blue' : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}>Erledigt</button>
                <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
                  className="bg-gray-100 text-gray-500 px-2 py-1.5 rounded text-xs border border-gray-300">···</button>
              </div>
            </div>
          </div>
          <div className="flex-[2] bg-white rounded-lg px-2.5 py-2 border border-gray-200 flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Titel</span>
            {istNeu ? (
              <input type="text" value={elem.positionstitel} onChange={(e) => update({ positionstitel: e.target.value })}
                placeholder="optional"
                className="flex-1 min-w-0 px-2 py-0.5 text-xs focus:outline-none" />
            ) : (
              <span className="text-xs text-gray-700 truncate">{elem.positionstitel || '—'}</span>
            )}
          </div>
        </div>

        {/* Status picker — expandable */}
        {showWeitereStatus && (
          <div className="bg-white rounded-lg p-2.5 border border-gray-200">
            <div className="flex gap-1 flex-wrap">
              {HAUPT_STATUS.map(s => (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    elem.status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap mt-1.5 pt-1.5 border-t border-gray-100">
              {WEITERE_STATUS.map(s => STATUS_MAP[s] && (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    elem.status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Position + Bemerkung — eine Zeile, keine Labels */}
        <div className="flex gap-2">
          <div className="flex-1 bg-white rounded-lg p-2.5 border border-gray-200">
            {istNeu ? (
              <input type="text" value={elem.position} onChange={(e) => update({ position: e.target.value })}
                placeholder="Position"
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700 font-mono">{elem.position}</p>
            )}
          </div>
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            {istNeu ? (
              <textarea value={elem.bemerkung} onChange={(e) => update({ bemerkung: e.target.value })} rows={1}
                placeholder="Optionale Bemerkung (intern)"
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
            ) : (
              <p className="text-xs text-gray-700">{elem.bemerkung || '—'}</p>
            )}
          </div>
        </div>

        {/* Standort + Fotos — kombinierte Karte */}
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <div className="flex gap-4">
            {/* Standort */}
            <div className="flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Standort</span>
              <div className="flex gap-1 mt-1">
                <button onClick={gpsErfassen} className="bg-ping-blue text-white px-2 py-1 rounded text-[10px] font-medium">GPS</button>
                <button onClick={() => setKarteOffen(true)} className="bg-ping-blue text-white px-2 py-1 rounded text-[10px] font-medium">Karte</button>
                {elem.mobile_erfassung.geo_lat != null && (
                  <button onClick={() => updateMobile({ geo_lat: null, geo_lon: null, geo_accuracy: null, geo_heading: null, geo_text: null })}
                    className="bg-gray-100 text-gray-500 border border-gray-300 px-2 py-1 rounded text-[10px] font-medium">x</button>
                )}
              </div>
            </div>
            {/* Fotos */}
            <div className="flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Fotos</span>
              <div className="flex gap-1 mt-1 items-center">
                {istNeu && (
                  <>
                    <button onClick={() => fotoRef.current?.click()} className="bg-ping-blue text-white px-2 py-1 rounded text-[10px] font-medium">
                      Kamera
                    </button>
                    <button onClick={() => galerieRef.current?.click()} className="bg-gray-100 text-gray-700 border border-gray-300 px-2 py-1 rounded text-[10px] font-medium">
                      MEDIA
                    </button>
                    <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={fotoHinzufuegen} className="hidden" />
                    <input ref={galerieRef} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden" />
                  </>
                )}
                {fotos.length > 0 && (
                  <span className="bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded">{fotos.length}</span>
                )}
              </div>
            </div>
          </div>
          {/* GPS coordinates */}
          {elem.mobile_erfassung.geo_lat != null
            ? <p className="text-[10px] text-gray-600 mt-1.5">
                {formatCoord(elem.mobile_erfassung.geo_lat, elem.mobile_erfassung.geo_lon!, elem.mobile_erfassung.geo_accuracy, elem.mobile_erfassung.geo_heading)}
              </p>
            : <p className="text-[10px] text-gray-400 mt-1.5">Kein Standort</p>}
          {/* Foto thumbnails */}
          {fotos.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-1.5">
              {fotos.map(f => (
                <div key={f.fotoId} className="relative w-10 h-10">
                  <img src={f.url} alt="" className="w-full h-full object-cover rounded" />
                  {istNeu && (
                    <button onClick={() => fotoLoeschen(f.fotoId)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">x</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {karteOffen && (
          <MapEditorModal
            lat={elem.mobile_erfassung.geo_lat}
            lon={elem.mobile_erfassung.geo_lon}
            heading={elem.mobile_erfassung.geo_heading ?? null}
            onSave={(lat, lon, heading) => {
              const acc = elem.mobile_erfassung.geo_accuracy;
              updateMobile({
                geo_lat: lat, geo_lon: lon, geo_heading: heading,
                geo_text: formatCoord(lat, lon, acc, heading),
              });
              setKarteOffen(false);
            }}
            onCancel={() => setKarteOffen(false)}
          />
        )}

        {/* Bautagebuch bearbeiten */}
        {istBautagebuch && (
          <button
            onClick={() => setShowBtWizard(true)}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-amber-600 text-white hover:bg-amber-700 transition"
          >
            Bautagebuch bearbeiten
          </button>
        )}

        {/* Verschieben in anderes Protokoll (nur neue Elemente) */}
        {istNeu && verschiebungsziele.length > 0 && (
          <div className="bg-white rounded-lg p-2.5 border border-gray-100">
            <button
              onClick={() => setShowProtokollWahl(!showProtokollWahl)}
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              In anderes Protokoll verschieben
            </button>
            {showProtokollWahl && (
              <div className="mt-2 space-y-1">
                {verschiebungsziele.map(p => (
                  <button key={p.id}
                    onClick={async () => {
                      if (!confirm(`Punkt nach "${p.name}" verschieben?`)) return;
                      const updated = { ...elem, protokoll_id: p.id, is_modified: true as const };
                      await updateElement(updated);
                      onBack();
                    }}
                    className="w-full text-left px-3 py-2 rounded bg-gray-50 hover:bg-indigo-50 text-xs border border-gray-200"
                  >
                    {p.name} {p.nummer < 0 ? '(Anhang)' : p.is_new ? '(Entwurf)' : `Nr. ${p.nummer}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loeschen (nur neue Elemente) */}
        {istNeu && (
          <button
            onClick={async () => {
              if (!confirm('Diesen Punkt wirklich loeschen?')) return;
              await deleteElement(elem.id);
              onBack();
            }}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 transition"
          >
            Punkt loeschen
          </button>
        )}

        {/* Nachfolger + Klonen */}
        {!istNeu && !istBautagebuch && (
          <div className="flex gap-2">
            <button onClick={() => onNachfolger(elem)}
              className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-ping-gold text-white hover:bg-ping-gold-dark transition">
              Nachfolger
            </button>
            {onClone && (
              <button onClick={() => onClone({
                thema: elem.thema, status: elem.status,
                termin: elem.termin ? elem.termin.slice(0, 10) : '',
                verantwOid: elem.verantwortlicher_id || '',
                geoLat: elem.mobile_erfassung.geo_lat, geoLon: elem.mobile_erfassung.geo_lon,
                geoAcc: elem.mobile_erfassung.geo_accuracy, geoHeading: elem.mobile_erfassung.geo_heading,
                geoText: elem.mobile_erfassung.geo_text || '',
              })}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-amber-600 text-white hover:bg-amber-700 transition">
                Klonen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bautagebuch Wizard Modal */}
      {showBtWizard && (
        <BautagebuchWizard
          gruppe={gruppe}
          existingElement={elem}
          onUebernehmen={(result) => {
            const patch: Partial<Protokollelement> = {
              positionstext: result.positionstext,
              termin: result.datum + 'T00:00:00',
              is_modified: true,
            };
            if (result.geoLat != null) {
              setElem(prev => ({
                ...prev,
                ...patch,
                mobile_erfassung: {
                  ...prev.mobile_erfassung,
                  geo_lat: result.geoLat,
                  geo_lon: result.geoLon,
                  geo_accuracy: result.geoAcc,
                },
              }));
            } else {
              setElem(prev => ({ ...prev, ...patch }));
            }
            markDirty();
            setShowBtWizard(false);
          }}
          onAbbrechen={() => setShowBtWizard(false)}
        />
      )}
      <ScrollToTopFab />
    </div>
  );
}
