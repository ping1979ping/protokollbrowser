// --- Hub-kompatible Types (ping-hub Boilerplate) ---

/** Hub-Basis: Jede Entitaet hat UUID, Timestamps, created_by */
export interface HubEntity {
  id: string;          // UUID4
  created_at: string;  // ISO datetime
  updated_at: string;  // ISO datetime
  created_by: string | null;
}

export interface Teilnehmer {
  oid: string;
  nummer: string;
  name: string;
  rolle: string;
}

export interface MobileErfassung {
  geo_lat: number | null;
  geo_lon: number | null;
  geo_accuracy: number | null;
  geo_text: string | null;
  geo_heading: number | null;
  geo_altitude: number | null;
  fotos: FotoRef[];
}

export interface FotoRef {
  file_name: string;
  relative_path: string;
  ziel_pfad: string;
}

export interface Protokollelement extends HubEntity {
  object_type: 'protokollelement';
  legacy_id: string;
  protokoll_id: string;
  position: string;
  positionstitel: string;
  positionstext: string;
  thema: string;
  status: number;
  termin: string;
  verantwortlicher_id: string | null;
  verantwortlicher_name: string;
  bemerkung: string;
  erinnerung: boolean;
  wert: number;
  verweise: string[];
  mobile_erfassung: MobileErfassung;
  foto_anzahl?: number;
  foto_pfad?: string;
  mobil_erfasst?: boolean;
  mobil_datum?: string;
  mobil_user?: string;
  notiz?: string;
  info?: string;
  is_modified?: boolean;
  is_new?: boolean;
}

export interface Protokoll extends HubEntity {
  object_type: 'protokoll';
  legacy_id: string;
  name: string;
  nummer: number;
  datum: string;
  ort: string;
  autor: string;
  vorbemerkung: string;
  nachbemerkung: string;
  erledigt: boolean;
  ist_einzelprotokoll: boolean;
  erstellt: boolean;
  signatur: string;
  teilnehmer: Teilnehmer[];
  verteiler: Teilnehmer[];
  is_new?: boolean;
}

export interface Protokollgruppe extends HubEntity {
  object_type: 'protokollgruppe';
  legacy_id: string;
  name: string;
  projekt_nummer: string;
  projekt_name: string;
  projekt_stammverzeichnis: string;
  protokollnummer: number;
  vorwort: string;
  nachwort: string;
  themen: string;
  bemerkung: string;
}

export interface ProtokollPaket {
  protokollgruppe: Protokollgruppe;
  protokoll: Protokoll;
  protokollelemente: Protokollelement[];
}

// --- Status ---

export const STATUS_MAP: Record<number, { label: string; farbe: string; css: string }> = {
  0:  { label: 'Neu',               farbe: 'grau', css: 'bg-gray-200 text-gray-800' },
  10: { label: 'Offen',             farbe: 'gelb', css: 'bg-yellow-200 text-yellow-800' },
  19: { label: 'Freigegeben',       farbe: 'blau', css: 'bg-blue-200 text-blue-800' },
  20: { label: 'Erledigt',          farbe: 'gruen', css: 'bg-green-200 text-green-800' },
  21: { label: 'Übertragen',        farbe: 'grau', css: 'bg-gray-300 text-gray-700' },
  11: { label: 'Mangel - offen',    farbe: 'rot', css: 'bg-red-200 text-red-800' },
  25: { label: 'Mangel - beseitigt',farbe: 'gruen', css: 'bg-green-200 text-green-800' },
  17: { label: 'Erledigt (Info)',   farbe: 'grau', css: 'bg-gray-200 text-gray-700' },
};

// --- Hub API Response Types ---

export interface ApiResponse<T> {
  data: T | null;
  meta: Record<string, unknown>;
  errors: Array<{ code: string; message: string; field?: string }>;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: { page: number; size: number; total: number; pages: number };
  errors: Array<{ code: string; message: string; field?: string }>;
}

// --- Helper: leere MobileErfassung ---
export function emptyMobileErfassung(): MobileErfassung {
  return {
    geo_lat: null,
    geo_lon: null,
    geo_accuracy: null,
    geo_text: null,
    geo_heading: null,
    geo_altitude: null,
    fotos: [],
  };
}

// --- Projekt (Nachschlage-Tabelle aus DOCUframe) ---

export interface Projekt extends HubEntity {
  object_type: 'projekt';
  legacy_id: string;
  nummer: string;
  bezeichnung: string;
  status: number;
  projektleiter_kuerzel: string;
  projektleiter_name: string;
  projektleiter_oid: string;
  raw_data: Record<string, unknown>;
}

// --- Adresse (Nachschlage-Tabelle aus DOCUframe) ---

export interface Adresse extends HubEntity {
  object_type: 'adresse';
  legacy_id: string;          // _oid aus DOCUframe
  klasse: string;             // Tatsaechliche Unterklasse: "Kunde", "Lieferant" etc.
  name1: string;              // Firma / Nachname
  name2: string;              // Vorname / Zusatz
  kuerzel: string;            // Kurzzeichen
  nummer: string;             // Adressnummer
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  telefon: string;
  email: string;
  raw_data: Record<string, unknown>;
}

// --- Ansprechpartner (Nachschlage-Tabelle aus DOCUframe) ---

export interface Ansprechpartner extends HubEntity {
  object_type: 'ansprechpartner';
  legacy_id: string;          // _oid aus DOCUframe
  parent_oid: string;         // OID der zugehoerigen Adresse
  parent_name: string;        // Name1 der Adresse
  name1: string;              // Nachname
  name2: string;              // Vorname
  kuerzel: string;            // Kurzzeichen
  nummer: string;             // Ansprechpartnernummer
  telefon: string;
  email: string;
  funktion: string;           // z.B. "Geschaeftsfuehrer", "Bauleiter"
  raw_data: Record<string, unknown>;
}

// --- Werteliste (DOCUframe Wertefeld-Aufloesung) ---

export interface WertelistenEintrag {
  wert: number;
  text: string;
}

export interface Werteliste {
  id: string;
  klasse: string;
  feld: string;
  eintraege: WertelistenEintrag[];
}
