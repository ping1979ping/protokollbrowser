// Parser fuer DOCUframe JSON-Export
// Gibt Hub-konforme Objekte aus (snake_case, UUID, legacy_id)

import type { ProtokollPaket, Protokollgruppe, Protokoll, Protokollelement, Teilnehmer, MobileErfassung } from './types';
import { emptyMobileErfassung } from './types';
import type { Verantwortlicher } from './db';

// DOCUframe Datumsformat: "DD.MM.YYYY HH:MM:SS" -> ISO
function parseDfDatum(s: string): string {
  if (!s || s.startsWith('01.01.1601')) return '';
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
}

// UTF-16LE erkennen und dekodieren (mit oder ohne BOM)
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if (bytes.length >= 2 && bytes[1] === 0x00) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function newUUID(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

// ============================================================
// Format-Erkennung
// ============================================================

function detectFormat(raw: unknown[]): 'hierarchical' | 'v5c' {
  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    if (typeof obj['version'] === 'string') return 'v5c';
    if (obj['Protokollgruppe'] || obj['Verantwortliche']) return 'hierarchical';
  }
  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    if ('ProtGrpID' in obj || '_ProtokollgruppeOid' in obj || 'ProtokollId' in obj || '_ProtokollOid' in obj) return 'v5c';
  }
  return 'hierarchical';
}

// ============================================================
// Haupt-Dispatcher
// ============================================================

export function parseDfJson(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: Verantwortlicher[] } {
  const format = detectFormat(raw);
  if (format === 'v5c') return parseDfJsonV5c(raw);
  return parseDfJsonHierarchical(raw);
}

// ============================================================
// Hub-Entity Defaults
// ============================================================

function hubDefaults() {
  const now = nowISO();
  return { id: newUUID(), created_at: now, updated_at: now, created_by: null };
}

// ============================================================
// V5c Flat Format Parser
// ============================================================

