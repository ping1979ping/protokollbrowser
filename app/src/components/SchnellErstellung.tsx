import { useState, useEffect, useRef } from 'react';
import type { Protokoll, Protokollelement, Protokollgruppe } from '../types';
import { addElement, getElemente, getVerantwortliche, getProtokolleByGruppe, saveFoto } from '../db';
import type { Verantwortlicher } from '../db';
import { extractGpsFromImage } from '../exifGps';
import MapEditorModal from './map/MapEditorModal';
import StatusBadge from './StatusBadge';
import { Screen, ScreenHeader, StickyFooter, Card, SectionLabel, Chip, PrimaryButton } from '../ui/primitives';
import { IconCamera, IconFolder, IconMapPin, IconCheck, IconX, IconPlus } from '../ui/icons';

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

  // GPS-Fallback-Kette: Device-GPS > BBox-Ecke > Karten-Auswahl > null
  const [deviceGps, setDeviceGps] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [fallbackGps, setFallbackGps] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'ermitteln' | 'device' | 'bbox' | 'manuell' | 'keins'>('ermitteln');
  const [showMapPicker, setShowMapPicker] = useState(false);

  // Ergebnis
  const [erstellt, setErstellt] = useState(0);
  const [verarbeitet, setVerarbeitet] = useState(false);

  useEffect(() => {
    getVerantwortliche().then(setFirmen);
    (async () => {
      const prots = await getProtokolleByGruppe(gruppe.id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      const themen = [...new Set(alleElems.map(e => e.thema).filter(t => t && t !== 'Bautagebuch'))];
      themen.sort();
      setThemenVorschlaege(themen);
    })();
    return () => { fotoUrls.forEach(u => URL.revokeObjectURL(u)); };
  }, []);

  // GPS-Fallback beim Betreten der Fotos-Phase
  useEffect(() => {
    if (phase !== 'fotos') return;
    setGpsStatus('ermitteln');

    let deviceErfolg = false;

    // 1. Device-GPS versuchen
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          deviceErfolg = true;
          setDeviceGps({ lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy) });
          setGpsStatus('device');
        },
        () => { if (!deviceErfolg) fallbackAusBbox(); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    } else {
      fallbackAusBbox();
    }

    // 2. BBox-Fallback aus existierenden Punkten
    async function fallbackAusBbox() {
      const prots = await getProtokolleByGruppe(gruppe.id);
      const alleElems = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      const mitGps = alleElems.filter(e => e.mobile_erfassung.geo_lat != null);
      if (mitGps.length > 0) {
        const lats = mitGps.map(e => e.mobile_erfassung.geo_lat!);
        const lons = mitGps.map(e => e.mobile_erfassung.geo_lon!);
        // Suedost-Ecke der Bounding-Box als Startpunkt
        setFallbackGps({ lat: Math.min(...lats), lon: Math.max(...lons) });
        setGpsStatus('bbox');
      } else {
        // 3. Gar keine GPS-Daten -> Karte anbieten
        setGpsStatus('keins');
        setShowMapPicker(true);
      }
    }
  }, [phase]);

  const alleFirmen = firmen.length > 0
    ? firmen.map(f => ({ oid: f.id, name: f.name }))
    : [
        ...protokoll.teilnehmer,
        ...protokoll.verteiler.filter(v => !protokoll.teilnehmer.some(t => t.oid === v.oid)),
      ];

  // Files einlesen: arrayBuffer() liest die echten Binaerdaten,
  // bevor iOS Safari die FileList-Referenzen invalidieren kann
  async function fotoHinzufuegenBase(files: FileList | null) {
    if (!files || files.length === 0) return;
    const neueFiles: File[] = [];
    for (const f of Array.from(files)) {
      const buf = await f.arrayBuffer();
      neueFiles.push(new File([buf], f.name, { type: f.type || 'image/jpeg', lastModified: f.lastModified }));
    }
    setFotos(prev => [...prev, ...neueFiles]);
    setFotoUrls(prev => [...prev, ...neueFiles.map(f => URL.createObjectURL(f))]);
  }

  async function fotoVonKamera(e: React.ChangeEvent<HTMLInputElement>) {
    const hatFiles = e.target.files && e.target.files.length > 0;
    await fotoHinzufuegenBase(e.target.files);
    if (fotoRef.current) fotoRef.current.value = '';
    // Auto-Reopen Kamera
    if (autoCapture && hatFiles) {
      setTimeout(() => { fotoRef.current?.click(); }, 300);
    }
  }

  async function fotoAusGalerie(e: React.ChangeEvent<HTMLInputElement>) {
    await fotoHinzufuegenBase(e.target.files);
  }

  function fotoEntfernen(index: number) {
    URL.revokeObjectURL(fotoUrls[index]);
    setFotos(prev => prev.filter((_, i) => i !== index));
    setFotoUrls(prev => prev.filter((_, i) => i !== index));
  }

  async function abschliessen() {
    if (fotos.length === 0) { alert('Keine Fotos aufgenommen.'); return; }
    setVerarbeitet(true);

    // Hoechste Position finden — bei Anhangprotokoll nur im aktuellen Protokoll
    let maxPos = 0;
    if (protokoll.nummer < 0) {
      const elems = await getElemente(protokoll.id);
      for (const e of elems) {
        const num = parseFloat(e.position);
        if (num > maxPos) maxPos = num;
      }
    } else {
      const allProts = await getProtokolleByGruppe(gruppe.id);
      for (const p of allProts) {
        const elems = await getElemente(p.id);
        for (const e of elems) {
          const num = parseFloat(e.position);
          if (num > maxPos) maxPos = num;
        }
      }
    }

    const verantw = alleFirmen.find(t => t.oid === verantwFirmaOid);
    let count = 0;

    for (let i = 0; i < fotos.length; i++) {
      const file = fotos[i];
      const exifGps = await extractGpsFromImage(file);

      // GPS-Fallback-Kette: EXIF > Device-GPS > BBox-Ecke mit Versatz > null
      let finalLat: number | null = null;
      let finalLon: number | null = null;
      let accuracy: number | null = null;
      let gpsSource = '';

      if (exifGps) {
        finalLat = exifGps.lat; finalLon = exifGps.lon;
        accuracy = 10; gpsSource = 'EXIF';
      } else if (deviceGps) {
        finalLat = deviceGps.lat; finalLon = deviceGps.lon;
        accuracy = deviceGps.acc; gpsSource = `${deviceGps.acc} m`;
      } else if (fallbackGps) {
        // ca. 0.000018 Breite = 2m Versatz pro Punkt
        const offset = 0.000018 * i;
        finalLat = fallbackGps.lat - offset;
        finalLon = fallbackGps.lon + offset;
        accuracy = 50; gpsSource = 'geschaetzt';
      }

      const pos = `${Math.floor(maxPos) + 1 + i}`;
      const now = new Date().toISOString();
      const elemId = crypto.randomUUID();

      // Foto speichern — einheitliche Benennung: [ProjektNr]_[Gruppe]_[Position]_Bild_[Nr].jpg
      const fotoId = `foto-${Date.now()}-${i}`;
      const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_').replace(/_+/g, '_');
      const fileName = `${gruppe.protokollnummer}_${sanitize(gruppe.name)}_${pos}_Bild_1.jpg`;
      await saveFoto(fotoId, elemId, file, fileName);

      const text = positionstext.trim() || file.name.replace(/\.[^.]+$/, '');

      const neuesElem: Protokollelement = {
        id: elemId,
        created_at: now,
        updated_at: now,
        created_by: null,
        object_type: 'protokollelement',
        legacy_id: '',
        protokoll_id: protokoll.id,
        position: pos,
        positionstitel: '',
        positionstext: text,
        thema: thema,
        status: status,
        termin: termin ? termin + 'T00:00:00' : '',
        verantwortlicher_id: verantw?.oid || null,
        verantwortlicher_name: verantw?.name || '',
        bemerkung: `{Bilder: ${fileName}}`,
        erinnerung: false,
        wert: 0,
        verweise: [],
        mobile_erfassung: {
          geo_lat: finalLat,
          geo_lon: finalLon,
          geo_accuracy: accuracy,
          geo_text: finalLat != null ? `${finalLat.toFixed(7)}, ${finalLon!.toFixed(7)} (${gpsSource})` : null,
          geo_heading: null,
          geo_altitude: null,
          fotos: [{ file_name: fileName, relative_path: `photos/${fileName}`, ziel_pfad: '' }],
        },
        is_new: true,
      };

      await addElement(neuesElem);
      count++;
    }

    setErstellt(count);
    setPhase('fertig');
  }

  // GPS-Indikator: Farbe + Text
  const gpsIndikator = {
    ermitteln: { farbe: 'bg-yellow-400 animate-pulse', text: 'GPS wird ermittelt...' },
    device:    { farbe: 'bg-green-400', text: `GPS: ${deviceGps?.acc ?? '?'} m` },
    bbox:      { farbe: 'bg-amber-400', text: 'Position geschaetzt (aus vorh. Punkten)' },
    manuell:   { farbe: 'bg-amber-400', text: 'Manuell gewaehlt' },
    keins:     { farbe: 'bg-red-400', text: 'Kein GPS' },
  }[gpsStatus];

  // ------------------------------------------------------------------
  //  Phase: Einstellungen — Voreinstellungen fuer den Foto-Batch
  // ------------------------------------------------------------------
  if (phase === 'einstellungen') {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Schnellerstellung"
            subtitle="Voreinstellungen für den Foto-Batch"
            onBack={onBack}
            backLabel="Übersicht"
          />
        }
        footer={
          <StickyFooter>
            <PrimaryButton block onClick={() => setPhase('fotos')}>
              <IconCamera size={18} /> Fotos aufnehmen
            </PrimaryButton>
          </StickyFooter>
        }
      >
        <div className="mx-auto flex max-w-[640px] flex-col gap-3 p-4">
          {/* Positionstext */}
          <Card className="p-4">
            <SectionLabel>Positionstext (optional)</SectionLabel>
            <textarea
              value={positionstext}
              onChange={(e) => setPositionstext(e.target.value)}
              rows={3}
              placeholder="Wird für alle Punkte übernommen …"
              className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] text-ping-text outline-none focus:border-ping-blue"
            />
            <p className="mt-2 text-[12px] text-ping-text-light">
              Leer lassen → der Dateiname wird als Positionstext übernommen.
            </p>
          </Card>

          {/* Status — nie frei einfaerben, immer StatusBadge */}
          <Card className="p-4">
            <SectionLabel>Status</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              {HAUPT_STATUS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className="rounded-full transition active:scale-[.98]"
                  style={status === s ? { boxShadow: '0 0 0 2px var(--color-ping-blue)' } : { opacity: 0.45 }}
                  aria-pressed={status === s}
                >
                  <StatusBadge status={s} />
                </button>
              ))}
            </div>
          </Card>

          {/* Thema — Vorschlaege als Chips + Freitext ueber Prompt */}
          <Card className="p-4">
            <SectionLabel>Thema</SectionLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={thema === ''} onClick={() => setThema('')}>
                Keins
              </Chip>
              {themenVorschlaege.map((t) => (
                <Chip key={t} active={thema === t} onClick={() => setThema(t)}>
                  {t}
                </Chip>
              ))}
              {thema && !themenVorschlaege.includes(thema) && (
                <Chip active onClick={() => setThema(thema)}>
                  {thema}
                </Chip>
              )}
              <button
                type="button"
                onClick={() => { const val = prompt('Neues Thema eingeben:', thema); if (val != null) setThema(val); }}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-ping-blue px-3 py-1 text-[13px] font-medium text-ping-blue transition hover:bg-ping-blue-light"
              >
                <IconPlus size={14} /> Neu
              </button>
            </div>
          </Card>

          {/* Termin + Verantwortlich */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <SectionLabel>Termin</SectionLabel>
              <input
                type="date"
                value={termin}
                onChange={(e) => setTermin(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] text-ping-text outline-none focus:border-ping-blue"
              />
            </Card>
            <Card className="p-4">
              <SectionLabel>Verantwortlich</SectionLabel>
              <select
                value={verantwFirmaOid}
                onChange={(e) => setVerantwFirmaOid(e.target.value)}
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[14px] text-ping-text outline-none focus:border-ping-blue"
              >
                <option value="">(keine)</option>
                {alleFirmen.map((t) => (
                  <option key={t.oid} value={t.oid}>{t.name}</option>
                ))}
              </select>
            </Card>
          </div>
        </div>
      </Screen>
    );
  }

  // ------------------------------------------------------------------
  //  Phase: Fotos — aufnehmen, auswaehlen, Batch abschliessen
  // ------------------------------------------------------------------
  if (phase === 'fotos') {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Fotos aufnehmen"
            subtitle={`${fotos.length} Foto${fotos.length !== 1 ? 's' : ''} — ${gpsIndikator.text}`}
            onBack={() => setPhase('einstellungen')}
            backLabel="Einstellungen"
            right={
              // GPS-Status-Indikator (Farbe spiegelt die Fallback-Kette)
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${gpsIndikator.farbe}`}
                title={gpsIndikator.text}
              />
            }
          />
        }
        footer={
          fotos.length > 0 ? (
            <StickyFooter>
              <PrimaryButton block onClick={abschliessen} disabled={verarbeitet}>
                {verarbeitet ? 'Wird erstellt …' : (
                  <>
                    <IconCheck size={18} /> Abschließen · {fotos.length} Punkte
                  </>
                )}
              </PrimaryButton>
            </StickyFooter>
          ) : undefined
        }
      >
        <div className="mx-auto flex max-w-[640px] flex-col gap-3 p-4">
          {/* Aufnahme-Aktionen */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => fotoRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-ping-blue py-8 text-white shadow-lg transition hover:bg-ping-blue-dark active:scale-[.99]"
            >
              <IconCamera size={30} />
              <span className="text-[15px] font-semibold">Foto aufnehmen</span>
            </button>
            <button
              onClick={() => galerieRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-ping-blue-light py-8 text-ping-blue transition hover:brightness-95 active:scale-[.99]"
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              <IconFolder size={30} />
              <span className="text-[15px] font-semibold">Aus Galerie</span>
            </button>
          </div>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment"
            onChange={fotoVonKamera} className="hidden" />
          <input ref={galerieRef} type="file" accept="image/*" multiple
            onChange={fotoAusGalerie} className="hidden" />

          {/* Kein GPS? Manuell per Karte waehlen */}
          {(gpsStatus === 'keins' || gpsStatus === 'bbox' || gpsStatus === 'manuell') && (
            <button
              onClick={() => setShowMapPicker(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition hover:brightness-95"
              style={{
                background: 'var(--color-ping-gold-light)',
                color: 'var(--color-ping-gold-dark)',
                borderColor: 'var(--color-ping-gold)',
              }}
            >
              <IconMapPin size={16} /> Startposition auf Karte wählen
            </button>
          )}

          {/* Auto-Capture Toggle */}
          <Card className="flex items-center justify-between p-4">
            <span className="text-[14px] text-ping-text-mid">Kamera automatisch erneut öffnen</span>
            <button
              onClick={() => setAutoCapture(!autoCapture)}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition"
              style={{ background: autoCapture ? 'var(--color-ping-success)' : 'rgba(0,0,0,.18)' }}
              role="switch"
              aria-checked={autoCapture}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${autoCapture ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </Card>

          {/* Foto-Uebersicht */}
          {fotos.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ping-blue-light text-ping-blue">
                  <IconCamera size={22} />
                </span>
                <div className="min-w-0">
                  <div className="text-[22px] font-bold leading-none text-ping-text">{fotos.length}</div>
                  <div className="text-[12px] text-ping-text-light">Foto{fotos.length !== 1 ? 's' : ''} aufgenommen</div>
                </div>
                {fotoUrls.length > 0 && (
                  <img src={fotoUrls[fotoUrls.length - 1]} alt="" className="ml-auto h-11 w-11 rounded-lg object-cover" />
                )}
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className="shrink-0 text-[13px] font-semibold text-ping-blue hover:underline"
                >
                  {showGrid ? 'Zuklappen' : 'Alle anzeigen'}
                </button>
              </div>
              {showGrid && (
                <div className="mt-3 grid grid-cols-4 gap-1.5">
                  {fotos.map((_, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={fotoUrls[i]} alt="" className="h-full w-full rounded-lg object-cover" />
                      <button
                        onClick={() => fotoEntfernen(i)}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow"
                        style={{ background: 'var(--color-ping-danger)' }}
                        aria-label="Foto entfernen"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* MapEditorModal fuer manuelle Startposition */}
        {showMapPicker && (
          <MapEditorModal
            lat={fallbackGps?.lat ?? null}
            lon={fallbackGps?.lon ?? null}
            heading={null}
            onSave={(lat, lon) => {
              setFallbackGps({ lat, lon });
              setGpsStatus('manuell');
              setShowMapPicker(false);
            }}
            onCancel={() => setShowMapPicker(false)}
          />
        )}
      </Screen>
    );
  }

  // ------------------------------------------------------------------
  //  Phase: Fertig — Erfolgsmeldung
  // ------------------------------------------------------------------
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-ping-surface p-6">
      <Card className="w-full max-w-sm p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: '#EAFAF0', color: 'var(--color-ping-success-dark)' }}
        >
          <IconCheck size={32} />
        </div>
        <h2 className="text-[19px] font-bold text-ping-text">{erstellt} Punkte erstellt</h2>
        <p className="mt-1 text-[14px] text-ping-text-mid">
          Alle Fotos wurden als neue Protokollpunkte angelegt.
        </p>
        <PrimaryButton block className="mt-5" onClick={onDone}>
          Zur Übersicht
        </PrimaryButton>
      </Card>
    </div>
  );
}
