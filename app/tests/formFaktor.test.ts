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
import { leiteFormFaktorAb, splitAnsicht, obersterPunktAutomatisch } from '../src/hooks/formFaktor.ts';

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
