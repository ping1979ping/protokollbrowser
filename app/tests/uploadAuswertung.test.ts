/**
 * Auswertung der Hub-Antwort auf den ZIP-Upload (H1, RULE-7: kein stiller Datenverlust).
 *
 * Antwortformat laut hub-server backend/app/routers/protokoll_sync.py (upload_zip,
 * Rückgabe am Ende der Funktion bzw. im Duplikat-Zweig): Envelope { data: { status:
 * "ok"|"duplicate", files, photos, written, skipped, felder_abgelehnt, skipped_oids,
 * term_remap } }. `felder_abgelehnt` ist nur eine ZAHL — der Hub nennt weder Punkt noch
 * Feld; `skipped_oids` nennt die übersprungenen NEUEN Punkte (Id/OID oder "?").
 *
 * Läuft über den Node-22-Builtin-Runner (`npm test`), bewusst außerhalb von src/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { werteUploadAus } from '../src/uploadAuswertung.ts';

const elemente = [
  { id: 'e1', legacy_id: 'L1' },
  { id: 'e2', legacy_id: '' },
  { id: 'e3', legacy_id: '' },
];

test('vollständig angenommen: alle geschrieben, nichts abgelehnt -> Erfolg, alle Marken löschen', () => {
  const a = werteUploadAus({ status: 'ok', written: 3, skipped: 0, felder_abgelehnt: 0, skipped_oids: [] }, elemente);
  assert.equal(a.vollstaendig, true);
  assert.deepEqual(a.markenLoeschen, ['e1', 'e2', 'e3']);
});

test('abgelehnte Felder: kein Erfolg, alle Marken bleiben (der Hub nennt die Punkte nicht)', () => {
  const a = werteUploadAus({ status: 'ok', written: 3, skipped: 0, felder_abgelehnt: 2, skipped_oids: [] }, elemente);
  assert.equal(a.vollstaendig, false);
  assert.equal(a.abgelehnteFelder, 2);
  assert.deepEqual(a.markenLoeschen, []);
});

test('übersprungene neue Punkte: benannt, deren Marken bleiben, die übrigen werden gelöscht', () => {
  const a = werteUploadAus({ status: 'ok', written: 2, skipped: 1, felder_abgelehnt: 0, skipped_oids: ['e3'] }, elemente);
  assert.equal(a.vollstaendig, false);
  assert.deepEqual(a.uebersprungen, ['e3']);
  assert.deepEqual(a.markenLoeschen, ['e1', 'e2']);
});

test('übersprungene Punkte auch über die legacy_id zuordenbar', () => {
  const a = werteUploadAus({ status: 'ok', written: 2, skipped: 1, felder_abgelehnt: 0, skipped_oids: ['L1'] }, elemente);
  assert.deepEqual(a.uebersprungen, ['e1']);
  assert.deepEqual(a.markenLoeschen, ['e2', 'e3']);
});

test('übersprungen ohne zuordenbare Kennung ("?") -> keine Marke löschen', () => {
  const a = werteUploadAus({ status: 'ok', written: 2, skipped: 1, felder_abgelehnt: 0, skipped_oids: ['?'] }, elemente);
  assert.deepEqual(a.uebersprungenOhneZuordnung, ['?']);
  assert.deepEqual(a.markenLoeschen, []);
});

test('weniger geschrieben als gesendet (nicht verarbeitet) -> kein Erfolg, Marken bleiben', () => {
  const a = werteUploadAus({ status: 'ok', written: 0, skipped: 0, felder_abgelehnt: 0, skipped_oids: [] }, elemente);
  assert.equal(a.vollstaendig, false);
  assert.equal(a.nichtVerarbeitet, 3);
  assert.deepEqual(a.markenLoeschen, []);
});

test('Duplikat: keine neue Auswertung -> kein Erfolg, Marken bleiben', () => {
  const a = werteUploadAus({ status: 'duplicate', written: 0, skipped: 0, felder_abgelehnt: 0, skipped_oids: [] }, elemente);
  assert.equal(a.duplikat, true);
  assert.equal(a.vollstaendig, false);
  assert.deepEqual(a.markenLoeschen, []);
});

test('Antwort ohne Zähler -> keine Aussage, Marken bleiben', () => {
  const a = werteUploadAus({}, elemente);
  assert.equal(a.antwortUnvollstaendig, true);
  assert.equal(a.vollstaendig, false);
  assert.deepEqual(a.markenLoeschen, []);
});
