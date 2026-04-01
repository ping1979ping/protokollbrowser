// Parser fuer DOCUframe JSON-Export
// Unterstuetzt:
// - Hierarchisches Format (alt, verschachtelte Objekte)
// - V5c Flat Format (neu, flaches Array mit Introspection-Feldnamen)

import type { ProtokollPaket, Protokollgruppe, Protokoll, Protokollelement, Teilnehmer } from './types';

interface DfVerantwortlicher {
  ID: string;
  Kuerzel: string;
  Name: string;
}

// DOCUframe Datumsformat: "DD.MM.YYYY HH:MM:SS" → ISO
function parseDfDatum(s: string): string {
  if (!s || s.startsWith('01.01.1601')) return '';
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
}

// UTF-16LE erkennen und dekodieren (mit oder ohne BOM)
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // UTF-16LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  // UTF-16LE ohne BOM: zweites Byte ist 0x00 bei ASCII-Zeichen (z.B. '[' = 5B 00)
  if (bytes.length >= 2 && bytes[1] === 0x00) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  // UTF-8 BOM oder kein BOM
  return new TextDecoder('utf-8').decode(buffer);
}

// ============================================================
// Format-Erkennung
// ============================================================

function detectFormat(raw: unknown[]): 'hierarchical' | 'v5c' {
  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    // V5c: hat "version" Key im Manifest
    if (typeof obj['version'] === 'string') return 'v5c';
    // Hierarchisch: hat verschachtelte "Protokollgruppe" oder "Verantwortliche"
    if (obj['Protokollgruppe'] || obj['Verantwortliche']) return 'hierarchical';
  }
  // Fallback: wenn Records V5c/V6-Keys auf Top-Level haben
  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    if ('ProtGrpID' in obj || '_ProtokollgruppeOid' in obj || 'ProtokollId' in obj || '_ProtokollOid' in obj) return 'v5c';
  }
  return 'hierarchical';
}

// ============================================================
// Haupt-Dispatcher
// ============================================================

export function parseDfJson(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: DfVerantwortlicher[] } {
  const format = detectFormat(raw);
  if (format === 'v5c') return parseDfJsonV5c(raw);
  return parseDfJsonHierarchical(raw);
}

// ============================================================
// V5c Flat Format Parser
// ============================================================

