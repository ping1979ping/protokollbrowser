import { useState, useEffect } from 'react';
import { fetchWeather } from '../weatherService';
import { getVerantwortliche, getLetzteBautagebuchElemente } from '../db';
import type { Verantwortlicher } from '../db';
import type { Protokollelement, Protokollgruppe } from '../types';

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
 * Fuzzy-Match: Normalisiert einen Firmennamen für Vergleich.
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
 * 3. Einer enthält den anderen
 */
function fuzzyMatchFirma(firmaName: string, verantwortliche: Verantwortlicher[]): Verantwortlicher | null {
  // 1. Exakt
  const exact = verantwortliche.find(v => v.Name === firmaName);
  if (exact) return exact;

  const normInput = normalizeName(firmaName);

  // 2. Normalisiert exakt
  const normMatch = verantwortliche.find(v => normalizeName(v.Name) === normInput);
  if (normMatch) return normMatch;

  // 3. Enthält (bidirektional)
  const containsMatch = verantwortliche.find(v => {
    const normV = normalizeName(v.Name);
    return normV.includes(normInput) || normInput.includes(normV);
  });
  if (containsMatch) return containsMatch;

  // 4. Wort-Überlappung (mind. 2 gemeinsame Wörter oder 1 langes Wort)
  const inputWords = normInput.split(' ').filter(w => w.length > 1);
  let bestScore = 0;
  let bestMatch: Verantwortlicher | null = null;
  for (const v of verantwortliche) {
    const vWords = normalizeName(v.Name).split(' ').filter(w => w.length > 1);
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
    // Auch: "- Name: X MA | Baustand: ..." oder "- Name: X Mitarbeiter, Baustand: ..."
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
    if (existingElement?.Termin) return existingElement.Termin.slice(0, 10);
    return new Date().toISOString().slice(0, 10);
  });
  const [wetter, setWetter] = useState('');
  const [wetterGeladen, setWetterGeladen] = useState(false);
  const [wetterLaedt, setWetterLaedt] = useState(false);
  const [firmen, setFirmen] = useState<BautagebuchFirma[]>([]);
  const [verfuegbareFirmen, setVerfuegbareFirmen] = useState<Verantwortlicher[]>([]);
  const [geoLat, setGeoLat] = useState<number | null>(existingElement?.MobileErfassung?.GeoLat ?? null);
  const [geoLon, setGeoLon] = useState<number | null>(existingElement?.MobileErfassung?.GeoLon ?? null);
  const [geoAcc, setGeoAcc] = useState<number | null>(existingElement?.MobileErfassung?.GeoAccuracy ?? null);
  const [firmaDropdown, setFirmaDropdown] = useState(false);

  useEffect(() => { initWizard(); }, []);

  async function initWizard() {
    const verantw = await getVerantwortliche();
    setVerfuegbareFirmen(verantw);

    if (existingElement) {
      // Bearbeiten: Parse existing text
      const parsed = parseBautagebuchText(existingElement.Positionstext);
      setWetter(parsed.wetter);
      const firmenMitOid = parsed.firmen.map(f => {
        const match = fuzzyMatchFirma(f.name, verantw);
        return { ...f, oid: match?.ID || '', name: match?.Name || f.name };
      });
      setFirmen(firmenMitOid);
      setWetterGeladen(!!parsed.wetter);
    } else {
      // Neu: Letzten Eintrag im BT-Protokoll laden
      const btElems = await getLetzteBautagebuchElemente(gruppe.Id);
      if (btElems.length > 0) {
        const letzter = btElems[0];
        const parsed = parseBautagebuchText(letzter.Positionstext);

        if (parsed.firmen.length > 0) {
          // Firmen übernehmen, Mitarbeiter auf 0
          const firmenMitOid = parsed.firmen.map(f => {
            const match = fuzzyMatchFirma(f.name, verantw);
            return { ...f, oid: match?.ID || '', name: match?.Name || f.name, mitarbeiter: 0 };
          });
          setFirmen(firmenMitOid);
        }

        // GPS vom Vorgänger
        if (letzter.MobileErfassung?.GeoLat != null) {
          setGeoLat(letzter.MobileErfassung.GeoLat);
          setGeoLon(letzter.MobileErfassung.GeoLon);
          setGeoAcc(letzter.MobileErfassung.GeoAccuracy);
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
    if (firmen.some(f => f.oid === verantw.ID)) return;
    setFirmen([...firmen, { oid: verantw.ID, name: verantw.Name, mitarbeiter: 0, baustand: '' }]);
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
    v => !firmen.some(f => f.oid === v.ID)
  );

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-stretch justify-center p-2">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
        {/* Header */}
        <div className="bg-ping-blue text-white p-3 rounded-t-xl shrink-0">
          <h2 className="text-base font-bold">Bautagebuch-Eintrag</h2>
          <p className="text-ping-blue-light text-xs">{existingElement ? 'Bearbeiten' : 'Neuer Eintrag'}</p>
        </div>

        {/* Scrollbarer Inhalt */}
        <div className="p-3 space-y-3 flex-1 overflow-auto min-h-0">
          {/* Datum */}
          <div className="bg-gray-50 rounded-lg p-2.5">
            <label className="text-[10px] text-gray-400 font-medium uppercase block mb-0.5">Datum</label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue"
            />
          </div>

          {/* Wetter */}
          <div className="bg-gray-50 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] text-gray-400 font-medium uppercase">Wetter</label>
              {wetterLaedt && <span className="text-[10px] text-ping-blue">Laden...</span>}
              {!wetterLaedt && wetterGeladen && <span className="text-[10px] text-green-600">API</span>}
            </div>
            <input
              type="text"
              value={wetter}
              onChange={(e) => setWetter(e.target.value)}
              placeholder={geoLat == null ? 'Kein GPS — Wetter manuell eingeben' : 'Wird geladen...'}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-ping-blue"
            />
            {!wetterGeladen && !wetterLaedt && geoLat == null && (
              <p className="text-[9px] text-gray-400 mt-0.5">Kein GPS-Standort verfügbar. Wetter manuell eingeben.</p>
            )}
          </div>

          {/* Firmen */}
          <div className="bg-gray-50 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] text-gray-400 font-medium uppercase">Baufirmen auf der Baustelle</label>
              <div className="relative">
                <button
                  onClick={() => setFirmaDropdown(!firmaDropdown)}
                  className="bg-ping-blue text-white px-2 py-0.5 rounded text-[10px]"
                >
                  + Firma
                </button>
                {firmaDropdown && nichtVerwendeteFirmen.length > 0 && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-auto min-w-[200px]">
                    {nichtVerwendeteFirmen.map(v => (
                      <button
                        key={v.ID}
                        onClick={() => firmaHinzufuegen(v)}
                        className="block w-full text-left px-3 py-1.5 text-xs hover:bg-ping-blue-light border-b border-gray-50 last:border-0"
                      >
                        {v.Name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {firmen.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">Keine Firmen — "Firma hinzufügen" klicken</p>
            )}

            <div className="space-y-2">
              {firmen.map((firma, i) => (
                <div key={firma.oid || i} className="bg-white rounded-lg p-2 border border-gray-200">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-gray-800">{firma.name}</span>
                    <button
                      onClick={() => firmaEntfernen(i)}
                      className="text-red-400 hover:text-red-600 text-sm leading-none px-1"
                    >
                      ×
                    </button>
                  </div>

                  {/* Mitarbeiter */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-gray-500 w-16">Mitarbeiter:</span>
                    <button
                      onClick={() => updateFirma(i, { mitarbeiter: Math.max(0, firma.mitarbeiter - 1) })}
                      className="w-7 h-7 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-bold hover:bg-gray-200"
                    >
                      −
                    </button>
                    <span className="text-sm font-mono font-medium w-6 text-center">{firma.mitarbeiter}</span>
                    <button
                      onClick={() => updateFirma(i, { mitarbeiter: firma.mitarbeiter + 1 })}
                      className="w-7 h-7 rounded bg-ping-blue text-white flex items-center justify-center text-sm font-bold hover:bg-ping-blue-dark"
                    >
                      +
                    </button>
                  </div>

                  {/* Baustand */}
                  <div>
                    <span className="text-[10px] text-gray-500">Baustand:</span>
                    <input
                      type="text"
                      value={firma.baustand}
                      onChange={(e) => updateFirma(i, { baustand: e.target.value })}
                      placeholder="Aktueller Baustand..."
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-ping-blue mt-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Buttons — immer sichtbar unten */}
        <div className="p-3 border-t flex gap-2 shrink-0">
          <button
            onClick={onAbbrechen}
            className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
          >
            Abbrechen
          </button>
          <button
            onClick={uebernehmen}
            className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-green-600 text-white hover:bg-green-700 transition"
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
