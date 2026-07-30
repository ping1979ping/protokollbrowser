import { useState, useRef, useEffect, useMemo } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { STATUS_MAP } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto, getProjektThemenByProjekt, getProjektThemenByGruppe, createAdhocProjektThema, type ProjektThema } from '../db';
import type { Verantwortlicher } from '../db';
import MapEditorModal from './map/MapEditorModal';
import { formatCoord } from '../map-core/format';
import BautagebuchWizard from './BautagebuchWizard';
import ScrollToTopFab from './ScrollToTopFab';
import StatusBadge from './StatusBadge';
import { ScreenHeader, Card, SectionLabel, PrimaryButton, SecondaryButton } from '../ui/primitives';
import { IconMapPin, IconCamera, IconCalendar, IconUser, IconFolder, IconPlus, IconX, IconCheck } from '../ui/icons';
import { nameNorm, bestMatch, computeSuggestion, type TermLike } from '../termNorm';
import ThemaAbgleichDialog from './ThemaAbgleichDialog';

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
const WEITERE_STATUS = [19, 11, 25, 17, 21, 16, 26];

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
  // 06.5-09: Projektwoerterbuch-Picker (Term-basiert) statt freier Themen-Strings.
  const projektId = gruppe.projekt_id;
  const [themaTermId, setThemaTermId] = useState<string | null>(clone ? null : (vorgaenger?.thema_term_id ?? null));
  const [gruppenThemen, setGruppenThemen] = useState<ProjektThema[]>([]);
  const [alleThemen, setAlleThemen] = useState<ProjektThema[]>([]);
  const [adhocEingabe, setAdhocEingabe] = useState('');
  const [abgleich, setAbgleich] = useState<{ eingabe: string; treffer: ProjektThema } | null>(null);
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
  }, []);

  // 06.5-09: Projektwoerterbuch laden — alle aktiven Projekt-Terms (Abgleich,
  // projektweit) + die gruppen-gescopten Themen (Picker-Liste).
  useEffect(() => {
    if (!projektId) return;
    (async () => {
      const alle = (await getProjektThemenByProjekt(projektId)).filter(t => t.is_active);
      setAlleThemen(alle);
      const grp = gruppe.hub_id
        ? await getProjektThemenByGruppe(projektId, gruppe.hub_id)
        : alle;
      setGruppenThemen(grp);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projektId]);

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
      thema_term_id: themaTermId,
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

  // 06.5-09: Term-Signale fuer die Kaskade (§6.5).
  const inheritedTerm = useMemo<TermLike | null>(() => {
    const id = vorgaenger?.thema_term_id;
    if (!id) return null;
    const t = alleThemen.find(x => x.id === id);
    return t ? { id: t.id, name: t.name, name_norm: t.name_norm, synonyme: t.synonyme, is_active: t.is_active } : null;
  }, [vorgaenger, alleThemen]);

  const gruppenTermLike = useMemo<TermLike[]>(() =>
    gruppenThemen.map(t => ({
      id: t.id, name: t.name, name_norm: t.name_norm, synonyme: t.synonyme, is_active: t.is_active,
      sort_order: t.gruppen.find(g => g.gruppe_id === gruppe.hub_id)?.sort_order ?? 0,
    })), [gruppenThemen, gruppe.hub_id]);

  // Sichtbarer Vorschlag — NIE auto-gespeichert (W-4/D-11); nur solange kein Thema gesetzt ist.
  const vorschlag = useMemo(() =>
    themaTermId ? null : computeSuggestion({
      inheritedTerm,
      elementText: `${titel} ${positionstext}`,
      groupThemes: gruppenTermLike,
      lastElementTerm: null,
    }),
    [themaTermId, inheritedTerm, titel, positionstext, gruppenTermLike]);

  function waehleTerm(t: { id: string; name: string }) {
    setThema(t.name);
    setThemaTermId(t.id);
    setAdhocEingabe('');
    setDirty(true);
  }

  async function legeAdhocAn(val: string) {
    const name = val.trim();
    if (!name) return;
    if (!projektId) { setThema(name); setThemaTermId(null); setDirty(true); return; }
    const term = await createAdhocProjektThema(projektId, name);
    setAlleThemen(prev => prev.some(t => t.id === term.id) ? prev : [...prev, term]);
    setGruppenThemen(prev => prev.some(t => t.id === term.id) ? prev : [...prev, term]);
    waehleTerm(term);
  }

  // Ad-hoc-Fluss (§6.7): exakt -> waehlen; unscharfer Treffer -> Linie-2-Dialog;
  // sonst offline anlegen (Client-UUID). Gleiche name_norm/Trigramm-Regel wie online (O-PW-10).
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

  const alleStatus = [...HAUPT_STATUS, ...WEITERE_STATUS];

  return (
    <div className="min-h-screen bg-ping-surface pb-40">
      {/* Blauer Kopf */}
      <ScreenHeader
        onBack={() => {
          if (dirty && !confirm('Änderungen werden nicht gespeichert. Zur Übersicht?')) return;
          onBack();
        }}
        title={vorgaenger ? 'Nachfolger erstellen' : 'Neuer Punkt'}
        subtitle={protokoll.name}
      />

      {/* Inhalt — fensterscrollend, damit ScrollToTopFab (window.scrollY) unverändert greift */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-3 p-4">

        {/* Vorgänger-Hinweis */}
        {vorgaenger && (
          <Card className="p-3">
            <SectionLabel>Vorgänger</SectionLabel>
            <p className="text-[13px] leading-snug text-ping-text">
              <span className="mr-1 rounded bg-ping-blue-light px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ping-blue">
                Pos. {vorgaenger.position}
              </span>
              {vorgaenger.positionstext.slice(0, 80)}…
            </p>
          </Card>
        )}

        {/* 1. Positionstext (Pflichtfeld) */}
        <Card className="p-4">
          <SectionLabel>Positionstext *</SectionLabel>
          <textarea
            value={positionstext}
            onChange={(e) => { setPositionstext(e.target.value); setDirty(true); }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
            placeholder="Beschreibung des Punktes …"
            className="max-h-[50vh] min-h-[9rem] w-full resize-none overflow-auto rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-ping-text outline-none placeholder:text-ping-text-light focus:border-ping-blue"
          />
        </Card>

        {/* 2. Status */}
        <Card className="p-4">
          <SectionLabel>Status</SectionLabel>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <button
              type="button"
              onClick={() => setShowStatusPicker(!showStatusPicker)}
              className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] font-semibold text-ping-text-mid transition hover:bg-black/5"
            >
              {showStatusPicker ? 'Schließen' : 'Ändern'}
            </button>
          </div>
          {showStatusPicker && (
            <div className="mt-2.5 flex flex-wrap gap-2 border-t border-black/5 pt-2.5">
              {alleStatus.map((s) => STATUS_MAP[s] && (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatus(s); setShowStatusPicker(false); setDirty(true); }}
                  className="rounded-full transition active:scale-95"
                  style={status === s ? { boxShadow: '0 0 0 2px var(--color-ping-blue)' } : undefined}
                >
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* 3. Thema — Projektwoerterbuch-Picker (06.5-09): Kaskaden-Vorschlag + Ad-hoc + Linie-2-Abgleich */}
        <Card className="p-4">
          <SectionLabel>Thema</SectionLabel>
          {/* Kaskaden-Vorschlag: sichtbar vorbelegt, 1 Tap uebernimmt, NIE auto-gespeichert (W-4/D-11). */}
          {vorschlag && (
            <button
              type="button"
              onClick={() => waehleTerm(vorschlag.term)}
              className="mb-2 flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-ping-blue/40 bg-ping-blue-light/50 px-3 py-2 text-left transition active:scale-[.99]"
            >
              <IconCheck size={16} className="shrink-0 text-ping-blue" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ping-blue">Vorschlag</span>
                <span className="block truncate text-[14px] text-ping-text">{vorschlag.term.name}</span>
              </span>
              <span className="shrink-0 text-[12px] text-ping-text-mid">{vorschlag.reason}</span>
            </button>
          )}
          {/* Picker aus den Gruppen-Themen. */}
          <select
            value={themaTermId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) { setThema(''); setThemaTermId(null); setDirty(true); return; }
              const t = gruppenThemen.find(x => x.id === v) || alleThemen.find(x => x.id === v);
              if (t) waehleTerm(t);
            }}
            className="w-full min-h-[44px] rounded-xl border border-black/10 bg-white px-3 text-[14px] text-ping-text outline-none focus:border-ping-blue"
          >
            <option value="">Thema wählen oder eingeben</option>
            {gruppenThemen.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            {themaTermId && !gruppenThemen.some(t => t.id === themaTermId) && (
              <option value={themaTermId}>{thema}</option>
            )}
          </select>
          {/* Ad-hoc: neues Thema offline anlegen (Client-UUID, herkunft='adhoc'). */}
          <div className="mt-2 flex items-center gap-2">
            <input
              value={adhocEingabe}
              onChange={(e) => setAdhocEingabe(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && adhocEingabe.trim()) { e.preventDefault(); starteAdhoc(adhocEingabe); } }}
              placeholder="Neues Thema"
              className="min-w-0 flex-1 min-h-[44px] rounded-xl border border-dashed border-ping-blue/40 bg-white px-3 text-[14px] text-ping-text outline-none focus:border-ping-blue placeholder:text-ping-text-light"
            />
            <button
              type="button"
              onClick={() => starteAdhoc(adhocEingabe)}
              disabled={!adhocEingabe.trim()}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl bg-ping-blue px-3 text-[13px] font-semibold text-white transition disabled:opacity-40"
            >
              <IconPlus size={14} /> Anlegen
            </button>
          </div>
          {adhocEingabe.trim() && (
            <p className="mt-1 text-[12px] text-ping-text-mid">{`'${adhocEingabe.trim()}' als neues Thema anlegen`}</p>
          )}
          {thema && !themaTermId && (
            <p className="mt-1 text-[12px] text-ping-gold-dark">{`Freies Thema „${thema}" (nicht im Wörterbuch)`}</p>
          )}
        </Card>

        {/* 4. Termin + Verantwortlich */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <SectionLabel>Termin</SectionLabel>
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 focus-within:border-ping-blue">
              <IconCalendar size={17} className="shrink-0 text-ping-blue" />
              <input
                type="date"
                value={termin}
                onChange={(e) => { setTermin(e.target.value); setDirty(true); }}
                className={`w-full bg-transparent text-[14px] outline-none ${terminUeberfaellig ? 'font-semibold text-red-600' : 'text-ping-text'}`}
              />
            </div>
            {terminUeberfaellig && <p className="mt-1 text-[11px] font-semibold text-red-600">Termin überfällig</p>}
          </Card>

          <Card className="p-4">
            <SectionLabel>Verantwortlich</SectionLabel>
            <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 focus-within:border-ping-blue">
              <IconUser size={17} className="shrink-0 text-ping-blue" />
              <select
                value={verantwFirmaOid}
                onChange={(e) => { setVerantwFirmaOid(e.target.value); setDirty(true); }}
                className="w-full bg-transparent text-[14px] text-ping-text outline-none"
              >
                <option value="">(keine)</option>
                {alleFirmen.map((t) => (
                  <option key={t.oid} value={t.oid}>{t.kuerzel ? `${t.kuerzel} — ${t.name}` : t.name}</option>
                ))}
              </select>
            </div>
          </Card>
        </div>

        {/* 5. Titel + Position */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <SectionLabel>Titel</SectionLabel>
            <input
              type="text"
              value={titel}
              onChange={(e) => { setTitel(e.target.value); setDirty(true); }}
              placeholder="optional"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] text-ping-text outline-none placeholder:text-ping-text-light focus:border-ping-blue"
            />
          </Card>
          <Card className="p-4">
            <SectionLabel>Position</SectionLabel>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="automatisch"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 font-mono text-[14px] text-ping-text outline-none placeholder:text-ping-text-light focus:border-ping-blue"
            />
          </Card>
        </div>

        {/* 6. Bemerkung */}
        <Card className="p-4">
          <SectionLabel>Bemerkung (intern)</SectionLabel>
          <textarea
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
            rows={2}
            placeholder="Optionale interne Bemerkung"
            className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] text-ping-text outline-none placeholder:text-ping-text-light focus:border-ping-blue"
          />
        </Card>

        {/* 7. Standort + Fotos */}
        <Card className="p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Standort */}
            <div>
              <SectionLabel>Standort</SectionLabel>
              <div className="flex items-center gap-2">
                <PrimaryButton className="flex-1 !px-3 !py-2 !text-[13px]" onClick={gpsErfassen}>
                  <IconMapPin size={16} /> GPS
                </PrimaryButton>
                <SecondaryButton className="flex-1 !px-3 !py-2 !text-[13px]" onClick={() => setKarteOffen(true)}>
                  <IconMapPin size={16} /> Karte
                </SecondaryButton>
                {geoLat != null && (
                  <button
                    type="button"
                    onClick={() => { setGeoLat(null); setGeoLon(null); setGeoAcc(null); setGeoHeading(null); setGeoText(''); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/10 text-ping-text-mid transition hover:bg-black/5"
                    aria-label="Standort entfernen"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
            </div>
            {/* Fotos */}
            <div>
              <SectionLabel>Fotos</SectionLabel>
              <div className="flex items-center gap-2">
                <PrimaryButton className="flex-1 !px-3 !py-2 !text-[13px]" onClick={() => fotoRef.current?.click()}>
                  <IconCamera size={16} /> Kamera
                </PrimaryButton>
                <SecondaryButton className="flex-1 !px-3 !py-2 !text-[13px]" onClick={() => galerieRef.current?.click()}>
                  <IconFolder size={16} /> Galerie
                </SecondaryButton>
                {tempFotos.length > 0 && (
                  <span className="shrink-0 rounded-full bg-ping-gold-light px-2 py-1 text-[11px] font-bold text-ping-gold-dark">
                    {tempFotos.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* GPS-Text + Auto-GPS-Schalter */}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-3">
            <div className="min-w-0 truncate text-[12px] font-medium text-ping-text-mid">
              {geoText ? geoText : (autoGps ? 'Wird ermittelt …' : 'Kein Standort')}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ping-text-light">Auto-GPS</span>
              <button
                type="button"
                onClick={toggleAutoGps}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition ${autoGps ? 'bg-green-500' : 'bg-gray-300'}`}
                aria-pressed={autoGps}
                aria-label="Auto-GPS umschalten"
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${autoGps ? 'translate-x-[1rem]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* Foto-Vorschau */}
          {tempFotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {tempFotos.map((f, i) => (
                <div key={i} className="relative h-12 w-12">
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => setTempFotos(prev => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow"
                    aria-label="Foto entfernen"
                  >
                    <IconX size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Versteckte Datei-Inputs */}
          <input ref={fotoRef} type="file" accept="image/*" capture="environment"
            onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); fotoRef.current!.value = ''; } }}
            className="hidden" />
          <input ref={galerieRef} type="file" accept="image/*" multiple
            onChange={async (e) => { if (e.target.files) { const files: File[] = []; for (const f of Array.from(e.target.files)) { const buf = await f.arrayBuffer(); files.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified })); } setTempFotos(prev => [...prev, ...files]); } }}
            className="hidden" />
        </Card>

        {/* Map-Editor-Modal */}
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

      {/* Sticky Aktionsleiste unten — „Punkt anlegen" primär */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/90 px-4 pb-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] flex-col gap-2">
          {dirty && (
            <span className="text-[11px] font-semibold text-ping-gold-dark">Ungespeicherte Änderungen</span>
          )}
          <div className="flex gap-2">
            <SecondaryButton className="flex-1" onClick={speichernUndNeu}>
              <IconPlus size={16} /> Speichern &amp; Neu
            </SecondaryButton>
            {onSavedAndClone && (
              <SecondaryButton className="flex-1" onClick={speichernUndKlonen}>
                Klonen
              </SecondaryButton>
            )}
          </div>
          <PrimaryButton block onClick={speichern}>Punkt anlegen</PrimaryButton>
        </div>
      </div>

      {/* Bautagebuch-Wizard */}
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
