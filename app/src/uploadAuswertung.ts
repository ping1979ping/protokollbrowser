/**
 * Auswertung der Hub-Antwort auf den ZIP-Upload (H1, RULE-7: kein stiller Datenverlust).
 *
 * Antwortformat laut hub-server `backend/app/routers/protokoll_sync.py` (`upload_zip`):
 * Envelope `{ data: { status: "ok" | "duplicate", files, photos, written, skipped,
 * felder_abgelehnt, skipped_oids, term_remap } }`.
 * - `written`: angelegte/aktualisierte Punkte.
 * - `skipped` + `skipped_oids`: NEUE Punkte, die auf einem versendeten Protokoll nicht
 *   angelegt wurden (Kennung = gesendete Id/OID, sonst "?").
 * - `felder_abgelehnt`: Anzahl verworfener Feldänderungen an versendeten Protokollen —
 *   nur eine Zahl, der Hub nennt weder Punkt noch Feld.
 * - `status: "duplicate"`: dieselbe ZIP wurde schon verarbeitet, keine neue Auswertung.
 *
 * Änderungsmarken dürfen nur für Punkte gelöscht werden, deren Übernahme die Antwort
 * belegt. Reine Funktion; Tests: tests/uploadAuswertung.test.ts.
 */

export interface UploadBericht {
  status?: string;
  written?: number;
  skipped?: number;
  felder_abgelehnt?: number;
  skipped_oids?: string[];
  [k: string]: unknown;
}

export interface UploadAuswertung {
  /** Alles gesendete ist belegt übernommen — nur dann gilt der Upload als Erfolg. */
  vollstaendig: boolean;
  duplikat: boolean;
  antwortUnvollstaendig: boolean;
  gesendet: number;
  geschrieben: number;
  abgelehnteFelder: number;
  /** Ids der übersprungenen Punkte, die einem gesendeten Punkt zugeordnet werden konnten. */
  uebersprungen: string[];
  /** Kennungen aus `skipped_oids`, die keinem gesendeten Punkt entsprechen. */
  uebersprungenOhneZuordnung: string[];
  /** Gesendete Punkte, die der Hub weder als geschrieben noch als übersprungen meldet. */
  nichtVerarbeitet: number;
  /** Punkte, deren Änderungsmarken gelöscht werden dürfen. */
  markenLoeschen: string[];
}

/**
 * Meldungszeile für übersprungene neue Punkte, die keinem gesendeten Punkt zugeordnet werden
 * konnten. Der Hub überspringt neue Punkte auf versendeten Protokollen (s. o.); welche es sind,
 * lässt sich dann aus der Antwort nicht ablesen — das sagt die Zeile, statt Kennungen zu zeigen.
 */
export function textUebersprungenOhneZuordnung(anzahl: number): string {
  return anzahl === 1
    ? '1 neuer Punkt wurde vom Hub nicht angelegt, weil das Protokoll dort bereits versendet ist. Welcher Punkt es ist, geht aus der Antwort des Hub nicht hervor.'
    : `${anzahl} neue Punkte wurden vom Hub nicht angelegt, weil das Protokoll dort bereits versendet ist. Welche Punkte es sind, geht aus der Antwort des Hub nicht hervor.`;
}

export function werteUploadAus(
  bericht: UploadBericht,
  elemente: readonly { id: string; legacy_id?: string }[],
): UploadAuswertung {
  const ids = elemente.map(e => e.id);
  const basis: UploadAuswertung = {
    vollstaendig: false,
    duplikat: bericht.status === 'duplicate',
    antwortUnvollstaendig: false,
    gesendet: ids.length,
    geschrieben: 0,
    abgelehnteFelder: 0,
    uebersprungen: [],
    uebersprungenOhneZuordnung: [],
    nichtVerarbeitet: 0,
    markenLoeschen: [],
  };
  if (basis.duplikat) return basis;

  const { written, skipped, felder_abgelehnt } = bericht;
  if (typeof written !== 'number' || typeof skipped !== 'number' || typeof felder_abgelehnt !== 'number') {
    return { ...basis, antwortUnvollstaendig: true };
  }

  const uebersprungen: string[] = [];
  const ohneZuordnung: string[] = [];
  for (const oid of bericht.skipped_oids ?? []) {
    const treffer = elemente.find(e => e.id === oid || (!!e.legacy_id && e.legacy_id === oid));
    if (treffer) uebersprungen.push(treffer.id);
    else ohneZuordnung.push(oid);
  }
  const nichtVerarbeitet = Math.max(0, ids.length - written - skipped);
  const zugeordnet = uebersprungen.length + ohneZuordnung.length === skipped;

  // Marken nur löschen, wenn jede Abweichung einem Punkt zugeordnet ist: keine
  // abgelehnten Felder (ohne Punktangabe), nichts Unverarbeitetes, alle Skips benannt.
  const belegt = felder_abgelehnt === 0 && nichtVerarbeitet === 0 && ohneZuordnung.length === 0 && zugeordnet;
  const markenLoeschen = belegt ? ids.filter(id => !uebersprungen.includes(id)) : [];

  return {
    ...basis,
    geschrieben: written,
    abgelehnteFelder: felder_abgelehnt,
    uebersprungen,
    uebersprungenOhneZuordnung: ohneZuordnung,
    nichtVerarbeitet,
    markenLoeschen,
    vollstaendig: felder_abgelehnt === 0 && skipped === 0 && nichtVerarbeitet === 0,
  };
}