function parseDfJsonV5c(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: Verantwortlicher[] } {
  const verantwortliche: Verantwortlicher[] = [];
  let gruppeRecord: Record<string, unknown> | null = null;
  const protokollRecords: Record<string, unknown>[] = [];
  const elementRecords: Record<string, unknown>[] = [];
  let manifestProjektNummer = '';
  let manifestProjektName = '';

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;

    if (typeof obj['version'] === 'string') {
      manifestProjektNummer = (obj['ProjektNummer'] as string) || (obj['ProjektId'] as string) || '';
      manifestProjektName = (obj['ProjektName'] as string) || '';
      continue;
    }

    if (typeof obj['ID'] === 'string' && (typeof obj['Kuerzel'] === 'string' || typeof obj['Kürzel'] === 'string') && !('ProtGrpID' in obj) && !('_ProtokollgruppeOid' in obj) && !('ProtokollId' in obj) && !('_ProtokollOid' in obj)) {
      verantwortliche.push({
        ...hubDefaults(),
        legacy_id: obj['ID'] as string,
        kuerzel: (obj['Kuerzel'] as string) || (obj['Kürzel'] as string) || '',
        name: (obj['Name'] as string) || '',
      });
      continue;
    }

    if ('ProtokollId' in obj || '_ProtokollOid' in obj) {
      elementRecords.push(obj);
      continue;
    }

    if ('ProtGrpID' in obj || '_ProtokollgruppeOid' in obj) {
      protokollRecords.push(obj);
      continue;
    }

    if ('Id' in obj && Object.keys(obj).length > 5) {
      gruppeRecord = obj;
      continue;
    }
  }

  if (!gruppeRecord) {
    console.warn('[V5c] Keine Protokollgruppe gefunden');
    return { pakete: [], verantwortliche };
  }

  const verantLookup = new Map(verantwortliche.map(v => [v.legacy_id, v]));

  const gruppe: Protokollgruppe = {
    ...hubDefaults(),
    object_type: 'protokollgruppe',
    legacy_id: (gruppeRecord['Id'] as string) || '',
    name: (gruppeRecord['_Name'] as string) || '',
    projekt_nummer: (gruppeRecord['ProjektNummer'] as string) || (gruppeRecord['ProjektId'] as string) || manifestProjektNummer,
    projekt_name: (gruppeRecord['ProjektName'] as string) || manifestProjektName,
    projekt_stammverzeichnis: (gruppeRecord['ProjektStammverzeichnis'] as string) || '',
    protokollnummer: (gruppeRecord['_Protokollnummer'] as number) || 0,
    vorwort: (gruppeRecord['_Vorwort'] as string) || '',
    nachwort: (gruppeRecord['_Nachwort'] as string) || '',
    themen: Array.isArray(gruppeRecord['_Themen'])
      ? (gruppeRecord['_Themen'] as string[]).join(', ')
      : (gruppeRecord['_Themen'] as string) || '',
    bemerkung: (gruppeRecord['_Bemerkung'] as string) || '',
  };

  // UUID-Mapping fuer Protokoll-IDs: legacy_id -> neue UUID
  const protokollIdMap = new Map<string, string>();

  const protokollMap = new Map<string, Protokoll>();
  for (const pRaw of protokollRecords) {
    const legacyId = (pRaw['Id'] as string) || '';
    const newId = newUUID();
    protokollIdMap.set(legacyId, newId);

    const teilnehmerOids = (pRaw['_TeilnehmerOids'] as string[]) || (pRaw['TeilnehmerArray'] as string[]) || [];
    const verteilerOids = (pRaw['_VerteilerOids'] as string[]) || (pRaw['VerteilerArray'] as string[]) || [];

    const now = nowISO();
    const protokoll: Protokoll = {
      id: newId,
      created_at: now,
      updated_at: now,
      created_by: null,
      object_type: 'protokoll',
      legacy_id: legacyId,
      name: (pRaw['_Name'] as string) || '',
      nummer: (pRaw['_Nummer'] as number) || 0,
      datum: parseDfDatum((pRaw['_Datum'] as string) || ''),
      ort: (pRaw['_Ort'] as string) || '',
      autor: (pRaw['_Autor'] as string) || '',
      vorbemerkung: (pRaw['_Vorbemerkung'] as string) || '',
      nachbemerkung: (pRaw['_Nachbemerkung'] as string) || '',
      erledigt: (pRaw['_erledigt'] as boolean) || false,
      ist_einzelprotokoll: (pRaw['_istEinzelprotokoll'] as boolean) || false,
      erstellt: (pRaw['_erstellt'] as boolean) || false,
      signatur: (pRaw['_Signatur'] as string) || '',
      teilnehmer: teilnehmerOids.map(oid => oidToTeilnehmer(oid, verantLookup)),
      verteiler: verteilerOids.map(oid => oidToTeilnehmer(oid, verantLookup)),
    };
    protokollMap.set(legacyId, protokoll);
  }

  const elementeByProtokoll = new Map<string, Protokollelement[]>();
  for (const eRaw of elementRecords) {
    const legacyProtId = (eRaw['_ProtokollOid'] as string) || (eRaw['ProtokollId'] as string) || '';
    const newProtId = protokollIdMap.get(legacyProtId) || legacyProtId;
    const legacyId = (eRaw['Id'] as string) || '';

    const now = nowISO();
    const elem: Protokollelement = {
      id: newUUID(),
      created_at: now,
      updated_at: now,
      created_by: null,
      object_type: 'protokollelement',
      legacy_id: legacyId,
      protokoll_id: newProtId,
      position: String((eRaw['_Position'] as string | number) || ''),
      positionstitel: (eRaw['_Positionstitel'] as string) || '',
      positionstext: (eRaw['_Positionstext'] as string) || '',
      thema: ((eRaw['_Thema'] as string) || '').trim(),
      status: (eRaw['_Status'] as number) || 0,
      termin: parseDfDatum((eRaw['_Termin'] as string) || ''),
      verantwortlicher_id: (eRaw['_VerantwortlicherOid'] as string) || (eRaw['VerantwortlicherOid'] as string) || null,
      verantwortlicher_name: (eRaw['VerantwortlicherName'] as string) || '',
      bemerkung: (eRaw['_Bemerkung'] as string) || '',
      erinnerung: (eRaw['_Erinnerung'] as boolean) || false,
      wert: (eRaw['_Wert'] as number) || 0,
      verweise: (eRaw['VerweisArray'] as string[]) || [],
      mobile_erfassung: parseMobileErfassungFromElement(eRaw),
      foto_anzahl: typeof eRaw['_PINGFotoAnzahl'] === 'number' ? eRaw['_PINGFotoAnzahl'] : undefined,
      foto_pfad: (eRaw['_PINGFotoPfad'] as string) || undefined,
      mobil_erfasst: typeof eRaw['_PINGMobilErfasst'] === 'boolean' ? eRaw['_PINGMobilErfasst'] : undefined,
      mobil_datum: eRaw['_PINGMobilDatum'] ? parseDfDatum(eRaw['_PINGMobilDatum'] as string) : undefined,
      mobil_user: (eRaw['_PINGMobilUser'] as string) || undefined,
      notiz: (eRaw['_PINGNotiz'] as string) || undefined,
      info: (eRaw['_PINGInfo'] as string) || undefined,
    };

    const list = elementeByProtokoll.get(legacyProtId) || [];
    list.push(elem);
    elementeByProtokoll.set(legacyProtId, list);
  }

  const pakete: ProtokollPaket[] = [];
  for (const [legacyProtId, protokoll] of protokollMap) {
    pakete.push({
      protokollgruppe: gruppe,
      protokoll: protokoll,
      protokollelemente: elementeByProtokoll.get(legacyProtId) || [],
    });
  }

  console.log(`[V5c] Import: ${protokollMap.size} Protokolle, ${elementRecords.length} Elemente, ${verantwortliche.length} Verantwortliche`);
  return { pakete, verantwortliche };
}

