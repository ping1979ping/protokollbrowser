import { useState, useEffect } from 'react';
import { fetchWeather } from '../weatherService';
import { getVerantwortliche, getLetzteBautagebuchElemente } from '../db';
import type { Verantwortlicher } from '../db';
import type { Protokollelement, Protokollgruppe } from '../types';
import { Card, SectionLabel, PrimaryButton, SecondaryButton } from '../ui/primitives';
import { IconBook, IconCalendar, IconUser, IconMapPin, IconPlus, IconTrash } from '../ui/icons';

interface BautagebuchFirma {
  oid: string;
  name: string;
  mitarbeiter: number;
  baustand: string;
}

interface BautagebuchResult {
  datum: string;
  positionstext: string;
  geoLat: number | null;
  geoLon: number | null;
  geoAcc: number | null;
}

interface Props {
  gruppe: Protokollgruppe;
  existingElement?: Protokollelement; // Wenn bearbeiten statt neu
  onUebernehmen: (result: BautagebuchResult) => void;
  onAbbrechen: () => void;
}

/**
 * Fuzzy-Match: Normalisiert einen Firmennamen fuer Vergleich.
 * Entfernt Rechtsform, Satzzeichen, mehrfache Leerzeichen, lowercase.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|gbr|ug|mbh|co\.?|&|e\.?\s*k\.?|inc\.?|ltd\.?)\b/gi, '')
    .replace(/[^\wäöüß]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy-Match: Findet den besten Treffer aus der Verantwortlichen-Liste.
 * 1. Exakter Match
 * 2. Normalisierter Match
 * 3. Einer enthaelt den anderen
 */
function fuzzyMatchFirma(firmaName: string, verantwortliche: Verantwortlicher[]): Verantwortlicher | null {
  // 1. Exakt
  const exact = verantwortliche.find(v => v.name === firmaName);
  if (exact) return exact;

  const normInput = normalizeName(firmaName);

  // 2. Normalisiert exakt
  const normMatch = verantwortliche.find(v => normalizeName(v.name) === normInput);
  if (normMatch) return normMatch;

  // 3. Enthaelt (bidirektional)
  const containsMatch = verantwortliche.find(v => {
    const normV = normalizeName(v.name);
    return normV.includes(normInput) || normInput.includes(normV);
  });
  if (containsMatch) return containsMatch;

  // 4. Wort-Ueberlappung (mind. 2 gemeinsame Woerter oder 1 langes Wort)
  const inputWords = normInput.split(' ').filter(w => w.length > 1);
  let bestScore = 0;
  let bestMatch: Verantwortlicher | null = null;
  for (const v of verantwortliche) {
    const vWords = normalizeName(v.name).split(' ').filter(w => w.length > 1);
    const overlap = inputWords.filter(w => vWords.some(vw => vw.includes(w) || w.includes(vw)));
    const score = overlap.length;
    if (score > bestScore && (score >= 2 || overlap.some(w => w.length >= 5))) {
      bestScore = score;
      bestMatch = v;
    }
  }
  return bestMatch;
}

