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
  const [verschiebungsziele, setVerschiebungsziele] = useState<{ Id: string; Name: string; Nummer: number; _neu?: boolean }[]>([]);

  const istNeu = !!elem._neu;
  const istBautagebuch = elem.Thema === 'Bautagebuch';

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
  }, [element.Id]);

  async function ladenFotos() {
    const dbFotos = await getFotos(elem.Id);
    setFotos(dbFotos.map(f => ({ ...f, url: URL.createObjectURL(f.blob) })));
  }

  async function ladenVerweise() {
    const vorg: Protokollelement[] = [];
    for (const oid of (elem.Verweise || [])) {
      const e = await getElement(oid);
      if (e) vorg.push(e);
    }
    setVorgaenger(vorg);
    const nachf = await findNachfolger(elem.Id);
    setNachfolger(nachf);
  }

  async function ladenGeschwister() {
    // Alle Elemente der ganzen Gruppe laden (wie in der Übersicht)
    const prots = await getProtokolleByGruppe(gruppe.Id);
    const alle = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
    let liste = alle;
    if (filteredIds && filteredIds.length > 0) {
      liste = alle.filter(e => filteredIds.includes(e.Id));
    }
    liste.sort((a, b) => a.Position.localeCompare(b.Position, undefined, { numeric: true }));
    const idx = liste.findIndex(e => e.Id === elem.Id);
    setPrevElem(idx > 0 ? liste[idx - 1] : null);
    setNextElem(idx < liste.length - 1 ? liste[idx + 1] : null);
  }

  async function ladenFirmen() {
    const v = await getVerantwortliche();
    if (v.length > 0) setFirmen(v);
  }

  async function ladenThemen() {
    const prots = await getProtokolleByGruppe(gruppe.Id);
    const themen = new Set<string>();
    for (const p of prots) {
      const elems = await getElemente(p.Id);
      for (const e of elems) {
        if (e.Thema?.trim() && e.Thema.trim() !== 'Bautagebuch') themen.add(e.Thema.trim());
      }
    }
    setThemenVorschlaege([...themen].sort());
  }

  async function ladenVerschiebungsziele() {
    const prots = await getProtokolleByGruppe(gruppe.Id);
    const ziele = prots.filter(p =>
      p.Id !== elem.ProtokollId && (p.Nummer < 0 || (p as any)._neu)
    );
    setVerschiebungsziele(ziele.map(p => ({ Id: p.Id, Name: p.Name, Nummer: p.Nummer, _neu: (p as any)._neu })));
  }

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ Oid: f.ID, Kuerzel: f.Kuerzel, Name: f.Name }))
    : [
        ...protokoll.Teilnehmer.map(t => ({ Oid: t.Oid, Kuerzel: (t as any).Nummer || '', Name: t.Name })),
        ...protokoll.Verteiler
          .filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid))
          .map(v => ({ Oid: v.Oid, Kuerzel: (v as any).Nummer || '', Name: v.Name })),
      ];

  function markDirty() { setDirty(true); setGespeichert(false); }

  function updateStatus(status: number) {
    setElem(prev => ({ ...prev, Status: status, _geaendert: true }));
    markDirty();
    setShowWeitereStatus(false);
  }

  function update(patch: Partial<Protokollelement>) {
    if (!istNeu) return;
    setElem(prev => ({ ...prev, ...patch, _geaendert: true }));
    markDirty();
  }

  function updateMobile(patch: Partial<Protokollelement['MobileErfassung']>) {
    setElem(prev => ({
      ...prev, _geaendert: true,
      MobileErfassung: { ...prev.MobileErfassung, ...patch },
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
      const fileName = `${gruppe.Protokollnummer}_${sanitize(gruppe.Name)}_${elem.Position}_Bild_${bildNr}.jpg`;
      await saveFoto(fotoId, elem.Id, file, fileName);
      neueFotoNamen.push(fileName);
    }
    await ladenFotos();
    const aktFotos = await getFotos(elem.Id);
    updateMobile({ Fotos: aktFotos.map(f => ({ FileName: f.fileName, RelativePath: `photos/${f.fileName}`, ZielPfad: '' })) });
    // Bildnamen in Bemerkung anfügen
    if (neueFotoNamen.length > 0) {
      const bilderText = `{Bilder: ${neueFotoNamen.join(', ')}}`;
      const aktBemerkung = elem.Bemerkung?.trim() || '';
      update({ Bemerkung: aktBemerkung ? `${aktBemerkung} ${bilderText}` : bilderText });
    }
    if (fotoRef.current) fotoRef.current.value = '';
  }

  async function fotoLoeschen(fotoId: string) {
    await deleteFoto(fotoId);
    await ladenFotos();
  }

  const st = STATUS_MAP[elem.Status];
  const terminUeberfaellig = elem.Termin && [0, 10].includes(elem.Status) && new Date(elem.Termin) < new Date(new Date().toDateString());

  return (
    <div className="min-h-screen bg-ping-bg" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        {/* Zeile 1: Vorh. | Übersicht | Nächst. — alle gleich breit */}
        <div className="flex gap-1.5">
          <button onClick={() => prevElem && !dirty && onNavigate(prevElem)} disabled={!prevElem || dirty}
            className={`flex-1 py-2 rounded-lg text-xs font-medium text-center ${prevElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
            &larr; Vorh.
          </button>
          <button onClick={onBack}
            className="flex-1 py-2 rounded-lg text-xs font-medium text-center bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue">
            &uarr; Übersicht
          </button>
          <button onClick={() => nextElem && !dirty && onNavigate(nextElem)} disabled={!nextElem || dirty}
            className={`flex-1 py-2 rounded-lg text-xs font-medium text-center ${nextElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/30 cursor-default'}`}>
            Nächst. &rarr;
          </button>
        </div>
        {/* Zeile 2: Status | Pos. | Protokollname | Modus */}
        <div className="flex items-center gap-2 mt-1.5">
          {st && <span className={`px-2 py-0.5 rounded text-[10px] font-medium w-20 text-center shrink-0 ${st.css}`}>{st.label}</span>}
          <span className="text-xs text-ping-blue-light">Pos. {elem.Position}</span>
          <span className="text-[10px] text-ping-blue-light/70 truncate">{protokoll.Name}</span>
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
          Rückgängig
        </button>
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

        {/* Positionstext */}
        <div className="bg-white rounded-lg p-2.5 border-2 border-gray-300">
          <label className="text-xs text-gray-700 font-semibold">Positionstext</label>
          {istNeu ? (
            <textarea value={elem.Positionstext} onChange={(e) => update({ Positionstext: e.target.value })}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none mt-0.5 min-h-[9rem] max-h-[50vh] overflow-auto" />
          ) : (
            <p className="text-sm text-gray-700 mt-0.5">{elem.Positionstext || '—'}</p>
          )}
        </div>

        {/* Verantwortlich + Thema + Termin — eine Zeile */}
        <div className="flex gap-2">
          <div className="flex-[2] bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Verantwortlich</label>
            {istNeu ? (
              <select value={elem.VerantwortlicherFirmaOid}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = alleFirmen.find(t => t.Oid === v);
                  update({ VerantwortlicherFirmaOid: t?.Oid || '', VerantwortlicherFirmaName: t?.Name || '' });
                }}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                <option value=""></option>
                {alleFirmen.map(t => (
                  <option key={t.Oid} value={t.Oid}>{t.Kuerzel ? `${t.Kuerzel} — ${t.Name}` : t.Name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-700">{(() => { const f = alleFirmen.find(t => t.Oid === elem.VerantwortlicherFirmaOid); return f ? (f.Kuerzel ? `${f.Kuerzel} — ${f.Name}` : f.Name) : (elem.VerantwortlicherFirmaName || '—'); })()}</p>
            )}
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Thema</label>
            {istNeu ? (
              <div className="flex gap-1">
                <select value={elem.Thema}
                  onChange={(e) => update({ Thema: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue">
                  {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
                  {elem.Thema && !themenVorschlaege.includes(elem.Thema) && <option value={elem.Thema}>{elem.Thema}</option>}
                </select>
                <button onClick={() => { const val = prompt('Neues Thema eingeben:', elem.Thema); if (val != null) update({ Thema: val }); }}
                  className="px-1.5 bg-ping-blue text-white rounded text-xs font-bold shrink-0" title="Neues Thema">+</button>
              </div>
            ) : (
              <p className="text-xs text-gray-700">{elem.Thema || '—'}</p>
            )}
          </div>
          <div className="flex-1 bg-white rounded-lg p-2.5 border-2 border-gray-300">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Termin</label>
            {istNeu ? (
              <input type="date" value={elem.Termin ? elem.Termin.slice(0, 10) : ''}
                onChange={(e) => update({ Termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className={`text-xs ${terminUeberfaellig ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>{elem.Termin ? new Date(elem.Termin).toLocaleDateString('de-DE') : '—'}</p>
            )}
          </div>
        </div>

        {/* Status + Titel — eine Zeile */}
        <div className="flex gap-2">
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-700 font-semibold">Status</span>
              {st && <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${st.css}`}>{st.label}</span>}
              <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-gray-50 text-gray-500 ml-auto">
                ···
              </button>
            </div>
          </div>
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            <label className="text-xs text-gray-700 font-semibold block mb-0.5">Titel</label>
            {istNeu ? (
              <input type="text" value={elem.Positionstitel} onChange={(e) => update({ Positionstitel: e.target.value })}
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700">{elem.Positionstitel || '—'}</p>
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
                    elem.Status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap mt-1.5 pt-1.5 border-t border-gray-100">
              {WEITERE_STATUS.map(s => STATUS_MAP[s] && (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                    elem.Status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
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
              <input type="text" value={elem.Position} onChange={(e) => update({ Position: e.target.value })}
                placeholder="Position"
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-xs text-gray-700 font-mono">{elem.Position}</p>
            )}
          </div>
          <div className="flex-[2] bg-white rounded-lg p-2.5 border border-gray-200">
            {istNeu ? (
              <textarea value={elem.Bemerkung} onChange={(e) => update({ Bemerkung: e.target.value })} rows={1}
                placeholder="Optionale Bemerkung (intern)"
                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
            ) : (
              <p className="text-xs text-gray-700">{elem.Bemerkung || '—'}</p>
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
                {elem.MobileErfassung.GeoLat != null && (
                  <button onClick={() => updateMobile({ GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoHeading: null, GeoText: null })}
                    className="bg-gray-100 text-gray-500 border border-gray-300 px-2 py-1 rounded text-[10px] font-medium">✕</button>
                )}
              </div>
            </div>
            {/* Fotos */}
            <div className="flex-1">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Fotos</span>
              <div className="flex gap-1 mt-1 items-center">
                {istNeu && (
                  <>
                    <button onClick={() => fotoRef.current?.click()} className="bg-ping-blue text-white px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>
                    </button>
                    <button onClick={() => galerieRef.current?.click()} className="bg-ping-blue text-white px-2 py-1 rounded text-[10px] font-medium">
                      <span role="img" aria-label="Galerie">&#128444;&#65039;</span>
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
          {elem.MobileErfassung.GeoLat != null
            ? <p className="text-[10px] text-gray-600 mt-1.5">
                {formatCoord(elem.MobileErfassung.GeoLat, elem.MobileErfassung.GeoLon!, elem.MobileErfassung.GeoAccuracy, elem.MobileErfassung.GeoHeading)}
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
                      className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center">×</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {karteOffen && (
          <MapEditorModal
            lat={elem.MobileErfassung.GeoLat}
            lon={elem.MobileErfassung.GeoLon}
            heading={elem.MobileErfassung.GeoHeading ?? null}
            onSave={(lat, lon, heading) => {
              const acc = elem.MobileErfassung.GeoAccuracy;
              updateMobile({
                GeoLat: lat, GeoLon: lon, GeoHeading: heading,
                GeoText: formatCoord(lat, lon, acc, heading),
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
                  <button key={p.Id}
                    onClick={async () => {
                      if (!confirm(`Punkt nach "${p.Name}" verschieben?`)) return;
                      const updated = { ...elem, ProtokollId: p.Id, _geaendert: true as const };
                      await updateElement(updated);
                      onBack();
                    }}
                    className="w-full text-left px-3 py-2 rounded bg-gray-50 hover:bg-indigo-50 text-xs border border-gray-200"
                  >
                    {p.Name} {p.Nummer < 0 ? '(Anhang)' : p._neu ? '(Entwurf)' : `Nr. ${p.Nummer}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Löschen (nur neue Elemente) */}
        {istNeu && (
          <button
            onClick={async () => {
              if (!confirm('Diesen Punkt wirklich löschen?')) return;
              await deleteElement(elem.Id);
              onBack();
            }}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-red-600 text-white hover:bg-red-700 transition"
          >
            Punkt löschen
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
                thema: elem.Thema, status: elem.Status,
                termin: elem.Termin ? elem.Termin.slice(0, 10) : '',
                verantwOid: elem.VerantwortlicherFirmaOid,
                geoLat: elem.MobileErfassung.GeoLat, geoLon: elem.MobileErfassung.GeoLon,
                geoAcc: elem.MobileErfassung.GeoAccuracy, geoHeading: elem.MobileErfassung.GeoHeading,
                geoText: elem.MobileErfassung.GeoText || '',
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
              Positionstext: result.positionstext,
              Termin: result.datum + 'T00:00:00',
              _geaendert: true,
            };
            if (result.geoLat != null) {
              setElem(prev => ({
                ...prev,
                ...patch,
                MobileErfassung: {
                  ...prev.MobileErfassung,
                  GeoLat: result.geoLat,
                  GeoLon: result.geoLon,
                  GeoAccuracy: result.geoAcc,
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
