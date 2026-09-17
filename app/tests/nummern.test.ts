/**
 * Upload-Antwort `nummern` übernehmen (999.1750, Punkt 4).
 *
 * Der Hub vergibt einer offline angelegten Neuanlage die Nummer nach der Büro-Regel (nächste freie,
 * wenn die Gerätenummer belegt ist) und meldet sie unter `nummern` {Protokoll-Kennung wie gesendet
 * -> Hub-Nummer} (hub-server protokoll_sync.py @ 47b00099). Die App ersetzt ihre vorläufige Nummer
 * samt Nummer im Namen. Vorher ignorierte sie das Feld: das Gerät zeigte weiter seine eigene Nummer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nummerImNamen, planeNummern } from '../src/hubPaket.ts';
import { vertrag } from './fixtures/vertrag.ts';

test('Vertragsprobe: antwort.nummern macht aus der Gerätenummer 1 die Hub-Nummer 2, das versendete Protokoll bleibt', () => {
  const b = vertrag.bestand.protokolle[0];
  const neuId = vertrag.upload[0].Elemente[0].ProtokollId;
  const protokolle = [
    { id: b.HubId, hub_id: b.HubId, legacy_id: '', name: b.Name, nummer: 1 },
    { id: neuId, legacy_id: '', name: 'Baubesprechung 1 - 2026', nummer: 1 },
  ];
  const geaendert = planeNummern(protokolle, vertrag.antwort.nummern);
  assert.deepEqual(geaendert, [{ id: neuId, legacy_id: '', name: 'Baubesprechung 2 - 2026', nummer: 2 }]);
});

test('Kennung wie gesendet: lokale id, hub_id oder OID', () => {
  const protokolle = [
    { id: 'lokal-a', hub_id: 'hub-a', name: 'A 3', nummer: 3 },
    { id: 'lokal-b', legacy_id: 'OID-B', name: 'B', nummer: 4 },
    { id: 'uuid-c', name: 'Baubesprechung 5 - 2026', nummer: 5 },
  ];
  const geaendert = planeNummern(protokolle, { 'hub-a': 8, 'OID-B': 9, 'uuid-c': 7, 'unbekannt': 1, 'uuid-x': 'kein Wert' });
  assert.deepEqual(geaendert.map(p => [p.id, p.nummer, p.name]), [['lokal-a', 8, 'A 8'], ['lokal-b', 9, 'B'], ['uuid-c', 7, 'Baubesprechung 7 - 2026']]);
  assert.deepEqual(planeNummern(protokolle, {}), []);
  assert.deepEqual(planeNummern(protokolle, undefined), []);
});

test('Nummer im Namen nur ersetzen, wenn der Name genau die alte Nummer trägt', () => {
  assert.equal(nummerImNamen('Baubesprechung 3 - 2026', 3, 7), 'Baubesprechung 7 - 2026');
  assert.equal(nummerImNamen('Baubesprechung 3 – 2026', 3, 7), 'Baubesprechung 7 – 2026');
  assert.equal(nummerImNamen('Baubesprechung 3', 3, 7), 'Baubesprechung 7');
  assert.equal(nummerImNamen('Baubesprechung 2', 1, 2), 'Baubesprechung 2');
  assert.equal(nummerImNamen('Jour fixe Haus 12 - 2026', 3, 7), 'Jour fixe Haus 12 - 2026');
  assert.equal(nummerImNamen('Protokoll', 3, 7), 'Protokoll');
});

test('Verdrahtung: uploadZip übernimmt report.nummern (Vorder- und Hintergrund senden über uploadZip)', () => {
  const q = readFileSync(new URL('../src/syncService.ts', import.meta.url), 'utf8');
  const start = q.indexOf('export async function uploadZip(');
  const rumpf = q.slice(start, q.indexOf('\nexport ', start + 10));
  assert.match(rumpf, /await uebernehmeNummern\(report\.nummern\)/);
  const db = readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8');
  assert.match(db, /const geaendert = planeNummern\(/);
  assert.match(db, /for \(const p of geaendert\) await tx\.objectStore\('protokolle'\)\.put\(p\)/);
  assert.match(readFileSync(new URL('../src/uploadAblaufDb.ts', import.meta.url), 'utf8'), /upload:\s*uploadZip,/);
});
