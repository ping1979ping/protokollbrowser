import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { updateElement, deleteElement, saveFoto, getFotos, deleteFoto, getElement, findNachfolger, getElemente, getVerantwortliche, getProtokolleByGruppe, getProjektThemenByProjekt, getProjektThemenByGruppe, createAdhocProjektThema, type ProjektThema } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord, formatLatLon } from '../map-core/format';
import BautagebuchWizard from './BautagebuchWizard';
import ScrollToTopFab from './ScrollToTopFab';
import StatusBadge from './StatusBadge';
import { Card, SectionLabel, PrimaryButton, SecondaryButton, DangerButton } from '../ui/primitives';
import {
  IconChevronLeft, IconChevronRight, IconList, IconCamera, IconMapPin,
  IconTrash, IconPlus, IconX, IconCalendar, IconCheck, IconUser,
} from '../ui/icons';
import { nameNorm, bestMatch, computeSuggestion, type TermLike } from '../termNorm';
import ThemaAbgleichDialog from './ThemaAbgleichDialog';

interface Props {
  element: Protokollelement;
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  filteredIds?: string[];
  onBack: () => void;
  onNachfolger: (vorgaenger: Protokollelement) => void;
  onNavigate: (element: Protokollelement) => void;
  onClone?: (clone: { thema: string; status: number; termin: string; verantwOid: string; geoLat: number | null; geoLon: number | null; geoAcc: number | null; geoHeading: number | null; geoText: string }) => void;
  /** Tablet-Enabler: eingebettet in ein Master-Detail-Panel (Wurzel füllt Parent, Speichern-Leiste absolut statt fixed). Ändert keine Logik. */
  embedded?: boolean;
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

export default function ElementDetail({ element, protokoll, gruppe, filteredIds, onBack, onNachfolger, onNavigate, onClone, embedded = false }: Props) {
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
  // 06.5-09: Projektwoerterbuch-Picker (Term-basiert).
  const [gruppenThemen, setGruppenThemen] = useState<ProjektThema[]>([]);
  const [alleThemen, setAlleThemen] = useState<ProjektThema[]>([]);
  const [adhocEingabe, setAdhocEingabe] = useState('');
  const [abgleich, setAbgleich] = useState<{ eingabe: string; treffer: ProjektThema } | null>(null);
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
    const projektId = gruppe.projekt_id;
    if (!projektId) return;
    const alle = (await getProjektThemenByProjekt(projektId)).filter(t => t.is_active);
    setAlleThemen(alle);
    const grp = gruppe.hub_id
      ? await getProjektThemenByGruppe(projektId, gruppe.hub_id)
      : alle;
    setGruppenThemen(grp);
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

  // 06.5-09: Kaskade (§6.5) — nur auf editierbarem Element mit leerem Thema (D-11).
  const gruppenTermLike = useMemo<TermLike[]>(() =>
    gruppenThemen.map(t => ({
      id: t.id, name: t.name, name_norm: t.name_norm, synonyme: t.synonyme, is_active: t.is_active,
      sort_order: t.gruppen.find(g => g.gruppe_id === gruppe.hub_id)?.sort_order ?? 0,
    })), [gruppenThemen, gruppe.hub_id]);

  const vorschlag = useMemo(() => {
    if (!istNeu || elem.thema_term_id) return null;
    const inhId = vorgaenger[0]?.thema_term_id;
    const inh = inhId ? alleThemen.find(t => t.id === inhId) : null;
    return computeSuggestion({
      inheritedTerm: inh ? { id: inh.id, name: inh.name, name_norm: inh.name_norm, synonyme: inh.synonyme, is_active: inh.is_active } : null,
      elementText: `${elem.positionstitel} ${elem.positionstext}`,
      groupThemes: gruppenTermLike,
      lastElementTerm: null,
    });
  }, [istNeu, elem.thema_term_id, elem.positionstitel, elem.positionstext, vorgaenger, alleThemen, gruppenTermLike]);

  function waehleTerm(t: { id: string; name: string }) {
    update({ thema: t.name, thema_term_id: t.id });
    setAdhocEingabe('');
  }

  async function legeAdhocAn(val: string) {
    const name = val.trim();
    if (!name) return;
    const projektId = gruppe.projekt_id;
    if (!projektId) { update({ thema: name, thema_term_id: null }); return; }
    const term = await createAdhocProjektThema(projektId, name);
    setAlleThemen(prev => prev.some(t => t.id === term.id) ? prev : [...prev, term]);
    setGruppenThemen(prev => prev.some(t => t.id === term.id) ? prev : [...prev, term]);
    waehleTerm(term);
  }

  // Ad-hoc (§6.7): gleiche name_norm/Trigramm-Regel wie online (O-PW-10).
  async function starteAdhoc(val: string) {
    const name = val.trim();
    if (!name) return;
    const nn = nameNorm(name);
    const exakt = alleThemen.find(t => t.name_norm === nn);
    if (exakt) { waehleTerm(exakt); return; }
    const treffer = bestMatch(name, alleThemen);
    if (treffer) { setAbgleich({ eingabe: name, treffer }); return; }
    await legeAdhocAn(name);
  }

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
    if (!navigator.geolocation) { alert('GPS nicht verfügbar.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        updateMobile({ geo_lat: lat, geo_lon: lon, geo_accuracy: acc, geo_text: `${formatLatLon(lat, lon)} (${acc} m)` });
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

  const terminUeberfaellig = elem.termin && [0, 10].includes(elem.status) && new Date(elem.termin) < new Date(new Date().toDateString());

  // Auswahl-Button für einen Status (Farbe kommt aus StatusBadge, aktiv = blauer Ring).
  const statusPickerBtn = (s: number) => (
    <button key={s} onClick={() => updateStatus(s)}
      className="rounded-full transition"
      style={{ boxShadow: elem.status === s ? '0 0 0 2px var(--color-ping-blue)' : undefined }}
      aria-pressed={elem.status === s}>
      <StatusBadge status={s} />
    </button>
  );

  return (
    <div
      className={`relative bg-ping-surface ${embedded ? 'flex h-full flex-col overflow-hidden' : 'min-h-[100dvh]'}`}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      {/* Kopfzeile: ‹ Übersicht › + Positions-Meta */}
      <header className={`bg-ping-blue px-3 pb-2.5 pt-2.5 text-white ${embedded ? 'shrink-0' : 'sticky top-0 z-10'}`}>
        <div className="flex items-stretch gap-2">
          <button onClick={() => prevElem && !dirty && onNavigate(prevElem)} disabled={!prevElem || dirty}
            className="flex w-12 items-center justify-center rounded-lg bg-ping-blue-dark text-white transition enabled:hover:bg-ping-blue-light enabled:hover:text-ping-blue disabled:opacity-30"
            title="Vorheriges Element" aria-label="Vorheriges Element">
            <IconChevronLeft size={18} />
          </button>
          <button onClick={onBack}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ping-blue-dark py-2.5 text-[13px] font-semibold text-white transition hover:bg-ping-blue-light hover:text-ping-blue">
            <IconList size={16} /> Übersicht
          </button>
          <button onClick={() => nextElem && !dirty && onNavigate(nextElem)} disabled={!nextElem || dirty}
            className="flex w-12 items-center justify-center rounded-lg bg-ping-blue-dark text-white transition enabled:hover:bg-ping-blue-light enabled:hover:text-ping-blue disabled:opacity-30"
            title="Nächstes Element" aria-label="Nächstes Element">
            <IconChevronRight size={18} />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="shrink-0 font-mono text-[12px] font-semibold text-white">Pos. {elem.position}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ping-blue-light">{protokoll.name}</span>
          {gespeichert && !dirty && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold text-green-200">
              <IconCheck size={12} /> Gespeichert
            </span>
          )}
          <span className={`shrink-0 text-[10.5px] ${istNeu ? 'text-green-200' : 'text-ping-blue-light'}`}>
            {istNeu ? 'editierbar' : 'Status/GPS'}
          </span>
        </div>
      </header>

      {/* Inhalt — im Panel-Modus eigener Scroll-Container, sonst Seiten-Scroll (ScrollToTopFab) */}
      <div className={`px-3 pt-3 ${dirty ? 'pb-28' : 'pb-8'} space-y-2.5 ${embedded ? 'ping-scroll min-h-0 flex-1 overflow-y-auto' : ''}`}>

        {/* Vorgänger / Nachfolger */}
        {(vorgaenger.length > 0 || nachfolger.length > 0) && (
          <div className="rounded-2xl p-2.5" style={{ background: 'var(--color-ping-gold-light)', boxShadow: 'var(--shadow-card)' }}>
            {vorgaenger.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ping-gold-dark">Vorgänger</span>
                {vorgaenger.map(v => (
                  <button key={v.id} onClick={() => onNavigate(v)}
                    className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ping-gold-dark transition hover:bg-white">
                    Pos. {v.position} — {v.positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
            {nachfolger.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ping-gold-dark">Nachfolger</span>
                {nachfolger.map(n => (
                  <button key={n.id} onClick={() => onNavigate(n)}
                    className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-ping-gold-dark transition hover:bg-white">
                    Pos. {n.position} — {n.positionstext.slice(0, 40)}...
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Status */}
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ping-text-light">Status</span>
            <StatusBadge status={elem.status} />
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => updateStatus(10)}
              className="flex flex-1 items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 transition"
              style={{ boxShadow: elem.status === 10 ? '0 0 0 2px var(--color-ping-blue)' : undefined }}
              aria-pressed={elem.status === 10}>
              <StatusBadge status={10} />
            </button>
            <button onClick={() => updateStatus(20)}
              className="flex flex-1 items-center justify-center rounded-xl border border-black/5 bg-white py-2.5 transition"
              style={{ boxShadow: elem.status === 20 ? '0 0 0 2px var(--color-ping-blue)' : undefined }}
              aria-pressed={elem.status === 20}>
              <StatusBadge status={20} />
            </button>
            <button onClick={() => setShowWeitereStatus(!showWeitereStatus)}
              className="w-12 shrink-0 rounded-xl border border-black/10 bg-ping-bg text-[15px] font-semibold text-ping-text-mid"
              aria-expanded={showWeitereStatus} title="Weitere Status">···</button>
          </div>
          {/* weitere Status — ausklappbar */}
          {showWeitereStatus && (
            <div className="mt-2.5 border-t border-black/5 pt-2.5">
              <div className="flex flex-wrap gap-1.5">
                {HAUPT_STATUS.map(s => statusPickerBtn(s))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {WEITERE_STATUS.map(s => statusPickerBtn(s))}
              </div>
            </div>
          )}
        </Card>

        {/* Positionstext */}
        <Card className="p-3">
          <SectionLabel>Positionstext</SectionLabel>
          {istNeu ? (
            <textarea value={elem.positionstext} onChange={(e) => update({ positionstext: e.target.value })}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
              ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
              className="max-h-[50vh] min-h-[9rem] w-full resize-none overflow-auto rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-ping-blue" />
          ) : (
            <p className="text-[14px] leading-relaxed text-ping-text">{elem.positionstext || '—'}</p>
          )}
        </Card>

        {/* Termin · Verantwortlich · Thema */}
        <div className="flex gap-2">
          <Card className="min-w-0 flex-1 p-2.5">
            <SectionLabel><span className="inline-flex items-center gap-1"><IconCalendar size={12} /> Termin</span></SectionLabel>
            {istNeu ? (
              <input type="date" value={elem.termin ? elem.termin.slice(0, 10) : ''}
                onChange={(e) => update({ termin: e.target.value ? e.target.value + 'T00:00:00' : '' })}
                className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-ping-blue" />
            ) : (
              <p className="text-[12.5px] font-semibold text-ping-text" style={terminUeberfaellig ? { color: 'var(--color-ping-danger)' } : undefined}>{elem.termin ? new Date(elem.termin).toLocaleDateString('de-DE') : '—'}</p>
            )}
          </Card>
          <Card className="min-w-0 flex-1 p-2.5">
            <SectionLabel><span className="inline-flex items-center gap-1"><IconUser size={12} /> Verantw.</span></SectionLabel>
            {istNeu ? (
              <select value={elem.verantwortlicher_id || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = alleFirmen.find(t => t.oid === v);
                  update({ verantwortlicher_id: t?.oid || null, verantwortlicher_name: t?.name || '' });
                }}
                className="w-full rounded-lg border border-black/10 bg-white px-1.5 py-1.5 text-[12px] outline-none focus:border-ping-blue">
                <option value=""></option>
                {alleFirmen.map(t => (
                  <option key={t.oid} value={t.oid}>{t.kuerzel ? `${t.kuerzel} — ${t.name}` : t.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-[12.5px] text-ping-text">{(() => { const f = alleFirmen.find(t => t.oid === (elem.verantwortlicher_id || '')); return f ? (f.kuerzel ? `${f.kuerzel} — ${f.name}` : f.name) : (elem.verantwortlicher_name || '—'); })()}</p>
            )}
          </Card>
          <Card className="min-w-0 flex-1 p-2.5">
            <SectionLabel>Thema</SectionLabel>
            {istNeu ? (
              <div className="flex flex-col gap-1.5">
                {/* Kaskaden-Vorschlag: sichtbar, 1 Tap, NIE auto-gespeichert (W-4). */}
                {vorschlag && (
                  <button type="button" onClick={() => waehleTerm(vorschlag.term)}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ping-blue/40 bg-ping-blue-light/50 px-2 py-1 text-left">
                    <IconCheck size={13} className="shrink-0 text-ping-blue" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ping-text">{vorschlag.term.name}</span>
                    <span className="shrink-0 text-[10px] text-ping-text-mid">Vorschlag</span>
                  </button>
                )}
                <select value={elem.thema_term_id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) { update({ thema: '', thema_term_id: null }); return; }
                    const t = gruppenThemen.find(x => x.id === v) || alleThemen.find(x => x.id === v);
                    if (t) waehleTerm(t);
                  }}
                  className="min-w-0 rounded-lg border border-black/10 bg-white px-1.5 py-1.5 text-[12px] outline-none focus:border-ping-blue">
                  <option value="">Thema wählen oder eingeben</option>
                  {gruppenThemen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  {elem.thema_term_id && !gruppenThemen.some(t => t.id === elem.thema_term_id) && (
                    <option value={elem.thema_term_id}>{elem.thema}</option>
                  )}
                </select>
                <div className="flex items-center gap-1">
                  <input value={adhocEingabe}
                    onChange={(e) => setAdhocEingabe(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && adhocEingabe.trim()) { e.preventDefault(); starteAdhoc(adhocEingabe); } }}
                    placeholder="Neues Thema"
                    className="min-w-0 flex-1 rounded-lg border border-dashed border-ping-blue/40 bg-white px-1.5 py-1.5 text-[12px] outline-none focus:border-ping-blue" />
                  <button type="button" onClick={() => starteAdhoc(adhocEingabe)} disabled={!adhocEingabe.trim()}
                    className="flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-ping-blue px-2 text-white disabled:opacity-40" title="als neues Thema anlegen" aria-label="als neues Thema anlegen">
                    <IconPlus size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[12.5px] text-ping-text">{elem.thema || '—'}</p>
            )}
          </Card>
        </div>

        {/* Position + Titel */}
        <div className="flex gap-2">
          <Card className="w-28 shrink-0 p-2.5">
            <SectionLabel>Position</SectionLabel>
            {istNeu ? (
              <input type="text" value={elem.position} onChange={(e) => update({ position: e.target.value })}
                placeholder="Position"
                className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 font-mono text-[13px] outline-none focus:border-ping-blue" />
            ) : (
              <p className="font-mono text-[13px] text-ping-text">{elem.position}</p>
            )}
          </Card>
          <Card className="min-w-0 flex-1 p-2.5">
            <SectionLabel>Titel</SectionLabel>
            {istNeu ? (
              <input type="text" value={elem.positionstitel} onChange={(e) => update({ positionstitel: e.target.value })}
                placeholder="optional"
                className="w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-ping-blue" />
            ) : (
              <p className="truncate text-[13px] text-ping-text">{elem.positionstitel || '—'}</p>
            )}
          </Card>
        </div>

        {/* Bemerkung */}
        <Card className="p-2.5">
          <SectionLabel>Bemerkung (intern)</SectionLabel>
          {istNeu ? (
            <textarea value={elem.bemerkung} onChange={(e) => update({ bemerkung: e.target.value })} rows={2}
              placeholder="Optionale Bemerkung (intern)"
              className="w-full resize-none rounded-lg border border-black/10 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-ping-blue" />
          ) : (
            <p className="text-[13px] text-ping-text">{elem.bemerkung || '—'}</p>
          )}
        </Card>

        {/* Standort + Fotos */}
        <Card className="p-3">
          <div className="flex gap-4">
            {/* Standort */}
            <div className="flex-1">
              <SectionLabel><span className="inline-flex items-center gap-1"><IconMapPin size={12} /> Standort</span></SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={gpsErfassen} className="rounded-lg bg-ping-blue px-3 py-2 text-[12px] font-semibold text-white">GPS</button>
                <button onClick={() => setKarteOffen(true)} className="rounded-lg bg-ping-blue-light px-3 py-2 text-[12px] font-semibold text-ping-blue">Karte</button>
                {elem.mobile_erfassung.geo_lat != null && (
                  <button onClick={() => updateMobile({ geo_lat: null, geo_lon: null, geo_accuracy: null, geo_heading: null, geo_text: null })}
                    className="inline-flex items-center rounded-lg border border-black/10 bg-ping-bg px-2 py-2 text-ping-text-mid" aria-label="Standort löschen"><IconX size={14} /></button>
                )}
              </div>
            </div>
            {/* Fotos */}
            <div className="flex-1">
              <SectionLabel><span className="inline-flex items-center gap-1"><IconCamera size={12} /> Fotos</span></SectionLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {istNeu && (
                  <>
                    <button onClick={() => fotoRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-ping-blue px-3 py-2 text-[12px] font-semibold text-white">
                      <IconCamera size={14} /> Kamera
                    </button>
                    <button onClick={() => galerieRef.current?.click()} className="rounded-lg bg-ping-blue-light px-3 py-2 text-[12px] font-semibold text-ping-blue">
                      Galerie
                    </button>
                    <input ref={fotoRef} type="file" accept="image/*" capture="environment" onChange={fotoHinzufuegen} className="hidden" />
                    <input ref={galerieRef} type="file" accept="image/*" multiple onChange={fotoHinzufuegen} className="hidden" />
                  </>
                )}
                {fotos.length > 0 && (
                  <span className="rounded-full bg-ping-gold-light px-2 py-0.5 text-[11px] font-semibold text-ping-gold-dark">{fotos.length}</span>
                )}
              </div>
            </div>
          </div>
          {/* GPS-Koordinaten */}
          {elem.mobile_erfassung.geo_lat != null
            ? <p className="mt-2 text-[11px] text-ping-text-mid">
                {formatCoord(elem.mobile_erfassung.geo_lat, elem.mobile_erfassung.geo_lon!, elem.mobile_erfassung.geo_accuracy, elem.mobile_erfassung.geo_heading)}
              </p>
            : <p className="mt-2 text-[11px] text-ping-text-light">Kein Standort</p>}
          {/* Foto-Thumbnails */}
          {fotos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fotos.map(f => (
                <div key={f.fotoId} className="relative h-12 w-12">
                  <img src={f.url} alt="" className="h-full w-full rounded-lg object-cover" />
                  {istNeu && (
                    <button onClick={() => fotoLoeschen(f.fotoId)}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-white"
                      style={{ background: 'var(--color-ping-danger)' }} aria-label="Foto löschen"><IconX size={10} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bautagebuch bearbeiten */}
        {istBautagebuch && (
          <button
            onClick={() => setShowBtWizard(true)}
            className="w-full rounded-xl bg-ping-gold px-4 py-[13px] text-[15px] font-semibold text-white transition hover:bg-ping-gold-dark"
          >
            Bautagebuch bearbeiten
          </button>
        )}

        {/* Verschieben in anderes Protokoll (nur neue Elemente) */}
        {istNeu && verschiebungsziele.length > 0 && (
          <Card className="p-2.5">
            <SecondaryButton block onClick={() => setShowProtokollWahl(!showProtokollWahl)}>
              In anderes Protokoll verschieben
            </SecondaryButton>
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
                    className="w-full rounded-lg border border-black/10 bg-ping-bg px-3 py-2 text-left text-[13px] transition hover:bg-ping-blue-light"
                  >
                    {p.name} {p.nummer < 0 ? '(Anhang)' : p.is_new ? '(Entwurf)' : `Nr. ${p.nummer}`}
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Löschen (nur neue Elemente) */}
        {istNeu && (
          <DangerButton
            block
            onClick={async () => {
              if (!confirm('Diesen Punkt wirklich löschen?')) return;
              await deleteElement(elem.id);
              onBack();
            }}
          >
            <IconTrash size={16} /> Punkt löschen
          </DangerButton>
        )}

        {/* Nachfolger + Klonen */}
        {!istNeu && !istBautagebuch && (
          <div className="flex gap-2">
            <PrimaryButton className="flex-1" onClick={() => onNachfolger(elem)}>
              <IconPlus size={16} /> Nachfolger
            </PrimaryButton>
            {onClone && (
              <SecondaryButton className="flex-1" onClick={() => onClone({
                thema: elem.thema, status: elem.status,
                termin: elem.termin ? elem.termin.slice(0, 10) : '',
                verantwOid: elem.verantwortlicher_id || '',
                geoLat: elem.mobile_erfassung.geo_lat, geoLon: elem.mobile_erfassung.geo_lon,
                geoAcc: elem.mobile_erfassung.geo_accuracy, geoHeading: elem.mobile_erfassung.geo_heading,
                geoText: elem.mobile_erfassung.geo_text || '',
              })}>
                Klonen
              </SecondaryButton>
            )}
          </div>
        )}
      </div>

      {/* Schwebende Aktionsleiste — nur bei Änderungen (dirty) */}
      {dirty && (
        <div
          className={`${embedded ? 'absolute' : 'fixed'} inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/85 px-3 py-3 backdrop-blur`}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-[640px] items-center gap-2">
            <SecondaryButton className="flex-1" onClick={() => { setElem({ ...element }); setDirty(false); setGespeichert(false); }}>
              Rückgängig
            </SecondaryButton>
            <PrimaryButton className="flex-[1.4]" onClick={speichern}>
              Speichern
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* Karten-Editor */}
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
      {/* Linie-2-Abgleich (§6.7): unscharfer Offline-Treffer -> „Meintest du?". */}
      {abgleich && (
        <ThemaAbgleichDialog
          eingabe={abgleich.eingabe}
          treffer={abgleich.treffer.name}
          onUebernehmen={() => { waehleTerm(abgleich.treffer); setAbgleich(null); }}
          onTrotzdem={async () => { const v = abgleich.eingabe; setAbgleich(null); await legeAdhocAn(v); }}
          onClose={() => setAbgleich(null)}
        />
      )}
      <ScrollToTopFab />
    </div>
  );
}
