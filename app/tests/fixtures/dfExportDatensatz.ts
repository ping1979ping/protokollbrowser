/**
 * Fester Datensatz für den DOCUframe-Datei-Export (tests/dfExport.test.ts).
 *
 * Deckt beide Formate und ihre Zweige ab: regulärer DocuFrame-Punkt mit Verortung und Foto,
 * neuer Punkt in einem Entwurf (mit Thema-Kennung und lokalem Verantwortlichen), Punkt im
 * Bautagebuch-Anhang. Die erwarteten Bytes wurden mit dem Code aus ExportScreen.tsx im Stand
 * 537dfd8 erzeugt (Uhr 2026-09-17T07:30:00Z, Zeitzone Europe/Berlin).
 */
import type { Protokoll, Protokollelement, Protokollgruppe } from '../../src/types.ts';

export const JETZT = '2026-09-17T07:30:00.000Z';
const T = '2026-09-01T08:00:00.000Z';

const ohneOrt = { geo_lat: null, geo_lon: null, geo_accuracy: null, geo_text: null, geo_heading: null, geo_altitude: null, fotos: [] };

export const gruppe: Protokollgruppe = {
  id: 'lokal-g1', created_at: T, updated_at: T, created_by: null, object_type: 'protokollgruppe',
  legacy_id: 'OID-GRP-1', name: 'Baubesprechung Werkhalle', projekt_nummer: '4711', projekt_name: 'Neubau Werkhalle',
  projekt_stammverzeichnis: '', protokollnummer: 4, vorwort: '', nachwort: '', themen: '', bemerkung: '',
};

export const protokoll: Protokoll = {
  id: 'lokal-p4', created_at: T, updated_at: T, created_by: null, object_type: 'protokoll',
  legacy_id: 'OID-P4', name: 'Baubesprechung 4', nummer: 4, datum: '2026-09-03T10:00:00', ort: 'Baustelle',
  autor: 'Ing. Muster', vorbemerkung: '', nachbemerkung: 'Nächster Termin folgt', erledigt: false,
  ist_einzelprotokoll: false, erstellt: true, signatur: '',
  teilnehmer: [{ oid: 'OID-T1', nummer: 'RM', name: 'Rohbau Muster GmbH', rolle: '' }, { oid: '', nummer: '', name: 'Gast', rolle: '' }],
  verteiler: [{ oid: 'OID-T2', nummer: 'EL', name: 'Elektro Beispiel', rolle: '' }],
};

const anhang: Protokoll = {
  ...protokoll, id: 'lokal-bt', legacy_id: 'OID-BT', name: 'Bautagebuch 2026', nummer: -1,
  datum: '2026-09-01T00:00:00', autor: 'Bauleitung', vorbemerkung: 'Anhang', teilnehmer: [], verteiler: [],
};

const entwurf: Protokoll = {
  ...protokoll, id: 'c85c840b-32f3-4b6f-9625-363af177b5d4', legacy_id: '', name: 'Baubesprechung 5 - 2026',
  nummer: 5, datum: '2026-09-17T07:12:34.000Z', erstellt: false, teilnehmer: [], verteiler: [], is_new: true,
};

export const prots: Protokoll[] = [protokoll, anhang, entwurf];

export const relevante: Protokollelement[] = [
  {
    id: 'lokal-e1', created_at: T, updated_at: T, created_by: null, object_type: 'protokollelement',
    legacy_id: 'OID-E1', protokoll_id: 'lokal-p4', position: '4.1', positionstitel: 'Kran',
    positionstext: 'Kran steht, Abnahme durch den Prüfer ist erfolgt.', thema: 'Baustelleneinrichtung',
    status: 20, termin: '2026-09-10T00:00:00', verantwortlicher_id: 'OID-T1', verantwortlicher_name: 'Rohbau Muster GmbH',
    bemerkung: '{Bilder: 4711_Bild_1.jpg}', erinnerung: true, wert: 12.5, verweise: ['OID-E0'],
    mobile_erfassung: {
      geo_lat: 50.3245, geo_lon: 11.285, geo_accuracy: 5, geo_text: '50.3245, 11.285 (5 m)', geo_heading: 90, geo_altitude: 301.5,
      fotos: [{ file_name: '4711_Bild_1.jpg', relative_path: 'photos/4711_Bild_1.jpg', ziel_pfad: '' }],
    },
    foto_anzahl: 1, foto_pfad: 'P:/4711/Fotos', mobil_erfasst: true, mobil_datum: '2026-09-17T08:00:00', mobil_user: 'CP',
    notiz: 'Prüfbericht nachreichen', info: 'Kranprüfung', is_modified: true,
  },
  {
    id: 'lokal-e2', created_at: T, updated_at: T, created_by: null, object_type: 'protokollelement',
    legacy_id: '', protokoll_id: 'c85c840b-32f3-4b6f-9625-363af177b5d4', position: '5.1', positionstitel: 'Rohbau',
    positionstext: 'Bewehrungsabnahme Decke über EG am Donnerstag.', thema: 'Rohbau', thema_term_id: '6f1c3a52-0f0e-4d7e-9a61-0d7f3b1e2c11',
    status: 10, termin: '2026-09-24T00:00:00', verantwortlicher_id: 'v-lokal-1', verantwortlicher_name: 'Rohbau Muster GmbH',
    bemerkung: '', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...ohneOrt }, is_new: true,
  },
  {
    id: 'lokal-e3', created_at: T, updated_at: T, created_by: null, object_type: 'protokollelement',
    legacy_id: '', protokoll_id: 'lokal-bt', position: '12', positionstitel: '',
    positionstext: 'Wetter: sonnig, 18 °C. Betonage Decke über EG.', thema: 'Bautagebuch',
    status: 0, termin: '', verantwortlicher_id: null, verantwortlicher_name: '',
    bemerkung: '', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...ohneOrt, geo_lat: 50.1, geo_lon: 11.2 },
    is_new: true,
  },
];

export const datum = '2026-09-17';
export const autor = 'Ing. Muster';
export const vorbemerkung = 'Folgeprotokoll zu Nr. 4';
export const verantwortlicheMap = new Map<string, string>([['v-lokal-1', 'OID-T1']]);
