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
import {
  istVerteilt, neuanlageErlaubt, obersterPunkt, bearbeitbareFelderNachVersand, freieFelder, ALLE_PUNKTFELDER,
  aktuellesProtokoll, zielProtokollFuerNeuanlage, versandStatus,
} from '../src/protokollRegeln.ts';

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

// M1: ein Entwurf (is_new=true, vom Hub nicht als verteilt bestätigt, oft leer) belegt nicht,
// dass ein älteres Protokoll verteilt wurde — er zählt in der Ersatzregel nicht als höheres Protokoll.
test('gemischt: lokaler Entwurf (is_new=true, Nr. 5) macht Nr. 4 ohne is_new NICHT zum verteilten', () => {
  const nr4 = p('p4', 4);
  const entwurf = p('d5', 5, true);
  assert.equal(istVerteilt(nr4, [nr4, entwurf]), false);
  assert.equal(istVerteilt(entwurf, [nr4, entwurf]), false);
});

test('gemischt: Entwurf zählt nicht, ein höheres Serverprotokoll schon', () => {
  const nr3 = p('p3', 3);
  assert.equal(istVerteilt(nr3, [nr3, p('d9', 9, true)]), false);
  assert.equal(istVerteilt(nr3, [nr3, p('d9', 9, true), p('p4', 4)]), true);
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

// --- M1: Zielprotokoll für Neuer Punkt / Schnell ----------------------------------
// Handoff Abschnitt 3: „In ‚Gesamt' und im aktuellen Protokoll ist die Neuanlage möglich
// (Punkte landen im aktuellen Protokoll)"; aktuell = neuestes (höchste Nr.), nicht verteilt.

const nr3 = p('p3', 3);
const nr4 = p('p4', 4);
const bt = p('bt', -1);
const gruppe = [nr3, nr4, bt];

test('aktuelles Protokoll: höchstes nicht verteiltes, nie ein Anhang', () => {
  assert.equal(aktuellesProtokoll(gruppe)?.id, 'p4');
  assert.equal(aktuellesProtokoll([bt])?.id, undefined);
  assert.equal(aktuellesProtokoll([]), null);
});

test('aktuelles Protokoll: bestätigtes Serverprotokoll vor liegengebliebenem Entwurf', () => {
  assert.equal(aktuellesProtokoll([...gruppe, p('d5', 5, true)])?.id, 'p4');
});

test('aktuelles Protokoll: alle vom Hub als verteilt gemeldet -> offener Entwurf, sonst keines', () => {
  const importiert = [p('i1', 1, false), p('i2', 2, false), p('ibt', -1, false)];
  assert.equal(aktuellesProtokoll(importiert), null);
  assert.equal(aktuellesProtokoll([...importiert, p('d3', 3, true)])?.id, 'd3');
});

test('Ziel Neuanlage: Tab des aktuellen Protokolls -> dieses Protokoll, kein neuer Entwurf', () => {
  assert.equal(zielProtokollFuerNeuanlage('einzeln', nr4, gruppe)?.id, 'p4');
});

test('Ziel Neuanlage: Gesamt und Karte -> aktuelles Protokoll, auch wenn zuvor ein Anhang gewählt war', () => {
  assert.equal(zielProtokollFuerNeuanlage('alle', bt, gruppe)?.id, 'p4');
  assert.equal(zielProtokollFuerNeuanlage('karte', bt, gruppe)?.id, 'p4');
});

test('Ziel Neuanlage: Tab Bautagebuch/Anhang -> nie der Anhang, sondern das aktuelle Protokoll', () => {
  assert.equal(zielProtokollFuerNeuanlage('einzeln', bt, gruppe)?.id, 'p4');
});

test('Ziel Neuanlage: Tab eines offenen Entwurfs -> der Entwurf', () => {
  const d5 = p('d5', 5, true);
  assert.equal(zielProtokollFuerNeuanlage('einzeln', d5, [...gruppe, d5])?.id, 'd5');
});

// Z (Prüfwelle): ohne die Verteilt-Prüfung im Tab-Zweig blieb die Suite grün — die Oberfläche
// schützt zwar über neuanlageErlaubt, die Regel selbst muss aber auch allein stimmen.
test('Ziel Neuanlage: Tab eines verteilten Protokolls -> nie dieses, sondern das aktuelle', () => {
  assert.equal(zielProtokollFuerNeuanlage('einzeln', nr3, gruppe)?.id, 'p4');
});

test('Ziel Neuanlage: Tab eines vom Hub als verteilt gemeldeten Protokolls -> kein Ziel in diesem Protokoll', () => {
  const importiert = [p('i1', 1, false), p('i2', 2, false)];
  assert.equal(zielProtokollFuerNeuanlage('einzeln', importiert[1], importiert), null);
  const mitEntwurf = [...importiert, p('d3', 3, true)];
  assert.equal(zielProtokollFuerNeuanlage('einzeln', importiert[1], mitEntwurf)?.id, 'd3');
});

test('Ziel Neuanlage: kein offenes Protokoll -> null (Aufrufer bildet einen Entwurf erst beim Speichern)', () => {
  const importiert = [p('i1', 1, false), p('i2', 2, false), p('ibt', -1, false)];
  assert.equal(zielProtokollFuerNeuanlage('alle', importiert[1], importiert), null);
  assert.equal(zielProtokollFuerNeuanlage('einzeln', importiert[2], importiert), null);
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

// --- Felder nach dem Versand (Sperrregel des Hub) ---------------------------------
// Quelle ist die Hub-Zeile backend/app/services/protokoll_sperre.py:33
//   ALLOWED_ON_LOCKED = frozenset({"status", "positionstext"})
// angewandt im Sync-Upload (routers/protokoll_sync.py:708). EHRLICH: Dieser Test prüft nur
// die App-Konstante gegen den hier abgeschriebenen Stand — einen echten Abgleich mit dem
// Hub gibt es ohne Hub nicht; ändert der Hub seine Liste, bleibt dieser Test grün.

const sortiert = (xs: Iterable<string>) => [...xs].sort();

test('nach Versand: genau Status und Positionstext (App-Konstante, abgeschrieben aus protokoll_sperre.py:33)', () => {
  assert.deepEqual(sortiert(bearbeitbareFelderNachVersand()), ['positionstext', 'status']);
});

test('nach Versand: Verortung, Termin, Verantwortlich, Thema, Position, Titel, Bemerkung, Fotos gesperrt', () => {
  const frei = new Set<string>(bearbeitbareFelderNachVersand());
  for (const f of ['verortung', 'termin', 'verantwortlicher', 'thema', 'position', 'positionstitel', 'bemerkung', 'fotos']) {
    assert.equal(frei.has(f), false, f);
  }
});

test('freie Felder: verteiltes Protokoll -> nur die Hub-Liste, auch für lokal neue Punkte', () => {
  assert.deepEqual(sortiert(freieFelder(true, false)), ['positionstext', 'status']);
  assert.deepEqual(sortiert(freieFelder(true, true)), ['positionstext', 'status']);
});

test('freie Felder: Verteilt-Status unbekannt -> nichts frei', () => {
  assert.equal(freieFelder(null, true).size, 0);
  assert.equal(freieFelder(null, false).size, 0);
});

test('freie Felder: nicht verteilt, lokal neu -> alle Felder', () => {
  assert.deepEqual(sortiert(freieFelder(false, true)), sortiert(ALLE_PUNKTFELDER));
  assert.equal(ALLE_PUNKTFELDER.length, 10);
});

test('freie Felder: nicht verteilt, übernommener Punkt -> Status, Positionstext, Verortung', () => {
  assert.deepEqual(sortiert(freieFelder(false, false)), ['positionstext', 'status', 'verortung']);
});

test('oberster Punkt: Eingabeliste bleibt unverändert', () => {
  const punkte = [{ id: 'b', position: '2' }, { id: 'a', position: '1' }];
  obersterPunkt(punkte);
  assert.deepEqual(punkte.map((x) => x.id), ['b', 'a']);
});

// --- H1: Versand-Badge im Gruppen-Detail und Vorrang des Serverwerts ---------------

test('Versand-Badge: Anhang ohne Serverwert -> kein Badge (keine Ableitung aus Nummern)', () => {
  assert.equal(versandStatus(p('bt', -1), [p('p3', 3), p('p4', 4)]), null);
});

test('Versand-Badge: Serverwert gilt, auch für Anhänge', () => {
  assert.equal(versandStatus(p('bt', -1, false), []), 'verschickt');
  assert.equal(versandStatus(p('bt', -1, true), []), 'nicht verschickt');
});

test('Versand-Badge: reguläre Protokolle ohne Serverwert nach der Ersatzregel', () => {
  const g = [p('p3', 3), p('p4', 4), p('d5', 5, true)];
  assert.equal(versandStatus(g[0], g), 'verschickt');
  assert.equal(versandStatus(g[1], g), 'nicht verschickt');
  assert.equal(versandStatus(g[2], g), 'nicht verschickt');
});

test('Serverwert gilt allein: Nummern und Entwürfe ändern nichts, sobald is_new geliefert ist', () => {
  const alt = p('p3', 3, true);
  const neu = p('p4', 4, false);
  const g = [alt, neu, p('d9', 9, true)];
  assert.equal(istVerteilt(alt, g), false);
  assert.equal(istVerteilt(neu, g), true);
  assert.equal(istVerteilt(p('bt', -1, false), g), true);
});
