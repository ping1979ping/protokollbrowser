import type { ProtokollPaket } from './types';
import { emptyMobileErfassung } from './types';

const mob = emptyMobileErfassung();

function hubDefaults() {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), created_at: now, updated_at: now, created_by: null };
}

export const testDaten: ProtokollPaket[] = [
  // === Projekt 1: B123 Ausbau Musterstrasse — Protokoll 4 ===
  {
    protokollgruppe: {
      ...hubDefaults(),
      object_type: 'protokollgruppe',
      legacy_id: 'grp-001',
      name: 'Baustellennotiz', projekt_nummer: 'PR-4711',
      projekt_name: 'B123 Ausbau Musterstrasse',
      projekt_stammverzeichnis: '\\\\Server\\Projekte\\B123_Musterstrasse\\',
      protokollnummer: 5, vorwort: '', nachwort: '', themen: 'Tiefbau, Maengel', bemerkung: '',
    },
    protokoll: {
      ...hubDefaults(),
      object_type: 'protokoll',
      legacy_id: 'prot-001a',
      name: 'Baustellennotiz 4', nummer: 4,
      datum: '2026-02-23T09:00:00', ort: 'Baustelle Musterstrasse', autor: 'Max Mustermann',
      vorbemerkung: '', nachbemerkung: '', erledigt: true,
      ist_einzelprotokoll: false, erstellt: true, signatur: '',
      teilnehmer: [
        { oid: 'adr-010', nummer: '10010', name: 'GSD Software mbH', rolle: 'AG' },
        { oid: 'adr-011', nummer: '50001', name: 'Adler Anton', rolle: 'BL' },
        { oid: 'adr-012', nummer: '50002', name: 'Bauer Bernd', rolle: 'AN' },
      ],
      verteiler: [
        { oid: 'adr-011', nummer: '50001', name: 'Adler Anton', rolle: '' },
        { oid: 'adr-013', nummer: '50003', name: 'Fischer Fritz', rolle: '' },
      ],
    },
    protokollelemente: [
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-4-01', protokoll_id: 'prot-001a', position: '1.1', positionstitel: 'Baugrubensicherung Achse A', positionstext: 'Verbau kontrollieren', thema: 'Tiefbau', status: 20, termin: '2026-02-28T00:00:00', verantwortlicher_id: 'firm-001', verantwortlicher_name: 'Ingenieurbuero Adler', bemerkung: 'Erledigt', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-4-02', protokoll_id: 'prot-001a', position: '1.2', positionstitel: 'Wasserhaltung pruefen', positionstext: 'Pumpensumpf und Abfluss kontrollieren', thema: 'Tiefbau', status: 20, termin: '2026-02-28T00:00:00', verantwortlicher_id: 'firm-002', verantwortlicher_name: 'Bauer Bau GmbH', bemerkung: 'OK', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-4-03', protokoll_id: 'prot-001a', position: '2.1', positionstitel: 'Fehlende Absturzsicherung', positionstext: 'Gelaender an Treppe Gebaeude B fehlt', thema: 'Mangel', status: 25, termin: '2026-03-05T00:00:00', verantwortlicher_id: 'firm-003', verantwortlicher_name: 'GSD Software mbH', bemerkung: 'Gelaender montiert', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
    ],
  },
  // === Projekt 1: B123 Ausbau Musterstrasse — Protokoll 5 ===
  {
    protokollgruppe: {
      ...hubDefaults(),
      object_type: 'protokollgruppe',
      legacy_id: 'grp-001',
      name: 'Baustellennotiz', projekt_nummer: 'PR-4711',
      projekt_name: 'B123 Ausbau Musterstrasse',
      projekt_stammverzeichnis: '\\\\Server\\Projekte\\B123_Musterstrasse\\',
      protokollnummer: 5, vorwort: 'Protokoll der 5. Baustellenbegehung.', nachwort: 'Naechster Termin: 23.03.2026', themen: 'Tiefbau, Maengel, Restarbeiten', bemerkung: '',
    },
    protokoll: {
      ...hubDefaults(),
      object_type: 'protokoll',
      legacy_id: 'prot-001b',
      name: 'Baustellennotiz 5', nummer: 5,
      datum: '2026-03-09T09:00:00', ort: 'Baustelle Musterstrasse', autor: 'Max Mustermann',
      vorbemerkung: '', nachbemerkung: '', erledigt: false,
      ist_einzelprotokoll: false, erstellt: true, signatur: '',
      teilnehmer: [
        { oid: 'adr-010', nummer: '10010', name: 'GSD Software mbH', rolle: 'AG' },
        { oid: 'adr-011', nummer: '50001', name: 'Adler Anton', rolle: 'BL' },
        { oid: 'adr-012', nummer: '50002', name: 'Bauer Bernd', rolle: 'AN' },
      ],
      verteiler: [
        { oid: 'adr-011', nummer: '50001', name: 'Adler Anton', rolle: '' },
        { oid: 'adr-013', nummer: '50003', name: 'Fischer Fritz', rolle: '' },
      ],
    },
    protokollelemente: [
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-01', protokoll_id: 'prot-001b', position: '1.1', positionstitel: '', positionstext: 'Trasse herstellen, Bodenaushub und Leitungsverlegung gemaess Plan. Abschnitt 1+00 bis 1+50.', thema: 'Tiefbau', status: 10, termin: '2026-03-16T00:00:00', verantwortlicher_id: 'firm-001', verantwortlicher_name: 'Ingenieurbuero Adler', bemerkung: '', erinnerung: false, wert: 0, verweise: ['e-4-01'], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-02', protokoll_id: 'prot-001b', position: '1.2', positionstitel: '', positionstext: 'Verdichtungspruefung nach Verfuellung durchfuehren.', thema: 'Tiefbau', status: 0, termin: '2026-03-20T00:00:00', verantwortlicher_id: 'firm-002', verantwortlicher_name: 'Bauer Bau GmbH', bemerkung: '', erinnerung: true, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-03', protokoll_id: 'prot-001b', position: '2.1', positionstitel: '', positionstext: 'Schachtabdeckung nicht buendig Achse 1+35, Austausch erforderlich.', thema: 'Mangel', status: 11, termin: '2026-03-18T00:00:00', verantwortlicher_id: 'firm-003', verantwortlicher_name: 'GSD Software mbH', bemerkung: 'Erstmals festgestellt am 09.03.2026', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-04', protokoll_id: 'prot-001b', position: '2.2', positionstitel: '', positionstext: 'Haarriss in Bodenplatte Gebaeude C, ca. 2m Laenge. Gutachter hinzuziehen.', thema: 'Mangel', status: 11, termin: '2026-03-25T00:00:00', verantwortlicher_id: 'firm-002', verantwortlicher_name: 'Bauer Bau GmbH', bemerkung: '', erinnerung: true, wert: 2500.0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-05', protokoll_id: 'prot-001b', position: '3.1', positionstitel: '', positionstext: 'Absperrungen und Beschilderung kontrollieren.', thema: 'Allgemein', status: 20, termin: '2026-03-10T00:00:00', verantwortlicher_id: 'firm-001', verantwortlicher_name: 'Ingenieurbuero Adler', bemerkung: 'Erledigt - alles in Ordnung.', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob, geo_lat: 50.3245, geo_lon: 11.285, geo_accuracy: 5, geo_text: '50.3245, 11.285 (5 m)' } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-5-06', protokoll_id: 'prot-001b', position: '3.2', positionstitel: '', positionstext: 'Sicherheitsunterweisung fuer 3 neue MA der Fa. Bauer durchfuehren.', thema: 'Info', status: 17, termin: '2026-03-09T00:00:00', verantwortlicher_id: 'firm-003', verantwortlicher_name: 'GSD Software mbH', bemerkung: 'Durchgefuehrt am 09.03.', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
    ],
  },
  // === Projekt 2: K45 Sanierung Hauptstrasse — Protokoll 2 ===
  {
    protokollgruppe: {
      ...hubDefaults(),
      object_type: 'protokollgruppe',
      legacy_id: 'grp-002',
      name: 'Jour fixe', projekt_nummer: 'PR-8820',
      projekt_name: 'K45 Sanierung Hauptstrasse',
      projekt_stammverzeichnis: '\\\\Server\\Projekte\\K45_Hauptstrasse\\',
      protokollnummer: 2, vorwort: '', nachwort: '', themen: 'Hochbau, Elektro', bemerkung: '',
    },
    protokoll: {
      ...hubDefaults(),
      object_type: 'protokoll',
      legacy_id: 'prot-002a',
      name: 'Jour fixe 2', nummer: 2,
      datum: '2026-03-05T14:00:00', ort: 'Baubuero Hauptstrasse 12', autor: 'Sabine Schmidt',
      vorbemerkung: '', nachbemerkung: '', erledigt: false,
      ist_einzelprotokoll: false, erstellt: true, signatur: '',
      teilnehmer: [
        { oid: 'adr-020', nummer: '20001', name: 'Mueller GmbH', rolle: 'AG' },
        { oid: 'adr-021', nummer: '20002', name: 'Weber Klaus', rolle: 'BL' },
        { oid: 'adr-022', nummer: '20003', name: 'Schneider Eva', rolle: 'Elektro' },
      ],
      verteiler: [
        { oid: 'adr-021', nummer: '20002', name: 'Weber Klaus', rolle: '' },
      ],
    },
    protokollelemente: [
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-2-01', protokoll_id: 'prot-002a', position: '1.1', positionstitel: '', positionstext: 'Fenster EG einbauen und abdichten.', thema: 'Hochbau', status: 10, termin: '2026-03-12T00:00:00', verantwortlicher_id: 'firm-004', verantwortlicher_name: 'Bauunternehmung Weber', bemerkung: '', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-2-02', protokoll_id: 'prot-002a', position: '1.2', positionstitel: '', positionstext: 'Estrich im OG einbringen, Trocknungszeit beachten.', thema: 'Hochbau', status: 19, termin: '2026-03-15T00:00:00', verantwortlicher_id: 'firm-005', verantwortlicher_name: 'Mueller GmbH', bemerkung: 'Freigabe erteilt', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...mob } },
      { ...hubDefaults(), object_type: 'protokollelement', legacy_id: 'e-2-03', protokoll_id: 'prot-002a', position: '2.1', positionstitel: '', positionstext: 'Kabeltrasse Keller falsch montiert, Neuverlegung noetig.', thema: 'Mangel', status: 11, termin: '2026-03-10T00:00:00', verantwortlicher_id: 'firm-006', verantwortlicher_name: 'Elektro Schneider', bemerkung: '', erinnerung: false, wert: 800, verweise: [], mobile_erfassung: { ...mob } },
    ],
  },
];