// Parse existing Bautagebuch Positionstext — robust/fuzzy
function parseBautagebuchText(text: string): { wetter: string; firmen: BautagebuchFirma[] } {
  const lines = text.split('\n');
  let wetter = '';
  const firmen: BautagebuchFirma[] = [];

  for (const line of lines) {
    // Wetter — verschiedene Formate
    const wetterMatch = line.match(/^Wetter\s*:\s*(.+)/i);
    if (wetterMatch) {
      const w = wetterMatch[1].trim();
      if (w !== '—' && w !== '-') wetter = w;
      continue;
    }
    // Firma — flexibles Format: "- Name: X Mitarbeiter | Baustand: ..."
    const firmaMatch = line.match(/^[-–•]\s*(.+?):\s*(\d+)\s*(?:Mitarbeiter|MA|Pers\.?|Mann)\s*[|,;]\s*Baustand\s*:\s*(.+)/i);
    if (firmaMatch) {
      firmen.push({
        oid: '',
        name: firmaMatch[1].trim(),
        mitarbeiter: parseInt(firmaMatch[2]),
        baustand: firmaMatch[3].trim() === '—' || firmaMatch[3].trim() === '-' ? '' : firmaMatch[3].trim(),
      });
      continue;
    }
    // Fallback: simpler "- Name: X Mitarbeiter" ohne Baustand
    const simpleFirma = line.match(/^[-–•]\s*(.+?):\s*(\d+)\s*(?:Mitarbeiter|MA|Pers\.?|Mann)/i);
    if (simpleFirma) {
      firmen.push({
        oid: '',
        name: simpleFirma[1].trim(),
        mitarbeiter: parseInt(simpleFirma[2]),
        baustand: '',
      });
    }
  }

  return { wetter, firmen };
}

function generatePositionstext(wetter: string, firmen: BautagebuchFirma[]): string {
  const lines: string[] = [];
  lines.push(`Wetter: ${wetter || '—'}`);
  lines.push('');
  lines.push('Baufirmen auf der Baustelle:');
  for (const f of firmen) {
    const baustand = f.baustand || '—';
    lines.push(`- ${f.name}: ${f.mitarbeiter} Mitarbeiter | Baustand: ${baustand}`);
  }
  return lines.join('\n');
}

