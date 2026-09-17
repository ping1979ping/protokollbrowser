/**
 * Formfaktor (H2) und automatische Auswahl des obersten Punkts (Z1).
 *
 * H2: Mit `orientation: 'any'` im Manifest darf ein Telefon quer (z. B. 844×390) nicht
 * zum Tablet-Split werden. Tablet gilt nur, wenn die Breite ≥ 768 px UND die kürzere
 * Seite ≥ 600 px ist.
 * Z1: Der oberste Punkt wird nur im Tablet-Split (Tablet quer) automatisch aktiviert —
 * im Hochformat und auf dem Telefon nie (dort würde er die Liste verdrängen).
 *
 * Läuft über den Node-22-Builtin-Runner (`npm test`), bewusst außerhalb von src/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leiteFormFaktorAb, splitAnsicht, obersterPunktAutomatisch, tabletBeiDrehung, browserAufteilung } from '../src/hooks/formFaktor.ts';

test('Telefon hoch 390×844 -> Telefon, kein Split', () => {
  const ff = leiteFormFaktorAb(390, 844);
  assert.equal(ff.isTablet, false);
  assert.equal(splitAnsicht(ff), false);
});

test('Telefon quer 844×390 -> Telefon, kein Split (H2)', () => {
  const ff = leiteFormFaktorAb(844, 390);
  assert.equal(ff.isTablet, false);
  assert.equal(ff.orientation, 'quer');
  assert.equal(splitAnsicht(ff), false);
});

test('großes Telefon quer 932×430 -> Telefon, kein Split (H2)', () => {
  assert.equal(splitAnsicht(leiteFormFaktorAb(932, 430)), false);
});

test('Tablet quer 1194×834 -> Split', () => {
  const ff = leiteFormFaktorAb(1194, 834);
  assert.equal(ff.isTablet, true);
  assert.equal(splitAnsicht(ff), true);
});

test('Tablet hoch 834×1194 -> Tablet ohne Split', () => {
  const ff = leiteFormFaktorAb(834, 1194);
  assert.equal(ff.isTablet, true);
  assert.equal(ff.orientation, 'hoch');
  assert.equal(splitAnsicht(ff), false);
});

test('Grenzen: 768×600 ist Tablet, 768×599 nicht', () => {
  assert.equal(leiteFormFaktorAb(768, 600).isTablet, true);
  assert.equal(leiteFormFaktorAb(768, 599).isTablet, false);
  assert.equal(leiteFormFaktorAb(767, 1024).isTablet, false);
});

test('oberster Punkt automatisch: nur Tablet quer ohne aktiven Punkt', () => {
  assert.equal(obersterPunktAutomatisch(leiteFormFaktorAb(1194, 834), false), true);
  assert.equal(obersterPunktAutomatisch(leiteFormFaktorAb(1194, 834), true), false);
});

test('oberster Punkt automatisch: nie im Hochformat (Z1)', () => {
  assert.equal(obersterPunktAutomatisch(leiteFormFaktorAb(834, 1194), false), false);
});

test('oberster Punkt automatisch: nie auf dem Telefon, auch nicht quer (Z1, H2)', () => {
  assert.equal(obersterPunktAutomatisch(leiteFormFaktorAb(390, 844), false), false);
  assert.equal(obersterPunktAutomatisch(leiteFormFaktorAb(844, 390), false), false);
});

// B9: Drehen des Tablets mit geöffnetem Punkt darf weder den Punkt (samt ungespeicherter
// Eingabe) noch Suchfilter und Tab verlieren. Der Browser nutzt dafür auf dem Tablet in BEIDEN
// Lagen dieselben festen Plätze; nur die Aufteilung wechselt (Handoff tablet/README.md:22).

test('Tablet bei Drehung: dasselbe Gerät quer und hoch, auch wenn hoch schmaler als 768 px', () => {
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(1194, 834)), true);
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(834, 1194)), true);
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(744, 1133)), true, 'iPad mini hoch');
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(1133, 744)), true, 'iPad mini quer');
});

test('Tablet bei Drehung: Telefone nie, auch nicht quer', () => {
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(390, 844)), false);
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(844, 390)), false);
  assert.equal(tabletBeiDrehung(leiteFormFaktorAb(932, 430)), false);
});

test('Aufteilung quer: Liste und Detail je zur Hälfte, mit und ohne geöffneten Punkt', () => {
  const quer = leiteFormFaktorAb(1194, 834);
  assert.deepEqual(browserAufteilung(quer, true), { liste: 'halb', detail: 'halb' });
  assert.deepEqual(browserAufteilung(quer, false), { liste: 'halb', detail: 'halb' });
});

test('Aufteilung hoch: der geöffnete Punkt ersetzt die Liste, ohne Punkt nur die Liste', () => {
  const hoch = leiteFormFaktorAb(834, 1194);
  assert.deepEqual(browserAufteilung(hoch, true), { liste: null, detail: 'voll' });
  assert.deepEqual(browserAufteilung(hoch, false), { liste: 'voll', detail: null });
});
