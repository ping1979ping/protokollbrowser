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
 *    laufen fortlaufend weiter und gelten nie als verteilt.
 *
 * @param gruppenProtokolle alle Protokolle derselben Gruppe (das Protokoll selbst darf fehlen)
 */
export function istVerteilt(protokoll: VerteiltKern, gruppenProtokolle: readonly VerteiltKern[] = []): boolean {
  if (typeof protokoll.is_new === 'boolean') return !protokoll.is_new;
  if (protokoll.nummer < 0) return false;
  let hoechste = protokoll.nummer;
  for (const p of gruppenProtokolle) {
    if (p.nummer > hoechste) hoechste = p.nummer;
  }
  return protokoll.nummer < hoechste;
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