function oidToTeilnehmer(oid: string, lookup: Map<string, Verantwortlicher>): Teilnehmer {
  const v = lookup.get(oid);
  return {
    oid: oid,
    name: v?.name || '',
    nummer: v?.kuerzel || '',
    rolle: '',
  };
}

// ============================================================
// Hierarchisches Format Parser
// ============================================================

function parseDfJsonHierarchical(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: Verantwortlicher[] } {
  const verantwortliche: Verantwortlicher[] = [];
  const pakete: ProtokollPaket[] = [];

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;

    if (obj['Verantwortliche']) {
      const vArr = obj['Verantwortliche'] as Record<string, unknown>[];
      for (const v of vArr) {
        const vList = v['Verantwortlicher'] as Record<string, unknown>[];
        if (vList) {
          for (const vItem of vList) {
            verantwortliche.push({
              ...hubDefaults(),
              legacy_id: (vItem['ID'] as string) || '',
              kuerzel: (vItem['Kuerzel'] as string) || (vItem['Kürzel'] as string) || '',
              name: (vItem['Name'] as string) || '',
            });
          }
        }
      }
      continue;
    }

    if (obj['Protokollgruppe']) {
      const grpArr = obj['Protokollgruppe'] as Record<string, unknown>[];
      for (const grpRaw of grpArr) {
        const gruppe: Protokollgruppe = {
          ...hubDefaults(),
          object_type: 'protokollgruppe',
          legacy_id: grpRaw['Id'] as string || '',
          name: grpRaw['Name'] as string || '',
          projekt_nummer: (grpRaw['ProjektNummer'] as string) || (grpRaw['ProjektId'] as string) || '',
          projekt_name: grpRaw['ProjektName'] as string || '',
          projekt_stammverzeichnis: grpRaw['ProjektStammverzeichnis'] as string || '',
          protokollnummer: grpRaw['Protokollnummer'] as number || 0,
          vorwort: grpRaw['Vorwort'] as string || '',
          nachwort: grpRaw['Nachwort'] as string || '',
          themen: grpRaw['Themen'] as string || '',
          bemerkung: grpRaw['Bemerkung'] as string || '',
        };

        // UUID-Mapping fuer Protokoll-IDs
        const protokollIdMap = new Map<string, string>();

        const protArr = grpRaw['Protokoll'] as Record<string, unknown>[] || [];
        for (const protRaw of protArr) {
          const legacyId = protRaw['Id'] as string || '';
          const newProtId = newUUID();
          protokollIdMap.set(legacyId, newProtId);

          const now = nowISO();
          const protokoll: Protokoll = {
            id: newProtId,
            created_at: now,
            updated_at: now,
            created_by: null,
            object_type: 'protokoll',
            legacy_id: legacyId,
            name: protRaw['Name'] as string || '',
            nummer: protRaw['Nummer'] as number || 0,
            datum: parseDfDatum(protRaw['Datum'] as string || ''),
            ort: protRaw['Ort'] as string || '',
            autor: protRaw['Autor'] as string || '',
            vorbemerkung: protRaw['Vorbemerkung'] as string || '',
            nachbemerkung: protRaw['Nachbemerkung'] as string || '',
            erledigt: protRaw['Erledigt'] as boolean || false,
            ist_einzelprotokoll: protRaw['IstEinzelprotokoll'] as boolean || false,
            erstellt: protRaw['Erstellt'] as boolean || false,
            signatur: protRaw['Signatur'] as string || '',
            teilnehmer: parseTeilnehmer(protRaw['Teilnehmer']),
            verteiler: parseTeilnehmer(protRaw['Verteiler']),
          };

          const elemente: Protokollelement[] = [];
          const elemOuter = protRaw['Protokollelemente'] as unknown[];
          if (elemOuter) {
            for (const inner of elemOuter) {
              const elemArr = (Array.isArray(inner) ? inner : [inner]) as Record<string, unknown>[];
              for (const eRaw of elemArr) {
                const elemNow = nowISO();
                elemente.push({
                  id: newUUID(),
                  created_at: elemNow,
                  updated_at: elemNow,
                  created_by: null,
                  object_type: 'protokollelement',
                  legacy_id: eRaw['Id'] as string || '',
                  protokoll_id: newProtId,
                  position: eRaw['Position'] as string || '',
                  positionstitel: eRaw['Positionstitel'] as string || '',
                  positionstext: eRaw['Positionstext'] as string || '',
                  thema: (eRaw['Thema'] as string || '').trim(),
                  status: eRaw['Status'] as number || 0,
                  termin: parseDfDatum(eRaw['Termin'] as string || ''),
                  bemerkung: eRaw['Bemerkung'] as string || '',
                  erinnerung: eRaw['Erinnerung'] as boolean || false,
                  wert: eRaw['Wert'] as number || 0,
                  verantwortlicher_id: eRaw['VerantwortlicherOid'] as string || null,
                  verantwortlicher_name: eRaw['VerantwortlicherName'] as string || '',
                  verweise: [],
                  mobile_erfassung: parseMobileErfassungFromElement(eRaw),
                  foto_anzahl: typeof eRaw['Anzahl Fotos'] === 'number' ? eRaw['Anzahl Fotos'] : undefined,
                  foto_pfad: (eRaw['Pfad Foto-Ordner'] as string) || undefined,
                  mobil_erfasst: typeof eRaw['Mobil erfasst'] === 'boolean' ? eRaw['Mobil erfasst'] : (typeof eRaw['Mobil erfasst/geändert'] === 'boolean' ? eRaw['Mobil erfasst/geändert'] : undefined),
                  mobil_datum: eRaw['Datum Mobil'] ? parseDfDatum(eRaw['Datum Mobil'] as string) : undefined,
                  mobil_user: (eRaw['Benutzer Kuerzel'] as string) || (eRaw['Benutzer Kürzel'] as string) || undefined,
                  notiz: (eRaw['Freitext-Notiz'] as string) || undefined,
                  info: (eRaw['Info'] as string) || undefined,
                });
              }
            }
          }

          pakete.push({ protokollgruppe: gruppe, protokoll: protokoll, protokollelemente: elemente });
        }
      }
    }
  }

  return { pakete, verantwortliche };
}

