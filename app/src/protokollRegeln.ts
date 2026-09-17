/**
 * Bearbeitungsregeln der Protokoll-App laut Tablet-Handoff
 * (docs/design_handoff/tablet/README.md, Abschnitt 3 „Bearbeitungs-Regeln").
 *
 * Maßgeblich für Bearbeiten und Neuanlage ist ausschließlich, ob das PROTOKOLL
 * bereits verteilt ist — nicht der Status oder das Sync-Flag einzelner Punkte.
 *
 * Reine Funktionen ohne DB- oder React-Bezug; Tests: tests/protokollRegeln.test.ts.
 */
import type { Protokoll, Protokollelement } from './types';

/** Mindestangaben eines Protokolls für die Verteilt-Entscheidung. */
export type VerteiltKern = Pick<Protokoll, 'id' | 'nummer'> & { is_new?: boolean | null };

/**
 * Ist das Protokoll bereits verteilt?
 *
 * 1. Liefert der Hub `is_new` als Wahrheitswert, entscheidet er (Hub ist die
 *    Quelle der Wahrheit): im Hub heißt verteilt/gesperrt `Protokoll.is_new === false`.
 *    Lokal angelegte Entwürfe tragen `is_new: true` und sind damit nie verteilt.
 * 2. Fehlt `is_new` (der heutige Sync-Export liefert das Feld nicht), gilt ersatzweise
 *    die Design-Regel: aktuell ist das Protokoll mit der höchsten Nummer der Gruppe,
 *    alle älteren gelten als verteilt. Anhänge (`nummer < 0`, z. B. Bautagebuch)
 *    laufen fortlaufend weiter und gelten nie als verteilt. Entwürfe (`is_new: true`,
 *    lokal angelegt oder leer) zählen dabei NICHT als höheres Protokoll: dass ein
 *    Entwurf existiert, belegt nicht, dass das vorige Protokoll verteilt wurde.
 *
 * @param gruppenProtokolle alle Protokolle derselben Gruppe (das Protokoll selbst darf fehlen)
 */
export function istVerteilt(protokoll: VerteiltKern, gruppenProtokolle: readonly VerteiltKern[] = []): boolean {
  if (typeof protokoll.is_new === 'boolean') return !protokoll.is_new;
  if (protokoll.nummer < 0) return false;
  let hoechste = protokoll.nummer;
  for (const p of gruppenProtokolle) {
    if (p.is_new === true) continue; // Entwurf: kein Beleg für eine Verteilung
    if (p.nummer > hoechste) hoechste = p.nummer;
  }
  return protokoll.nummer < hoechste;
}

/**
 * Das aktuelle Protokoll der Gruppe: das höchste nicht verteilte, nie ein Anhang.
 * Ein vom Hub bestätigtes Protokoll (ohne `is_new: true`) geht einem Entwurf vor;
 * ein Entwurf ist nur aktuell, wenn es sonst kein offenes Protokoll gibt.
 */
export function aktuellesProtokoll<T extends VerteiltKern>(protokolle: readonly T[]): T | null {
  const offen = protokolle
    .filter(p => p.nummer >= 0 && !istVerteilt(p, protokolle))
    .sort((a, b) => b.nummer - a.nummer);
  return offen.find(p => p.is_new !== true) ?? offen[0] ?? null;
}

/**
 * Zielprotokoll für „Neuer Punkt" und „Schnell" (nicht für den BT-Knopf, der schreibt
 * ins Bautagebuch). Handoff Abschnitt 3: Neuanlage im Tab des aktuellen Protokolls und
 * in „Gesamt"; die Punkte landen im aktuellen Protokoll.
 * - Tab eines offenen (nicht verteilten) regulären Protokolls: dieses Protokoll.
 * - sonst (Gesamt, Karte, Bautagebuch-/Anhang-Tab): das aktuelle Protokoll — nie ein Anhang.
 * - `null`, wenn es kein offenes Protokoll gibt: der Aufrufer bildet dann einen Entwurf,
 *   der erst beim Speichern des Punkts angelegt wird.
 */
