// --- DOCUframe JSON Types ---

export interface Teilnehmer {
  Oid: string;
  Nummer: string;
  Name: string;
  Rolle: string;
}

export interface MobileErfassung {
  GeoLat: number | null;
  GeoLon: number | null;
  GeoAccuracy: number | null;
  GeoText: string | null;
  Fotos: FotoRef[];
}

export interface FotoRef {
  FileName: string;
  RelativePath: string;
  ZielPfad: string;
}

export interface Protokollelement {
  Id: string;
  ProtokollId: string;
  Position: string;
  Positionstitel: string;
  Positionstext: string;
  Thema: string;
  Status: number;
  Termin: string;
  VerantwortlicherOid: string;
  VerantwortlicherId: string;
  VerantwortlicherName: string;
  Bemerkung: string;
  Erinnerung: boolean;
  Wert: number;
  Verweise: string[]; // OIDs von verknüpften Vorgänger-Elementen
  MobileErfassung: MobileErfassung;
  // App-intern
  _geaendert?: boolean;
  _neu?: boolean;
}

export interface Protokoll {
  Id: string;
  Name: string;
  Nummer: number;
  Datum: string;
  Ort: string;
  Autor: string;
  Vorbemerkung: string;
  Nachbemerkung: string;
  Erledigt: boolean;
  IstEinzelprotokoll: boolean;
  Erstellt: boolean;
  Signatur: string;
  Teilnehmer: Teilnehmer[];
  Verteiler: Teilnehmer[];
}

export interface Protokollgruppe {
  Id: string;
  Name: string;
  ProjektId: string;
  ProjektName: string;
  ProjektStammverzeichnis: string;
  Protokollnummer: number;
  Vorwort: string;
  Nachwort: string;
  Themen: string;
  Bemerkung: string;
}

export interface ProtokollPaket {
  Protokollgruppe: Protokollgruppe;
  Protokoll: Protokoll;
  Protokollelemente: Protokollelement[];
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
