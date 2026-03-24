import { useState, useEffect, useRef, useCallback } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { updateElement, deleteElement, saveFoto, getFotos, deleteFoto, getElement, findNachfolger, getElemente, getVerantwortliche, getProtokolleByGruppe } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from './map/mapUtils';
import BautagebuchWizard from './BautagebuchWizard';

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
    ? firmen.map(f => ({ Oid: f.ID, Name: f.Name }))
    : [
        ...protokoll.Teilnehmer.map(t => ({ Oid: t.Oid, Name: t.Name })),
        ...protokoll.Verteiler
          .filter(v => !protokoll.Teilnehmer.some(t => t.Oid === v.Oid))
          .map(v => ({ Oid: v.Oid, Name: v.Name })),
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
  const istWeitererStatus = WEITERE_STATUS.includes(elem.Status);
  const terminUeberfaellig = elem.Termin && [0, 10].includes(elem.Status) && new Date(elem.Termin) < new Date(new Date().toDateString());

  return (
    <div className="min-h-screen bg-ping-bg" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      {/* Header */}
      <div className="bg-ping-blue text-white p-3">
        {/* Zeile 1: Vorh. | Übersicht | Nächst. — alle gleich breit */}
        <div className="flex gap-2">
          <button onClick={() => prevElem && !dirty && onNavigate(prevElem)} disabled={!prevElem || dirty}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-center ${prevElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/50 cursor-default'}`}>
            &larr; Vorh.
          </button>
          <button onClick={onBack}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue">
            &uarr; Übersicht
          </button>
          <button onClick={() => nextElem && !dirty && onNavigate(nextElem)} disabled={!nextElem || dirty}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium text-center ${nextElem && !dirty ? 'bg-ping-blue-dark text-white hover:bg-ping-blue-light hover:text-ping-blue' : 'bg-ping-blue-dark/30 text-white/50 cursor-default'}`}>
            Nächst. &rarr;
          </button>
        </div>
        {/* Zeile 2: Status | Pos. | Protokollname */}
        <div className="flex items-center gap-2 mt-2">
          {st && <span className={`px-3 py-1 rounded text-sm font-medium w-24 text-center shrink-0 ${st.css}`}>{st.label}</span>}
          <span className="text-sm text-ping-blue-light">Pos. {elem.Position}</span>
          <span className="text-sm text-ping-blue-light/70 truncate">{protokoll.Name}</span>
        </div>
        {!istNeu && <p className="text-sm text-ping-blue-light mt-1">Nur Status änderbar</p>}
        {istNeu && <p className="text-sm text-green-300 mt-1">&#9998; Neues Element — editierbar</p>}
      </div>

      {/* Buttons direkt unter Header */}
      <div className="px-4 pt-3 flex gap-2">
        <button onClick={speichern}
          className={`flex-1 py-3.5 rounded-lg font-medium text-white text-base transition ${
            gespeichert ? 'bg-green-600' : dirty ? 'bg-red-500 hover:bg-red-600' : 'bg-ping-blue hover:bg-ping-blue-dark'
          }`}>
          {gespeichert ? 'Gespeichert' : dirty ? 'Speichern!' : 'Speichern'}
        </button>
        <button onClick={() => { setElem({ ...element }); setDirty(false); setGespeichert(false); }}
          disabled={!dirty}
          className={`flex-1 py-3.5 rounded-lg font-medium text-base transition ${dirty ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-100 text-gray-600 cursor-default'}`}>
          Rückgängig
        </button>
      </div>

      <div className="p-4 space-y-3.5">

        {/* Vorgänger/Nachfolger Navigation */}
        {(vorgaenger.length > 0 || nachfolger.length > 0) && (
          <div className="bg-amber-50 rounded-lg p-3.5 border border-amber-200">
            {vorgaenger.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-amber-600 font-medium">Vorgänger:</span>
                {vorgaenger.map(v => (
                  <button key={v.Id} onClick={() => onNavigate(v)}
                    className="text-sm bg-amber-100 text-amber-800 px-3 py-2 rounded hover:bg-amber-200">
                    Pos. {v.Position} — {v.Positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
            {nachfolger.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-sm text-amber-600 font-medium">Nachfolger:</span>
                {nachfolger.map(n => (
                  <button key={n.Id} onClick={() => onNavigate(n)}
                    className="text-sm bg-amber-100 text-amber-800 px-3 py-2 rounded hover:bg-amber-200">
                    Pos. {n.Position} — {n.Positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Positionstext */}
        <div className="bg-white rounded-lg p-3.5 border border-gray-200">
          <label className="text-sm text-gray-600 font-medium">Positionstext</label>
          {istNeu ? (
            <textarea value={elem.Positionstext} onChange={(e) => update({ Positionstext: e.target.value })}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none mt-0.5 min-h-[9rem] max-h-[50vh] overflow-auto" />
          ) : (
            <p className="text-base text-gray-700 mt-0.5">{elem.Positionstext || '—'}</p>
          )}
        </div>

        {/* Status */}
        <div className="bg-white rounded-lg p-3.5 border border-gray-200">
          <label className="text-sm text-gray-600 font-medium block mb-1">Status</label>
          <div className="flex gap-2 flex-wrap">
            {HAUPT_STATUS.map(s => (
              <button key={s} onClick={() => updateStatus(s)}
                className={`px-4 py-2.5 rounded text-sm font-medium transition ${
                  elem.Status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                }`}>
                {STATUS_MAP[s].label}
              </button>
            ))}
            <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
              className={`px-4 py-2.5 rounded text-sm font-medium transition ${
                istWeitererStatus && !showWeitereStatus ? STATUS_MAP[elem.Status].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
              }`}>
              {istWeitererStatus && !showWeitereStatus ? STATUS_MAP[elem.Status].label : '...'}
            </button>
          </div>
          {showWeitereStatus && (
            <div className="flex gap-2 flex-wrap mt-1.5 pt-1.5 border-t border-gray-200">
              {WEITERE_STATUS.map(s => STATUS_MAP[s] && (
                <button key={s} onClick={() => updateStatus(s)}
                  className={`px-4 py-2.5 rounded text-sm font-medium transition ${
                    elem.Status === s ? STATUS_MAP[s].css + ' ring-2 ring-ping-blue' : 'bg-gray-50 text-gray-500'
                  }`}>
                  {STATUS_MAP[s].label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Position / Thema / Termin */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium block mb-1">Position</label>
            {istNeu ? (
              <input type="text" value={elem.Position} onChange={(e) => update({ Position: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className="text-sm text-gray-700 font-mono">{elem.Position}</p>
            )}
          </div>
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium block mb-1">Thema</label>
            {istNeu ? (
              <div className="flex gap-2">
                <select value={elem.Thema}
                  onChange={(e) => update({ Thema: e.target.value })}
                  className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue">
                  {themenVorschlaege.map(t => <option key={t} value={t}>{t}</option>)}
                  {elem.Thema && !themenVorschlaege.includes(elem.Thema) && <option value={elem.Thema}>{elem.Thema}</option>}
                </select>
                <button onClick={() => { const val = prompt('Neues Thema eingeben:', elem.Thema); if (val != null) update({ Thema: val }); }}
                  className="px-3 py-2 bg-ping-blue text-white rounded text-sm font-bold shrink-0" title="Neues Thema">+</button>
              </div>
            ) : (
              <p className="text-sm text-gray-700">{elem.Thema || '—'}</p>
            )}
          </div>
          <div className="col-span-2 bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium block mb-1">Termin</label>
            {istNeu ? (
              <input type="date" value={elem.Termin ? elem.Termin.slice(0, 10) : ''}
                onChange={(e) => update({ Termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
                className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue" />
            ) : (
              <p className={`text-sm ${terminUeberfaellig ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>{elem.Termin ? new Date(elem.Termin).toLocaleDateString('de-DE') : '—'}</p>
            )}
          </div>
        </div>

        {/* Verantwortlich */}
        <div className="bg-white rounded-lg p-3.5 border border-gray-200">
          <label className="text-sm text-gray-600 font-medium block mb-1">Verantwortlich (Firma)</label>
          {istNeu ? (
            <select value={elem.VerantwortlicherFirmaOid}
              onChange={(e) => {
                const v = e.target.value;
                const t = alleFirmen.find(t => t.Oid === v);
                update({ VerantwortlicherFirmaOid: t?.Oid || '', VerantwortlicherFirmaName: t?.Name || '' });
              }}
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue">
              <option value=""></option>
              {alleFirmen.map(t => (
                <option key={t.Oid} value={t.Oid}>{t.Name}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-700">{elem.VerantwortlicherFirmaName || '—'}</p>
          )}
        </div>

        {/* GPS */}
        <div className="bg-white rounded-lg p-3.5 border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-600 font-medium">GPS-Standort</label>
            <div className="flex gap-2">
              <button onClick={gpsErfassen} className="bg-green-600 text-white px-3 py-2 rounded text-sm">Erfassen</button>
              <button onClick={() => setKarteOffen(true)} className="bg-ping-blue text-white px-3 py-2 rounded text-sm">Karte</button>
              {elem.MobileErfassung.GeoLat != null && (
                <button onClick={() => updateMobile({ GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoHeading: null, GeoText: null })}
                  className="bg-red-500 text-white px-3 py-2 rounded text-sm">Löschen</button>
              )}
            </div>
          </div>
          {elem.MobileErfassung.GeoLat != null
            ? <p className="text-sm text-gray-600">
                {formatCoord(elem.MobileErfassung.GeoLat, elem.MobileErfassung.GeoLon!, elem.MobileErfassung.GeoAccuracy, elem.MobileErfassung.GeoHeading)}
              </p>
            : <p className="text-sm text-gray-500">Kein Standort</p>}
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

        {/* Fotos */}
        {istNeu && (
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-600 font-medium">Fotos ({fotos.length})</label>
              <div className="flex gap-2">
                <button onClick={() => fotoRef.current?.click()} className="bg-purple-600 text-white px-3 py-2 rounded text-sm flex items-center gap-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" /></svg>Foto</button>
                <button onClick={() => galerieRef.current?.click()} className="bg-blue-600 text-white px-3 py-2 rounded text-sm">Galerie</button>
              </div>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={fotoHinzufuegen} className="hidden" />
              <input ref={galerieRef} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden" />
            </div>
            {fotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {fotos.map(f => (
                  <div key={f.fotoId} className="relative w-16 h-16">
                    <img src={f.url} alt="" className="w-full h-full object-cover rounded" />
                    <button onClick={() => fotoLoeschen(f.fotoId)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white w-8 h-8 rounded-full text-sm flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!istNeu && fotos.length > 0 && (
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium">Fotos ({fotos.length})</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {fotos.map(f => (
                <img key={f.fotoId} src={f.url} alt="" className="w-16 h-16 object-cover rounded" />
              ))}
            </div>
          </div>
        )}

        {/* Bemerkung (intern) */}
        <div className="bg-white rounded-lg p-3.5 border border-gray-200">
          <label className="text-sm text-gray-600 font-medium block mb-1">Bemerkung (intern)</label>
          {istNeu ? (
            <textarea value={elem.Bemerkung} onChange={(e) => update({ Bemerkung: e.target.value })} rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue resize-none" />
          ) : (
            <p className="text-sm text-gray-700">{elem.Bemerkung || '—'}</p>
          )}
        </div>

        {/* Titel */}
        {istNeu && (
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium block mb-1">Titel (optional, für Gestaltung)</label>
            <input type="text" value={elem.Positionstitel} onChange={(e) => update({ Positionstitel: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-200 rounded text-base focus:outline-none focus:ring-1 focus:ring-ping-blue" />
          </div>
        )}
        {!istNeu && elem.Positionstitel && (
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <label className="text-sm text-gray-600 font-medium block mb-1">Titel</label>
            <p className="text-sm text-gray-700">{elem.Positionstitel}</p>
          </div>
        )}

        {/* Bautagebuch bearbeiten */}
        {istBautagebuch && (
          <button
            onClick={() => setShowBtWizard(true)}
            className="w-full py-3.5 rounded-lg font-medium text-base bg-amber-600 text-white hover:bg-amber-700 transition"
          >
            Bautagebuch bearbeiten
          </button>
        )}

        {/* Verschieben in anderes Protokoll (nur neue Elemente) */}
        {istNeu && verschiebungsziele.length > 0 && (
          <div className="bg-white rounded-lg p-3.5 border border-gray-200">
            <button
              onClick={() => setShowProtokollWahl(!showProtokollWahl)}
              className="w-full py-3.5 rounded-lg font-medium text-base bg-indigo-600 text-white hover:bg-indigo-700 transition"
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
                    className="w-full text-left px-4 py-3 rounded bg-gray-50 hover:bg-indigo-50 text-base border border-gray-200"
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
            className="w-full py-3.5 rounded-lg font-medium text-base bg-red-600 text-white hover:bg-red-700 transition"
          >
            Punkt löschen
          </button>
        )}

        {/* Nachfolger + Klonen */}
        {!istNeu && !istBautagebuch && (
          <div className="flex gap-2">
            <button onClick={() => onNachfolger(elem)}
              className="flex-1 py-3.5 rounded-lg font-medium text-base bg-ping-gold text-white hover:bg-ping-gold-dark transition">
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
                className="flex-1 py-3.5 rounded-lg font-medium text-base bg-amber-600 text-white hover:bg-amber-700 transition">
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
    </div>
  );
}