export function zielProtokollFuerNeuanlage<T extends VerteiltKern>(
  ansicht: 'alle' | 'einzeln' | 'karte',
  aktiv: T | null | undefined,
  protokolle: readonly T[],
): T | null {
  if (ansicht === 'einzeln' && aktiv && aktiv.nummer >= 0 && !istVerteilt(aktiv, protokolle)) return aktiv;
  return aktuellesProtokoll(protokolle);
}

/**
 * Dürfen im aktuellen Browser-Tab neue Punkte angelegt werden (Neuer Punkt, Schnell, BT)?
 * Gesperrt nur im Tab eines verteilten Protokolls; in „Gesamt" und „Karte" bleibt die
 * Neuanlage möglich.
 */
export function neuanlageErlaubt(
  ansicht: 'alle' | 'einzeln' | 'karte',
  aktivesProtokoll: VerteiltKern | null | undefined,
  gruppenProtokolle: readonly VerteiltKern[],
): boolean {
  if (ansicht !== 'einzeln' || !aktivesProtokoll) return true;
  return !istVerteilt(aktivesProtokoll, gruppenProtokolle);
}

/** Oberster Punkt einer Liste (numerische Positionsfolge) oder `null` ohne Punkte. */
export function obersterPunkt<T extends Pick<Protokollelement, 'position'>>(punkte: readonly T[]): T | null {
  if (punkte.length === 0) return null;
  return [...punkte].sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true }))[0];
}

/** Bearbeitbare Bereiche im Punkt-Detail. `verortung` = GPS/Karte, `fotos` = Kamera/Galerie. */
export type PunktFeld =
  | 'status' | 'positionstext' | 'termin' | 'verantwortlicher' | 'thema'
  | 'position' | 'positionstitel' | 'bemerkung' | 'verortung' | 'fotos';

export const ALLE_PUNKTFELDER: readonly PunktFeld[] = [
  'status', 'positionstext', 'termin', 'verantwortlicher', 'thema',
  'position', 'positionstitel', 'bemerkung', 'verortung', 'fotos',
];

/**
 * Felder, die der Hub an einem Punkt eines versendeten Protokolls über den
 * Sync-Upload der App noch annimmt — Spiegel von `ALLOWED_ON_LOCKED` in
 * hub-server `backend/app/services/protokoll_sperre.py` (E7a Statuswanderung,
 * E7b Schreibfehler-Korrektur), angewandt in `routers/protokoll_sync.py`.
 *
 * Die Verortung (`GEO_FELDER`) erlaubt der Hub auf versendeten Protokollen nur
 * über die eigene Handlung `POST /api/protokoll-elemente/{id}/verorten`; der
 * Sync-Upload verwirft `mobile_erfassung` dort. Solange die App diesen Weg nicht
 * nutzt, bliebe eine Verortung in der App ohne Wirkung — sie steht deshalb
 * nicht in der Liste.
 */
const FELDER_NACH_VERSAND: readonly PunktFeld[] = ['status', 'positionstext'];

export function bearbeitbareFelderNachVersand(): readonly PunktFeld[] {
  return FELDER_NACH_VERSAND;
}

/**
 * Welche Bereiche eines Punkts sind frei?
 * - Verteilt-Status unbekannt (`null`): nichts, bis entschieden ist.
 * - Protokoll verteilt: nur die Felder nach dem Versand (Hub-Regel), auch für lokal neue Punkte.
 * - Protokoll nicht verteilt, lokal neu erfasster Punkt: alles.
 * - Protokoll nicht verteilt, übernommener Punkt: Status, Positionstext (Hub-Regel gilt
 *   ohnehin) und Verortung — Inhaltsfelder bleiben wie bisher unverändert.
 */
export function freieFelder(verteilt: boolean | null, lokalNeu: boolean): ReadonlySet<PunktFeld> {
  if (verteilt === null) return new Set();
  if (verteilt) return new Set(bearbeitbareFelderNachVersand());
  if (lokalNeu) return new Set(ALLE_PUNKTFELDER);
  return new Set<PunktFeld>(['status', 'positionstext', 'verortung']);
}