// ============================================================
// Shared Helpers
// ============================================================

function parseMobileErfassungFromElement(eRaw: Record<string, unknown>): MobileErfassung {
  const empty = emptyMobileErfassung();

  let result: MobileErfassung;

  const hasV5c = typeof eRaw['_PINGGeoLat'] === 'number' || typeof eRaw['_PINGGeoLon'] === 'number';
  if (hasV5c) {
    result = {
      geo_lat: typeof eRaw['_PINGGeoLat'] === 'number' ? eRaw['_PINGGeoLat'] : null,
      geo_lon: typeof eRaw['_PINGGeoLon'] === 'number' ? eRaw['_PINGGeoLon'] : null,
      geo_accuracy: typeof eRaw['_PINGGeoAccuracy'] === 'number' ? eRaw['_PINGGeoAccuracy'] : null,
      geo_text: (eRaw['_PINGGeoText'] as string) || null,
      geo_heading: typeof eRaw['_PINGGeoHeading'] === 'number' ? eRaw['_PINGGeoHeading'] : null,
      geo_altitude: typeof eRaw['_PINGGeoAltitude'] === 'number' ? eRaw['_PINGGeoAltitude'] : null,
      fotos: [],
    };
  } else {
    const hasFlat = typeof eRaw['Breitengrad'] === 'number' || typeof eRaw['Längengrad'] === 'number' || typeof eRaw['Laengengrad'] === 'number';
    if (hasFlat) {
      result = {
        geo_lat: typeof eRaw['Breitengrad'] === 'number' ? eRaw['Breitengrad'] : null,
        geo_lon: typeof eRaw['Laengengrad'] === 'number' ? eRaw['Laengengrad'] : (typeof eRaw['Längengrad'] === 'number' ? eRaw['Längengrad'] : null),
        geo_accuracy: typeof eRaw['Genauigkeit'] === 'number' ? eRaw['Genauigkeit'] : null,
        geo_text: (eRaw['Standort-Anzeigetext'] as string) || null,
        geo_heading: typeof eRaw['Kompassrichtung'] === 'number' ? eRaw['Kompassrichtung'] : null,
        geo_altitude: typeof eRaw['Hoehe ueber NN'] === 'number' ? eRaw['Hoehe ueber NN'] : (typeof eRaw['Höhe über NN'] === 'number' ? eRaw['Höhe über NN'] : null),
        fotos: [],
      };
    } else {
      const raw = eRaw['MobileErfassung'];
      if (!raw || typeof raw !== 'object') return empty;
      const m = raw as Record<string, unknown>;
      result = {
        geo_lat: typeof m['GeoLat'] === 'number' ? m['GeoLat'] : null,
        geo_lon: typeof m['GeoLon'] === 'number' ? m['GeoLon'] : null,
        geo_accuracy: typeof m['GeoAccuracy'] === 'number' ? m['GeoAccuracy'] : null,
        geo_text: (m['GeoText'] as string) || null,
        geo_heading: typeof m['GeoHeading'] === 'number' ? m['GeoHeading'] : null,
        geo_altitude: typeof m['GeoAltitude'] === 'number' ? m['GeoAltitude'] : null,
        fotos: Array.isArray(m['Fotos']) ? m['Fotos'] : [],
      };
    }
  }

  if (result.geo_lat === 0 && result.geo_lon === 0) {
    return empty;
  }

  return result;
}

function parseTeilnehmer(raw: unknown): Teilnehmer[] {
  if (!raw || !Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(t => ({
    oid: t['Oid'] as string || '',
    nummer: t['Nummer'] as string || '',
    name: t['Name'] as string || '',
    rolle: t['Rolle'] as string || '',
  }));
}
