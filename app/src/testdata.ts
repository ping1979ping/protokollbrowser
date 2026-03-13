import type { ProtokollPaket } from './types';

const mob = { GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoText: null, Fotos: [] };

export const testDaten: ProtokollPaket[] = [
  // === Projekt 1: B123 Ausbau Musterstrasse — Protokoll 4 ===
  {
    Protokollgruppe: {
      Id: 'grp-001', Name: 'Baustellennotiz', ProjektId: 'PR-4711',
      ProjektName: 'B123 Ausbau Musterstrasse',
      ProjektStammverzeichnis: '\\\\Server\\Projekte\\B123_Musterstrasse\\',
      Protokollnummer: 5, Vorwort: '', Nachwort: '', Themen: 'Tiefbau, Mängel', Bemerkung: '',
    },
    Protokoll: {
      Id: 'prot-001a', Name: 'Baustellennotiz 4', Nummer: 4,
      Datum: '2026-02-23T09:00:00', Ort: 'Baustelle Musterstrasse', Autor: 'Max Mustermann',
      Vorbemerkung: '', Nachbemerkung: '', Erledigt: true,
      IstEinzelprotokoll: false, Erstellt: true, Signatur: '',
      Teilnehmer: [
        { Oid: 'adr-010', Nummer: '10010', Name: 'GSD Software mbH', Rolle: 'AG' },
        { Oid: 'adr-011', Nummer: '50001', Name: 'Adler Anton', Rolle: 'BL' },
        { Oid: 'adr-012', Nummer: '50002', Name: 'Bauer Bernd', Rolle: 'AN' },
      ],
      Verteiler: [
        { Oid: 'adr-011', Nummer: '50001', Name: 'Adler Anton', Rolle: '' },
        { Oid: 'adr-013', Nummer: '50003', Name: 'Fischer Fritz', Rolle: '' },
      ],
    },
    Protokollelemente: [
      { Id: 'e-4-01', ProtokollId: 'prot-001a', Position: '1.1', Positionstitel: 'Baugrubensicherung Achse A', Positionstext: 'Verbau kontrollieren', Thema: 'Tiefbau', Status: 20, Termin: '2026-02-28T00:00:00', VerantwortlicherFirmaOid: 'firm-001', VerantwortlicherFirmaName: 'Ingenieurbüro Adler', Bemerkung: 'Erledigt', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-4-02', ProtokollId: 'prot-001a', Position: '1.2', Positionstitel: 'Wasserhaltung prüfen', Positionstext: 'Pumpensumpf und Abfluss kontrollieren', Thema: 'Tiefbau', Status: 20, Termin: '2026-02-28T00:00:00', VerantwortlicherFirmaOid: 'firm-002', VerantwortlicherFirmaName: 'Bauer Bau GmbH', Bemerkung: 'OK', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-4-03', ProtokollId: 'prot-001a', Position: '2.1', Positionstitel: 'Fehlende Absturzsicherung', Positionstext: 'Geländer an Treppe Gebäude B fehlt', Thema: 'Mangel', Status: 25, Termin: '2026-03-05T00:00:00', VerantwortlicherFirmaOid: 'firm-003', VerantwortlicherFirmaName: 'GSD Software mbH', Bemerkung: 'Geländer montiert', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
    ],
  },
  // === Projekt 1: B123 Ausbau Musterstrasse — Protokoll 5 ===
  {
    Protokollgruppe: {
      Id: 'grp-001', Name: 'Baustellennotiz', ProjektId: 'PR-4711',
      ProjektName: 'B123 Ausbau Musterstrasse',
      ProjektStammverzeichnis: '\\\\Server\\Projekte\\B123_Musterstrasse\\',
      Protokollnummer: 5, Vorwort: 'Protokoll der 5. Baustellenbegehung.', Nachwort: 'Nächster Termin: 23.03.2026', Themen: 'Tiefbau, Mängel, Restarbeiten', Bemerkung: '',
    },
    Protokoll: {
      Id: 'prot-001b', Name: 'Baustellennotiz 5', Nummer: 5,
      Datum: '2026-03-09T09:00:00', Ort: 'Baustelle Musterstrasse', Autor: 'Max Mustermann',
      Vorbemerkung: '', Nachbemerkung: '', Erledigt: false,
      IstEinzelprotokoll: false, Erstellt: true, Signatur: '',
      Teilnehmer: [
        { Oid: 'adr-010', Nummer: '10010', Name: 'GSD Software mbH', Rolle: 'AG' },
        { Oid: 'adr-011', Nummer: '50001', Name: 'Adler Anton', Rolle: 'BL' },
        { Oid: 'adr-012', Nummer: '50002', Name: 'Bauer Bernd', Rolle: 'AN' },
      ],
      Verteiler: [
        { Oid: 'adr-011', Nummer: '50001', Name: 'Adler Anton', Rolle: '' },
        { Oid: 'adr-013', Nummer: '50003', Name: 'Fischer Fritz', Rolle: '' },
      ],
    },
    Protokollelemente: [
      { Id: 'e-5-01', ProtokollId: 'prot-001b', Position: '1.1', Positionstitel: '', Positionstext: 'Trasse herstellen, Bodenaushub und Leitungsverlegung gemäß Plan. Abschnitt 1+00 bis 1+50.', Thema: 'Tiefbau', Status: 10, Termin: '2026-03-16T00:00:00', VerantwortlicherFirmaOid: 'firm-001', VerantwortlicherFirmaName: 'Ingenieurbüro Adler', Bemerkung: '', Erinnerung: false, Wert: 0, Verweise: ['e-4-01'], MobileErfassung: { ...mob } },
      { Id: 'e-5-02', ProtokollId: 'prot-001b', Position: '1.2', Positionstitel: '', Positionstext: 'Verdichtungsprüfung nach Verfüllung durchführen.', Thema: 'Tiefbau', Status: 0, Termin: '2026-03-20T00:00:00', VerantwortlicherFirmaOid: 'firm-002', VerantwortlicherFirmaName: 'Bauer Bau GmbH', Bemerkung: '', Erinnerung: true, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-5-03', ProtokollId: 'prot-001b', Position: '2.1', Positionstitel: '', Positionstext: 'Schachtabdeckung nicht bündig Achse 1+35, Austausch erforderlich.', Thema: 'Mangel', Status: 11, Termin: '2026-03-18T00:00:00', VerantwortlicherFirmaOid: 'firm-003', VerantwortlicherFirmaName: 'GSD Software mbH', Bemerkung: 'Erstmals festgestellt am 09.03.2026', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-5-04', ProtokollId: 'prot-001b', Position: '2.2', Positionstitel: '', Positionstext: 'Haarriss in Bodenplatte Gebäude C, ca. 2m Länge. Gutachter hinzuziehen.', Thema: 'Mangel', Status: 11, Termin: '2026-03-25T00:00:00', VerantwortlicherFirmaOid: 'firm-002', VerantwortlicherFirmaName: 'Bauer Bau GmbH', Bemerkung: '', Erinnerung: true, Wert: 2500.0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-5-05', ProtokollId: 'prot-001b', Position: '3.1', Positionstitel: '', Positionstext: 'Absperrungen und Beschilderung kontrollieren.', Thema: 'Allgemein', Status: 20, Termin: '2026-03-10T00:00:00', VerantwortlicherFirmaOid: 'firm-001', VerantwortlicherFirmaName: 'Ingenieurbüro Adler', Bemerkung: 'Erledigt - alles in Ordnung.', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob, GeoLat: 50.3245, GeoLon: 11.285, GeoAccuracy: 5, GeoText: '50.3245, 11.285 (5 m)' } },
      { Id: 'e-5-06', ProtokollId: 'prot-001b', Position: '3.2', Positionstitel: '', Positionstext: 'Sicherheitsunterweisung für 3 neue MA der Fa. Bauer durchführen.', Thema: 'Info', Status: 17, Termin: '2026-03-09T00:00:00', VerantwortlicherFirmaOid: 'firm-003', VerantwortlicherFirmaName: 'GSD Software mbH', Bemerkung: 'Durchgeführt am 09.03.', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
    ],
  },
  // === Projekt 2: K45 Sanierung Hauptstrasse — Protokoll 2 ===
  {
    Protokollgruppe: {
      Id: 'grp-002', Name: 'Jour fixe', ProjektId: 'PR-8820',
      ProjektName: 'K45 Sanierung Hauptstrasse',
      ProjektStammverzeichnis: '\\\\Server\\Projekte\\K45_Hauptstrasse\\',
      Protokollnummer: 2, Vorwort: '', Nachwort: '', Themen: 'Hochbau, Elektro', Bemerkung: '',
    },
    Protokoll: {
      Id: 'prot-002a', Name: 'Jour fixe 2', Nummer: 2,
      Datum: '2026-03-05T14:00:00', Ort: 'Baubüro Hauptstrasse 12', Autor: 'Sabine Schmidt',
      Vorbemerkung: '', Nachbemerkung: '', Erledigt: false,
      IstEinzelprotokoll: false, Erstellt: true, Signatur: '',
      Teilnehmer: [
        { Oid: 'adr-020', Nummer: '20001', Name: 'Müller GmbH', Rolle: 'AG' },
        { Oid: 'adr-021', Nummer: '20002', Name: 'Weber Klaus', Rolle: 'BL' },
        { Oid: 'adr-022', Nummer: '20003', Name: 'Schneider Eva', Rolle: 'Elektro' },
      ],
      Verteiler: [
        { Oid: 'adr-021', Nummer: '20002', Name: 'Weber Klaus', Rolle: '' },
      ],
    },
    Protokollelemente: [
      { Id: 'e-2-01', ProtokollId: 'prot-002a', Position: '1.1', Positionstitel: '', Positionstext: 'Fenster EG einbauen und abdichten.', Thema: 'Hochbau', Status: 10, Termin: '2026-03-12T00:00:00', VerantwortlicherFirmaOid: 'firm-004', VerantwortlicherFirmaName: 'Bauunternehmung Weber', Bemerkung: '', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-2-02', ProtokollId: 'prot-002a', Position: '1.2', Positionstitel: '', Positionstext: 'Estrich im OG einbringen, Trocknungszeit beachten.', Thema: 'Hochbau', Status: 19, Termin: '2026-03-15T00:00:00', VerantwortlicherFirmaOid: 'firm-005', VerantwortlicherFirmaName: 'Müller GmbH', Bemerkung: 'Freigabe erteilt', Erinnerung: false, Wert: 0, Verweise: [], MobileErfassung: { ...mob } },
      { Id: 'e-2-03', ProtokollId: 'prot-002a', Position: '2.1', Positionstitel: '', Positionstext: 'Kabeltrasse Keller falsch montiert, Neuverlegung nötig.', Thema: 'Mangel', Status: 11, Termin: '2026-03-10T00:00:00', VerantwortlicherFirmaOid: 'firm-006', VerantwortlicherFirmaName: 'Elektro Schneider', Bemerkung: '', Erinnerung: false, Wert: 800, Verweise: [], MobileErfassung: { ...mob } },
    ],
  },
];