function parseDfJsonV5c(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: DfVerantwortlicher[] } {
  const verantwortliche: DfVerantwortlicher[] = [];
  let gruppeRecord: Record<string, unknown> | null = null;
  const protokollRecords: Record<string, unknown>[] = [];
  const elementRecords: Record<string, unknown>[] = [];
  let manifestProjektNummer = '';
  let manifestProjektName = '';

  // Single pass: Records klassifizieren
  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;

    // Manifest: hat "version" Key
    if (typeof obj['version'] === 'string') {
      manifestProjektNummer = (obj['ProjektNummer'] as string) || (obj['ProjektId'] as string) || '';
      manifestProjektName = (obj['ProjektName'] as string) || '';
      continue;
    }

    // Verantwortlicher: hat "ID" (uppercase) + "Kuerzel" + "Name", max ~3-4 Keys
    if (typeof obj['ID'] === 'string' && (typeof obj['Kuerzel'] === 'string' || typeof obj['Kürzel'] === 'string') && !('ProtGrpID' in obj) && !('_ProtokollgruppeOid' in obj) && !('ProtokollId' in obj) && !('_ProtokollOid' in obj)) {
      verantwortliche.push({
        ID: obj['ID'] as string,
        Kuerzel: (obj['Kuerzel'] as string) || (obj['Kürzel'] as string) || '',
        Name: (obj['Name'] as string) || '',
      });
      continue;
    }

    // Element: hat "ProtokollId" (V5c) oder "_ProtokollOid" (V6)
    if ('ProtokollId' in obj || '_ProtokollOid' in obj) {
      elementRecords.push(obj);
      continue;
    }

    // Protokoll: hat "ProtGrpID" (V5c) oder "_ProtokollgruppeOid" (V6)
    if ('ProtGrpID' in obj || '_ProtokollgruppeOid' in obj) {
      protokollRecords.push(obj);
      continue;
    }

    // Gruppe: hat "Id" und viele Felder (nicht Manifest, nicht Verantwortlicher)
    if ('Id' in obj && Object.keys(obj).length > 5) {
      gruppeRecord = obj;
      continue;
    }
  }

  if (!gruppeRecord) {
    console.warn('[V5c] Keine Protokollgruppe gefunden');
    return { pakete: [], verantwortliche };
  }

  // Gruppe bauen
  const gruppe: Protokollgruppe = {
    Id: (gruppeRecord['Id'] as string) || '',
    Name: (gruppeRecord['_Name'] as string) || '',
    ProjektNummer: (gruppeRecord['ProjektNummer'] as string) || (gruppeRecord['ProjektId'] as string) || manifestProjektNummer,
    ProjektName: (gruppeRecord['ProjektName'] as string) || manifestProjektName,
    ProjektStammverzeichnis: (gruppeRecord['ProjektStammverzeichnis'] as string) || '',
    Protokollnummer: (gruppeRecord['_Protokollnummer'] as number) || 0,
    Vorwort: (gruppeRecord['_Vorwort'] as string) || '',
    Nachwort: (gruppeRecord['_Nachwort'] as string) || '',
    Themen: Array.isArray(gruppeRecord['_Themen'])
      ? (gruppeRecord['_Themen'] as string[]).join(', ')
      : (gruppeRecord['_Themen'] as string) || '',
    Bemerkung: (gruppeRecord['_Bemerkung'] as string) || '',
  };

  // Verantwortliche als OID→Name Lookup fuer Teilnehmer-Anreicherung
  const verantLookup = new Map(verantwortliche.map(v => [v.ID, v]));

  // Protokolle bauen
  const protokollMap = new Map<string, Protokoll>();
  for (const pRaw of protokollRecords) {
    const id = (pRaw['Id'] as string) || '';
    const teilnehmerOids = (pRaw['_TeilnehmerOids'] as string[]) || (pRaw['TeilnehmerArray'] as string[]) || [];
    const verteilerOids = (pRaw['_VerteilerOids'] as string[]) || (pRaw['VerteilerArray'] as string[]) || [];

    const protokoll: Protokoll = {
      Id: id,
      Name: (pRaw['_Name'] as string) || '',
      Nummer: (pRaw['_Nummer'] as number) || 0,
      Datum: parseDfDatum((pRaw['_Datum'] as string) || ''),
      Ort: (pRaw['_Ort'] as string) || '',
      Autor: (pRaw['_Autor'] as string) || '',
      Vorbemerkung: (pRaw['_Vorbemerkung'] as string) || '',
      Nachbemerkung: (pRaw['_Nachbemerkung'] as string) || '',
      Erledigt: (pRaw['_erledigt'] as boolean) || false,
      IstEinzelprotokoll: (pRaw['_istEinzelprotokoll'] as boolean) || false,
      Erstellt: (pRaw['_erstellt'] as boolean) || false,
      Signatur: (pRaw['_Signatur'] as string) || '',
      Teilnehmer: teilnehmerOids.map(oid => oidToTeilnehmer(oid, verantLookup)),
      Verteiler: verteilerOids.map(oid => oidToTeilnehmer(oid, verantLookup)),
    };
    protokollMap.set(id, protokoll);
  }

  // Elemente bauen und nach ProtokollId gruppieren
  const elementeByProtokoll = new Map<string, Protokollelement[]>();
  for (const eRaw of elementRecords) {
    const protId = (eRaw['_ProtokollOid'] as string) || (eRaw['ProtokollId'] as string) || '';
    const elem: Protokollelement = {
      Id: (eRaw['Id'] as string) || '',
      ProtokollId: protId,
      Position: String((eRaw['_Position'] as string | number) || ''),
      Positionstitel: (eRaw['_Positionstitel'] as string) || '',
      Positionstext: (eRaw['_Positionstext'] as string) || '',
      Thema: ((eRaw['_Thema'] as string) || '').trim(),
      Status: (eRaw['_Status'] as number) || 0,
      Termin: parseDfDatum((eRaw['_Termin'] as string) || ''),
      Bemerkung: (eRaw['_Bemerkung'] as string) || '',
      Erinnerung: (eRaw['_Erinnerung'] as boolean) || false,
      Wert: (eRaw['_Wert'] as number) || 0,
      VerantwortlicherFirmaOid: (eRaw['_VerantwortlicherOid'] as string) || (eRaw['VerantwortlicherOid'] as string) || '',
      VerantwortlicherFirmaName: (eRaw['VerantwortlicherName'] as string) || '',
      Verweise: (eRaw['VerweisArray'] as string[]) || [],
      MobileErfassung: parseMobileErfassungFromElement(eRaw),
      FotoAnzahl: typeof eRaw['_PINGFotoAnzahl'] === 'number' ? eRaw['_PINGFotoAnzahl'] : undefined,
      FotoPfad: (eRaw['_PINGFotoPfad'] as string) || undefined,
      MobilErfasst: typeof eRaw['_PINGMobilErfasst'] === 'boolean' ? eRaw['_PINGMobilErfasst'] : undefined,
      MobilDatum: eRaw['_PINGMobilDatum'] ? parseDfDatum(eRaw['_PINGMobilDatum'] as string) : undefined,
      MobilUser: (eRaw['_PINGMobilUser'] as string) || undefined,
      Notiz: (eRaw['_PINGNotiz'] as string) || undefined,
      Info: (eRaw['_PINGInfo'] as string) || undefined,
    };

    const list = elementeByProtokoll.get(protId) || [];
    list.push(elem);
    elementeByProtokoll.set(protId, list);
  }

  // ProtokollPaket[] zusammenbauen
  const pakete: ProtokollPaket[] = [];
  for (const [protId, protokoll] of protokollMap) {
    pakete.push({
      Protokollgruppe: gruppe,
      Protokoll: protokoll,
      Protokollelemente: elementeByProtokoll.get(protId) || [],
    });
  }

  console.log(`[V5c] Import: ${protokollMap.size} Protokolle, ${elementRecords.length} Elemente, ${verantwortliche.length} Verantwortliche`);
  return { pakete, verantwortliche };
}

