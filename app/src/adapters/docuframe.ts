/**
 * Adapter-Layer: Hub-Format <-> DOCUframe-Format
 *
 * dfToHub(): DOCUframe-Export (PascalCase) -> Hub-konforme Objekte (snake_case, UUID)
 * hubToDf(): Hub-konforme Objekte -> DOCUframe-Import-Format (PascalCase)
 *
 * Der DOCUframe-Exchange bleibt unveraendert — dieser Adapter uebersetzt zwischen den Welten.
 */

import type { Protokollelement, MobileErfassung } from '../types';

// ============================================================
// Hub -> DOCUframe (fuer Upload/Export)
// ============================================================

interface DfElement {
  Id: string;
  ProtokollId: string;
  Position: string;
  Positionstitel: string;
  Positionstext: string;
  Thema: string;
  Status: number;
  Termin: string;
  VerantwortlicherOid: string;
  VerantwortlicherName: string;
  Bemerkung: string;
  Erinnerung: boolean;
  Wert: number;
  MobileErfassung: {
    GeoLat: number | null;
    GeoLon: number | null;
    GeoAccuracy: number | null;
    GeoText: string | null;
    GeoHeading: number | null;
    GeoAltitude: number | null;
    Fotos: Array<{ FileName: string; RelativePath: string; ZielPfad: string }>;
  };
  Notiz?: string;
  Info?: string;
}

interface DfExportPaket {
  ProtokollMeta: {
    Name: string;
    Nummer: number;
    Datum: string;
  };
  Elemente: DfElement[];
}

/**
 * Konvertiert Hub-konforme Elemente in DOCUframe-Import-Format.
 * Wird beim ZIP-Export verwendet — DOCUframe erwartet PascalCase.
 */
export function hubToDf(
  elemente: Protokollelement[],
  protokollMeta: { name: string; nummer: number; datum: string },
): DfExportPaket {
  const dfElemente: DfElement[] = elemente.map(elem => ({
    // DOCUframe nutzt die legacy_id als primaere ID
    // Fallback auf Hub-UUID wenn keine legacy_id vorhanden
    Id: elem.legacy_id || elem.id,
    ProtokollId: elem.protokoll_id,
    Position: elem.position,
    Positionstitel: elem.positionstitel,
    Positionstext: elem.positionstext,
    Thema: elem.thema,
    Status: elem.status,
    Termin: elem.termin,
    VerantwortlicherOid: elem.verantwortlicher_id || '',
    VerantwortlicherName: elem.verantwortlicher_name,
    Bemerkung: elem.bemerkung,
    Erinnerung: elem.erinnerung,
    Wert: elem.wert,
    MobileErfassung: mobileToDF(elem.mobile_erfassung),
    Notiz: elem.notiz,
    Info: elem.info,
  }));

  return {
    ProtokollMeta: {
      Name: protokollMeta.name,
      Nummer: protokollMeta.nummer,
      Datum: protokollMeta.datum,
    },
    Elemente: dfElemente,
  };
}

function mobileToDF(m: MobileErfassung) {
  return {
    GeoLat: m.geo_lat,
    GeoLon: m.geo_lon,
    GeoAccuracy: m.geo_accuracy,
    GeoText: m.geo_text,
    GeoHeading: m.geo_heading,
    GeoAltitude: m.geo_altitude,
    Fotos: (m.fotos || []).map(f => ({
      FileName: f.file_name,
      RelativePath: f.relative_path,
      ZielPfad: f.ziel_pfad,
    })),
  };
}

export type { DfElement, DfExportPaket };
