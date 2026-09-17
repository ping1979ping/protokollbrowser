/**
 * Bearbeitungsregeln laut Tablet-Handoff (docs/design_handoff/tablet/README.md,
 * Abschnitt 3): „Maßgeblich ist ausschließlich, ob das Protokoll bereits verteilt ist".
 *
 * Zwei Wege, beide hier geprüft:
 *  1. Der Hub liefert `is_new` als Wahrheitswert -> er entscheidet (verteilt = is_new === false).
 *  2. Fehlt `is_new` (heutiger Export) -> Ersatzregel aus dem Design: das Protokoll mit
 *     der höchsten Nummer der Gruppe ist aktuell, alle älteren gelten als verteilt.
 *     Anhänge (nummer < 0, z. B. Bautagebuch) laufen fortlaufend und sind nie verteilt.
 *
 * Läuft über den Node-22-Builtin-Runner (`npm test`), bewusst außerhalb von src/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { istVerteilt, neuanlageErlaubt, obersterPunkt } from '../src/protokollRegeln.ts';

const p = (id: string, nummer: number, is_new?: boolean | null) => ({ id, nummer, is_new });

// --- Weg 1: Hub liefert is_new -------------------------------------------------

test('Hub: is_new=false -> verteilt, auch wenn es die höchste Nummer trägt', () => {
  const nr4 = p('p4', 4, false);
  assert.equal(istVerteilt(nr4, [p('p3', 3, false), nr4]), true);
});

test('Hub: is_new=true -> nicht verteilt, auch wenn eine höhere Nummer existiert', () => {
  const nr3 = p('p3', 3, true);
  assert.equal(istVerteilt(nr3, [nr3, p('p4', 4)]), false);
});

test('Hub: is_new=false schlägt die Anhang-Ausnahme (Hub ist Quelle der Wahrheit)', () => {
  assert.equal(istVerteilt(p('bt', -1, false), []), true);
});

// --- Weg 2: is_new fehlt -> höchste Nummer -------------------------------------

test('Ersatz: höchste Nummer der Gruppe -> nicht verteilt', () => {
  const nr4 = p('p4', 4);
  assert.equal(istVerteilt(nr4, [p('p3', 3), nr4, p('p2', 2)]), false);
});

test('Ersatz: ältere Nummer -> verteilt', () => {
  const nr3 = p('p3', 3);
  assert.equal(istVerteilt(nr3, [nr3, p('p4', 4)]), true);
});

test('Ersatz: is_new=null zählt wie fehlend', () => {
  assert.equal(istVerteilt(p('p3', 3, null), [p('p4', 4, null)]), true);
});

test('Ersatz: einziges Protokoll der Gruppe (leere Geschwisterliste) -> nicht verteilt', () => {
  assert.equal(istVerteilt(p('p1', 1), []), false);
});

test('Ersatz: Geschwisterliste ohne das Protokoll selbst, es ist aber das höchste -> nicht verteilt', () => {
  assert.equal(istVerteilt(p('p5', 5), [p('p3', 3), p('p4', 4)]), false);
});

test('Ersatz: Anhang (nummer < 0) ist nie verteilt', () => {
  assert.equal(istVerteilt(p('bt', -1), [p('p3', 3), p('p4', 4)]), false);
});

test('Ersatz: gleiche höchste Nummer (Dublette) -> beide nicht verteilt', () => {
  const a = p('a', 4);
  const b = p('b', 4);
  assert.equal(istVerteilt(a, [a, b]), false);
  assert.equal(istVerteilt(b, [a, b]), false);
});

test('gemischt: lokaler Entwurf (is_new=true, Nr. 5) macht Nr. 4 ohne is_new zum verteilten', () => {
  const nr4 = p('p4', 4);
  const entwurf = p('d5', 5, true);
  assert.equal(istVerteilt(nr4, [nr4, entwurf]), true);
  assert.equal(istVerteilt(entwurf, [nr4, entwurf]), false);
});

test('Anhänge heben die höchste Nummer nicht an', () => {
  const nr0 = p('p0', 0);
  assert.equal(istVerteilt(nr0, [nr0, p('bt', -1)]), false);
});

// --- Neuanlage im Tab ------------------------------------------------------------

test('Neuanlage: Tab eines verteilten Protokolls -> gesperrt', () => {
  const alle = [p('p3', 3), p('p4', 4)];
  assert.equal(neuanlageErlaubt('einzeln', alle[0], alle), false);
});

test('Neuanlage: Tab des aktuellen Protokolls -> erlaubt', () => {
  const alle = [p('p3', 3), p('p4', 4)];
  assert.equal(neuanlageErlaubt('einzeln', alle[1], alle), true);
});

test('Neuanlage: Gesamt und Karte -> erlaubt, auch wenn das gewählte Protokoll verteilt ist', () => {
  const alle = [p('p3', 3), p('p4', 4)];
  assert.equal(neuanlageErlaubt('alle', alle[0], alle), true);
  assert.equal(neuanlageErlaubt('karte', alle[0], alle), true);
});

test('Neuanlage: kein Protokoll gewählt -> erlaubt (keine Sperre ohne Grundlage)', () => {
  assert.equal(neuanlageErlaubt('einzeln', null, []), true);
});

// --- Oberster Punkt (Tablet quer: beim Öffnen aktivieren) ------------------------

test('oberster Punkt: keine Punkte -> null (nur die Liste öffnet)', () => {
  assert.equal(obersterPunkt([]), null);
});

test('oberster Punkt: numerisch sortiert (4.2 vor 4.10)', () => {
  const punkte = [{ id: 'c', position: '4.10' }, { id: 'b', position: '4.2' }, { id: 'a', position: '4.1' }];
  assert.equal(obersterPunkt(punkte)?.id, 'a');
  assert.equal(obersterPunkt(punkte.slice(0, 2))?.id, 'b');
});

test('oberster Punkt: Eingabeliste bleibt unverändert', () => {
  const punkte = [{ id: 'b', position: '2' }, { id: 'a', position: '1' }];
  obersterPunkt(punkte);
  assert.deepEqual(punkte.map((x) => x.id), ['b', 'a']);
});