function oidToTeilnehmer(oid: string, lookup: Map<string, DfVerantwortlicher>): Teilnehmer {
  const v = lookup.get(oid);
  return {
    Oid: oid,
    Name: v?.Name || '',
    Nummer: v?.Kuerzel || '',
    Rolle: '',
  };
}

// ============================================================
// Hierarchisches Format Parser (bisherig)
// ============================================================

function parseDfJsonHierarchical(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: DfVerantwortlicher[] } {
  const verantwortliche: DfVerantwortlicher[] = [];
  const pakete: ProtokollPaket[] = [];

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;

    // Verantwortliche-Block
    if (obj['Verantwortliche']) {
      const vArr = obj['Verantwortliche'] as Record<string, unknown>[];
      for (const v of vArr) {
        const vList = v['Verantwortlicher'] as Record<string, unknown>[];
        if (vList) {
          for (const vItem of vList) {
            verantwortliche.push({
              ID: (vItem['ID'] as string) || '',
              Kuerzel: (vItem['Kuerzel'] as string) || (vItem['Kürzel'] as string) || '',
              Name: (vItem['Name'] as string) || '',
            });
          }
        }
      }
      continue;
    }

    // Protokollgruppe-Block (hierarchisch)
    if (obj['Protokollgruppe']) {
      const grpArr = obj['Protokollgruppe'] as Record<string, unknown>[];
      for (const grpRaw of grpArr) {
        const gruppe: Protokollgruppe = {
          Id: grpRaw['Id'] as string || '',
          Name: grpRaw['Name'] as string || '',
          ProjektNummer: (grpRaw['ProjektNummer'] as string) || (grpRaw['ProjektId'] as string) || '',
          ProjektName: grpRaw['ProjektName'] as string || '',
          ProjektStammverzeichnis: grpRaw['ProjektStammverzeichnis'] as string || '',
          Protokollnummer: grpRaw['Protokollnummer'] as number || 0,
          Vorwort: grpRaw['Vorwort'] as string || '',
          Nachwort: grpRaw['Nachwort'] as string || '',
          Themen: grpRaw['Themen'] as string || '',
          Bemerkung: grpRaw['Bemerkung'] as string || '',
        };

        // Protokolle innerhalb der Gruppe
        const protArr = grpRaw['Protokoll'] as Record<string, unknown>[] || [];
        for (const protRaw of protArr) {
          const protokoll: Protokoll = {
            Id: protRaw['Id'] as string || '',
            Name: protRaw['Name'] as string || '',
            Nummer: protRaw['Nummer'] as number || 0,
            Datum: parseDfDatum(protRaw['Datum'] as string || ''),
            Ort: protRaw['Ort'] as string || '',
            Autor: protRaw['Autor'] as string || '',
            Vorbemerkung: protRaw['Vorbemerkung'] as string || '',
            Nachbemerkung: protRaw['Nachbemerkung'] as string || '',
            Erledigt: protRaw['Erledigt'] as boolean || false,
            IstEinzelprotokoll: protRaw['IstEinzelprotokoll'] as boolean || false,
            Erstellt: protRaw['Erstellt'] as boolean || false,
            Signatur: protRaw['Signatur'] as string || '',
            Teilnehmer: parseTeilnehmer(protRaw['Teilnehmer']),
            Verteiler: parseTeilnehmer(protRaw['Verteiler']),
          };

          // Elemente — doppelt verschachteltes Array: [[{...}, {...}]]
          const elemente: Protokollelement[] = [];
          const elemOuter = protRaw['Protokollelemente'] as unknown[];
          if (elemOuter) {
            for (const inner of elemOuter) {
              const elemArr = (Array.isArray(inner) ? inner : [inner]) as Record<string, unknown>[];
              for (const eRaw of elemArr) {
                elemente.push({
                  Id: eRaw['Id'] as string || '',
                  ProtokollId: eRaw['ProtokollId'] as string || '',
                  Position: eRaw['Position'] as string || '',
                  Positionstitel: eRaw['Positionstitel'] as string || '',
                  Positionstext: eRaw['Positionstext'] as string || '',
                  Thema: (eRaw['Thema'] as string || '').trim(),
                  Status: eRaw['Status'] as number || 0,
                  Termin: parseDfDatum(eRaw['Termin'] as string || ''),
                  Bemerkung: eRaw['Bemerkung'] as string || '',
                  Erinnerung: eRaw['Erinnerung'] as boolean || false,
                  Wert: eRaw['Wert'] as number || 0,
                  VerantwortlicherFirmaOid: eRaw['VerantwortlicherOid'] as string || '',
                  VerantwortlicherFirmaName: eRaw['VerantwortlicherName'] as string || '',
                  Verweise: [],
                  MobileErfassung: parseMobileErfassungFromElement(eRaw),
                  // Neue DOCUframe-Metadaten (flache Felder aus Export-Makro)
                  FotoAnzahl: typeof eRaw['Anzahl Fotos'] === 'number' ? eRaw['Anzahl Fotos'] : undefined,
                  FotoPfad: (eRaw['Pfad Foto-Ordner'] as string) || undefined,
                  MobilErfasst: typeof eRaw['Mobil erfasst'] === 'boolean' ? eRaw['Mobil erfasst'] : (typeof eRaw['Mobil erfasst/geändert'] === 'boolean' ? eRaw['Mobil erfasst/geändert'] : undefined),
                  MobilDatum: eRaw['Datum Mobil'] ? parseDfDatum(eRaw['Datum Mobil'] as string) : undefined,
                  MobilUser: (eRaw['Benutzer Kuerzel'] as string) || (eRaw['Benutzer Kürzel'] as string) || undefined,
                  Notiz: (eRaw['Freitext-Notiz'] as string) || undefined,
                  Info: (eRaw['Info'] as string) || undefined,
                });
              }
            }
          }

          pakete.push({ Protokollgruppe: gruppe, Protokoll: protokoll, Protokollelemente: elemente });
        }
      }
    }
  }

  return { pakete, verantwortliche };
}