export default function BautagebuchWizard({ gruppe, existingElement, onUebernehmen, onAbbrechen }: Props) {
  const [datum, setDatum] = useState(() => {
    if (existingElement?.termin) return existingElement.termin.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });
  const [wetter, setWetter] = useState('');
  const [wetterGeladen, setWetterGeladen] = useState(false);
  const [wetterLaedt, setWetterLaedt] = useState(false);
  const [firmen, setFirmen] = useState<BautagebuchFirma[]>([]);
  const [verfuegbareFirmen, setVerfuegbareFirmen] = useState<Verantwortlicher[]>([]);
  const [geoLat, setGeoLat] = useState<number | null>(existingElement?.mobile_erfassung?.geo_lat ?? null);
  const [geoLon, setGeoLon] = useState<number | null>(existingElement?.mobile_erfassung?.geo_lon ?? null);
  const [geoAcc, setGeoAcc] = useState<number | null>(existingElement?.mobile_erfassung?.geo_accuracy ?? null);
  const [firmaDropdown, setFirmaDropdown] = useState(false);

  useEffect(() => { initWizard(); }, []);

  async function initWizard() {
    const verantw = await getVerantwortliche();
    setVerfuegbareFirmen(verantw);

    if (existingElement) {
      // Bearbeiten: Parse existing text
      const parsed = parseBautagebuchText(existingElement.positionstext);
      setWetter(parsed.wetter);
      const firmenMitOid = parsed.firmen.map(f => {
        const match = fuzzyMatchFirma(f.name, verantw);
        return { ...f, oid: match?.id || '', name: match?.name || f.name };
      });
      setFirmen(firmenMitOid);
      setWetterGeladen(!!parsed.wetter);
    } else {
      // Neu: Letzten Eintrag im BT-Protokoll laden
      const btElems = await getLetzteBautagebuchElemente(gruppe.id);
      if (btElems.length > 0) {
        const letzter = btElems[0];
        const parsed = parseBautagebuchText(letzter.positionstext);

        if (parsed.firmen.length > 0) {
          // Firmen uebernehmen, Mitarbeiter auf 0
          const firmenMitOid = parsed.firmen.map(f => {
            const match = fuzzyMatchFirma(f.name, verantw);
            return { ...f, oid: match?.id || '', name: match?.name || f.name, mitarbeiter: 0 };
          });
          setFirmen(firmenMitOid);
        }

        // GPS vom Vorgaenger
        if (letzter.mobile_erfassung?.geo_lat != null) {
          setGeoLat(letzter.mobile_erfassung.geo_lat);
          setGeoLon(letzter.mobile_erfassung.geo_lon);
          setGeoAcc(letzter.mobile_erfassung.geo_accuracy);
        }
      }
    }

    // GPS versuchen (aktuell)
    if (!existingElement && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setGeoLat(p.coords.latitude);
          setGeoLon(p.coords.longitude);
          setGeoAcc(Math.round(p.coords.accuracy));
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    }
  }

  // Wetter laden wenn GPS und Datum bekannt
  useEffect(() => {
    if (geoLat != null && geoLon != null && !existingElement) {
      ladeWetter(geoLat, geoLon, datum);
    }
  }, [geoLat, geoLon, datum]);

  async function ladeWetter(lat: number, lon: number, date: string) {
    setWetterLaedt(true);
    const w = await fetchWeather(lat, lon, date);
    if (w) {
      setWetter(w);
      setWetterGeladen(true);
    }
    setWetterLaedt(false);
  }

  function firmaHinzufuegen(verantw: Verantwortlicher) {
    if (firmen.some(f => f.oid === verantw.id)) return;
    setFirmen([...firmen, { oid: verantw.id, name: verantw.name, mitarbeiter: 0, baustand: '' }]);
    setFirmaDropdown(false);
  }

  function firmaEntfernen(index: number) {
    setFirmen(firmen.filter((_, i) => i !== index));
  }

  function updateFirma(index: number, patch: Partial<BautagebuchFirma>) {
    setFirmen(firmen.map((f, i) => i === index ? { ...f, ...patch } : f));
  }

  function uebernehmen() {
    const positionstext = generatePositionstext(wetter, firmen);
    onUebernehmen({ datum, positionstext, geoLat, geoLon, geoAcc });
  }

  const nichtVerwendeteFirmen = verfuegbareFirmen.filter(
    v => !firmen.some(f => f.oid === v.id)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-2"
      style={{ background: 'rgba(15,23,42,.45)' }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden bg-ping-surface shadow-2xl"
        style={{ borderRadius: 20 }}
      >
        {/* Header — Gold-Akzent (Bautagebuch-Kontext) */}
        <div
          className="shrink-0 bg-white px-4 pb-3 pt-4"
          style={{ borderTop: '3px solid var(--color-ping-gold)' }}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ping-gold-light text-ping-gold-dark">
              <IconBook size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-bold leading-tight text-ping-text">Bautagebuch-Eintrag</h2>
              <p className="text-[13px] text-ping-text-mid">{existingElement ? 'Bearbeiten' : 'Neuer Eintrag'}</p>
            </div>
          </div>
        </div>

        {/* Scrollbarer Inhalt */}
        <div className="ping-scroll min-h-0 flex-1 space-y-3 overflow-auto p-3">
          {/* Datum */}
          <Card className="p-3">
            <SectionLabel>
              <span className="inline-flex items-center gap-1.5">
                <IconCalendar size={14} /> Datum
              </span>
            </SectionLabel>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ping-text outline-none focus:border-ping-blue focus:ring-1 focus:ring-ping-blue"
            />
          </Card>

          {/* Wetter */}
          <Card className="p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ping-text-light">Wetter</span>
              {wetterLaedt && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#E6EEF7', color: '#004899' }}>
                  Lädt…
                </span>
              )}
              {!wetterLaedt && wetterGeladen && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#EAFAF0', color: '#16803C' }}>
                  API
                </span>
              )}
            </div>
            <input
              type="text"
              value={wetter}
              onChange={(e) => setWetter(e.target.value)}
              placeholder={geoLat == null ? 'Kein GPS — Wetter manuell eingeben' : 'Wird geladen…'}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-ping-text outline-none focus:border-ping-blue focus:ring-1 focus:ring-ping-blue"
            />
            {!wetterGeladen && !wetterLaedt && geoLat == null && (
              <p className="mt-1 text-[11px] text-ping-text-light">Kein GPS-Standort verfügbar. Wetter manuell eingeben.</p>
            )}
          </Card>

          {/* GPS — erfasster Standort (nur Anzeige) */}
          {geoLat != null && geoLon != null && (
            <Card className="p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ping-blue-light text-ping-blue">
                  <IconMapPin size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ping-text">Standort erfasst</div>
                  <div className="truncate font-mono text-[11px] text-ping-text-mid">
                    {geoLat.toFixed(5)}, {geoLon.toFixed(5)}
                    {geoAcc != null ? ` · ±${geoAcc} m` : ''}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Firmen */}
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-ping-text-light">
                <IconUser size={14} /> Baufirmen auf der Baustelle
              </span>
              <div className="relative shrink-0">
                <button
                  onClick={() => setFirmaDropdown(!firmaDropdown)}
                  className="inline-flex items-center gap-1 rounded-full bg-ping-gold px-3 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-95"
                >
                  <IconPlus size={14} /> Firma
                </button>
                {firmaDropdown && nichtVerwendeteFirmen.length > 0 && (
                  <div className="absolute right-0 top-full z-10 mt-1 max-h-48 min-w-[200px] overflow-auto rounded-xl border border-black/10 bg-white shadow-lg">
                    {nichtVerwendeteFirmen.map(v => (
                      <button
                        key={v.id}
                        onClick={() => firmaHinzufuegen(v)}
                        className="block w-full border-b border-black/5 px-3 py-2.5 text-left text-[13px] text-ping-text last:border-0 hover:bg-ping-blue-light"
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {firmen.length === 0 && (
              <p className="py-3 text-center text-[13px] text-ping-text-light">Keine Firmen — „Firma" hinzufügen</p>
            )}

            <div className="space-y-2">
              {firmen.map((firma, i) => (
                <div key={firma.oid || i} className="rounded-xl border border-black/10 bg-ping-bg p-2.5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ping-text">{firma.name}</span>
                    <button
                      onClick={() => firmaEntfernen(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ping-text-light transition hover:bg-white hover:text-[#DC2626]"
                      aria-label="Firma entfernen"
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>

                  {/* Mitarbeiter */}
                  <div className="mb-2 flex items-center gap-2">
                    <span className="w-20 text-[11px] font-medium text-ping-text-mid">Mitarbeiter</span>
                    <button
                      onClick={() => updateFirma(i, { mitarbeiter: Math.max(0, firma.mitarbeiter - 1) })}
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-lg font-bold text-ping-text-mid transition hover:bg-ping-bg"
                      aria-label="Mitarbeiter verringern"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-mono text-[15px] font-semibold text-ping-text">{firma.mitarbeiter}</span>
                    <button
                      onClick={() => updateFirma(i, { mitarbeiter: firma.mitarbeiter + 1 })}
                      className="flex h-11 w-11 items-center justify-center rounded-lg bg-ping-gold text-lg font-bold text-white transition hover:brightness-95"
                      aria-label="Mitarbeiter erhöhen"
                    >
                      +
                    </button>
                  </div>

                  {/* Baustand */}
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-ping-text-mid">Baustand</span>
                    <input
                      type="text"
                      value={firma.baustand}
                      onChange={(e) => updateFirma(i, { baustand: e.target.value })}
                      placeholder="Aktueller Baustand…"
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] outline-none focus:border-ping-blue focus:ring-1 focus:ring-ping-blue"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Buttons — immer sichtbar unten */}
        <div className="shrink-0 border-t border-black/5 bg-white p-3">
          <div className="flex gap-2">
            <SecondaryButton onClick={onAbbrechen} className="flex-1">
              Abbrechen
            </SecondaryButton>
            <PrimaryButton
              onClick={uebernehmen}
              className="flex-1 hover:brightness-95"
              style={{ backgroundColor: 'var(--color-ping-gold)' }}
            >
              Übernehmen
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
