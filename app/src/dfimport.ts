// Parser fuer DOCUframe JSON-Export (hierarchisches Format, UTF-16LE)

import type { ProtokollPaket, Protokollgruppe, Protokoll, Protokollelement, Teilnehmer } from './types';

interface DfVerantwortlicher {
  ID: string;
  'Kürzel': string;
  Name: string;
}

// DOCUframe Datumsformat: "DD.MM.YYYY HH:MM:SS" → ISO
function parseDfDatum(s: string): string {
  if (!s || s.startsWith('01.01.1601')) return '';
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}`;
}

// UTF-16LE BOM erkennen und dekodieren
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // UTF-16LE BOM: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(buffer);
  }
  // UTF-8 BOM oder kein BOM
  return new TextDecoder('utf-8').decode(buffer);
}

export function parseDfJson(raw: unknown[]): { pakete: ProtokollPaket[]; verantwortliche: DfVerantwortlicher[] } {
  const verantwortliche: DfVerantwortlicher[] = [];
  const pakete: ProtokollPaket[] = [];

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;

    // Verantwortliche-Block
    if (obj['Verantwortliche']) {
      const vArr = obj['Verantwortliche'] as Record<string, unknown>[];
      for (const v of vArr) {
        const vList = v['Verantwortlicher'] as DfVerantwortlicher[];
        if (vList) verantwortliche.push(...vList);
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
          ProjektId: grpRaw['ProjektId'] as string || '',
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
                  MobileErfassung: {
                    GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoText: null, Fotos: [],
                  },
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

function parseTeilnehmer(raw: unknown): Teilnehmer[] {
  if (!raw || !Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map(t => ({
    Oid: t['Oid'] as string || '',
    Nummer: t['Nummer'] as string || '',
    Name: t['Name'] as string || '',
    Rolle: t['Rolle'] as string || '',
  }));
}