// ============================================================
// Shared Helpers
// ============================================================

// Liest MobileErfassung aus dem Element-Objekt:
// V5c Format: _PINGGeoLat, _PINGGeoLon etc.
// Neues Format: Breitengrad, Längengrad etc. (flache deutsche Feldnamen)
// Altes Format: verschachteltes MobileErfassung-Objekt
function parseMobileErfassungFromElement(eRaw: Record<string, unknown>): Protokollelement['MobileErfassung'] {
  const empty = { GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoText: null, GeoHeading: null, GeoAltitude: null, Fotos: [] };

  // V5c Format: _PING-Prefix Felder
  const hasV5c = typeof eRaw['_PINGGeoLat'] === 'number' || typeof eRaw['_PINGGeoLon'] === 'number';
  if (hasV5c) {
    return {
      GeoLat: typeof eRaw['_PINGGeoLat'] === 'number' ? eRaw['_PINGGeoLat'] : null,
      GeoLon: typeof eRaw['_PINGGeoLon'] === 'number' ? eRaw['_PINGGeoLon'] : null,
      GeoAccuracy: typeof eRaw['_PINGGeoAccuracy'] === 'number' ? eRaw['_PINGGeoAccuracy'] : null,
      GeoText: (eRaw['_PINGGeoText'] as string) || null,
      GeoHeading: typeof eRaw['_PINGGeoHeading'] === 'number' ? eRaw['_PINGGeoHeading'] : null,
      GeoAltitude: typeof eRaw['_PINGGeoAltitude'] === 'number' ? eRaw['_PINGGeoAltitude'] : null,
      Fotos: [],
    };
  }

  // Neues Format: flache deutsche Feldnamen direkt auf dem Element (V5c: Umlaute, V6: ASCII)
  const hasFlat = typeof eRaw['Breitengrad'] === 'number' || typeof eRaw['Längengrad'] === 'number' || typeof eRaw['Laengengrad'] === 'number';
  if (hasFlat) {
    return {
      GeoLat: typeof eRaw['Breitengrad'] === 'number' ? eRaw['Breitengrad'] : null,
      GeoLon: typeof eRaw['Laengengrad'] === 'number' ? eRaw['Laengengrad'] : (typeof eRaw['Längengrad'] === 'number' ? eRaw['Längengrad'] : null),
      GeoAccuracy: typeof eRaw['Genauigkeit'] === 'number' ? eRaw['Genauigkeit'] : null,
      GeoText: (eRaw['Standort-Anzeigetext'] as string) || null,
      GeoHeading: typeof eRaw['Kompassrichtung'] === 'number' ? eRaw['Kompassrichtung'] : null,
      GeoAltitude: typeof eRaw['Hoehe ueber NN'] === 'number' ? eRaw['Hoehe ueber NN'] : (typeof eRaw['Höhe über NN'] === 'number' ? eRaw['Höhe über NN'] : null),
      Fotos: [],
    };
  }

  // Altes Format: verschachteltes MobileErfassung-Objekt (Rückwärtskompatibilität)
  const raw = eRaw['MobileErfassung'];
  if (!raw || typeof raw !== 'object') return empty;
  const m = raw as Record<string, unknown>;
  return {
    GeoLat: typeof m['GeoLat'] === 'number' ? m['GeoLat'] : null,
    GeoLon: typeof m['GeoLon'] === 'number' ? m['GeoLon'] : null,
    GeoAccuracy: typeof m['GeoAccuracy'] === 'number' ? m['GeoAccuracy'] : null,
    GeoText: (m['GeoText'] as string) || null,
    GeoHeading: typeof m['GeoHeading'] === 'number' ? m['GeoHeading'] : null,
    GeoAltitude: typeof m['GeoAltitude'] === 'number' ? m['GeoAltitude'] : null,
    Fotos: Array.isArray(m['Fotos']) ? m['Fotos'] : [],
  };
}

function parseTeilnehmer(raw: unknown): Teilnehmer[] {
  if (!raw || !Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(t => ({
    Oid: t['Oid'] as string || '',
    Nummer: t['Nummer'] as string || '',
    Name: t['Name'] as string || '',
    Rolle: t['Rolle'] as string || '',
  }));
}
