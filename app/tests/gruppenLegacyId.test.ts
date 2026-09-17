/**
 * Test der reinen Fallback-Kette waehleGruppenKennung (06.3-Review IN-04, 999.1750).
 * Laeuft ueber den Node-22-Builtin-Runner: `node --test app/tests/gruppenLegacyId.test.ts`
 * (Type-Stripping ab Node 22.18 default). Bewusst AUSSERHALB src/ — kein Vitest im PWA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waehleGruppenKennung } from '../src/gruppenLegacyId.ts';

test('PK-Treffer mit legacy_id -> dessen legacy_id', () => {
  assert.equal(
    waehleGruppenKennung('uuid-1', { id: 'uuid-1', legacy_id: '1CY6CY' }, []),
    '1CY6CY',
  );
});

test('kein PK-Treffer, Fallback-Treffer (id===projectId) -> dessen legacy_id', () => {
  assert.equal(
    waehleGruppenKennung('uuid-2', null, [
      { id: 'uuid-x', legacy_id: 'AAA' },
      { id: 'uuid-2', legacy_id: 'BBB' },
    ]),
    'BBB',
  );
});

test('kein Treffer -> Passthrough (projectId ist bereits legacy_id, ServerImport)', () => {
  assert.equal(
    waehleGruppenKennung('1CY6CY', undefined, [{ id: 'uuid-y', legacy_id: 'CCC' }]),
    '1CY6CY',
  );
});

test('PK-Treffer ohne legacy_id -> Fallback greift', () => {
  assert.equal(
    waehleGruppenKennung('uuid-3', { id: 'uuid-3', legacy_id: '' }, [
      { id: 'uuid-3', legacy_id: 'DDD' },
    ]),
    'DDD',
  );
});

test('PK-Treffer null + leerer Katalog -> Passthrough', () => {
  assert.equal(waehleGruppenKennung('OID-42', null, []), 'OID-42');
});

// --- 999.1750: Hub-UUID vor OID ---------------------------------------------

test('Hub-Gruppe ohne OID (nur hub_id) -> Hub-UUID statt lokaler UUID', () => {
  const g = { id: 'lokal-g', legacy_id: '', hub_id: 'be831e46-592c-434e-934c-b4ae747e0c54' };
  assert.equal(waehleGruppenKennung('lokal-g', g, [g]), 'be831e46-592c-434e-934c-b4ae747e0c54');
  assert.equal(waehleGruppenKennung('lokal-g', null, [g]), 'be831e46-592c-434e-934c-b4ae747e0c54');
});

test('Gruppe mit OID und Hub-UUID -> Hub-UUID geht vor', () => {
  const g = { id: 'lokal-g', legacy_id: '10PFGT', hub_id: 'hub-uuid-1' };
  assert.equal(waehleGruppenKennung('lokal-g', g, [g]), 'hub-uuid-1');
});

test('Aufruf mit der Hub-UUID einer lokal bekannten Gruppe -> Hub-UUID (kein Umweg über die OID)', () => {
  const g = { id: 'lokal-g', legacy_id: '10PFGT', hub_id: 'hub-uuid-2' };
  assert.equal(waehleGruppenKennung('hub-uuid-2', undefined, [g]), 'hub-uuid-2');
});

test('Verdrahtung: Download, Status und Upload lösen die Gruppe über resolveGruppenKennung auf', () => {
  const q = readFileSync(new URL('../src/syncService.ts', import.meta.url), 'utf8');
  const rumpf = (name: string) => {
    const start = q.indexOf(`export async function ${name}(`);
    assert.ok(start >= 0, `${name} fehlt`);
    const naechste = q.indexOf('\nexport ', start + 10);
    return q.slice(start, naechste < 0 ? undefined : naechste);
  };
  for (const [name, pfad] of [['downloadProject', '/export'], ['getRemoteStatus', '/status'], ['uploadZip', '/upload-zip']] as const) {
    const r = rumpf(name);
    assert.match(r, /const kennung = await resolveGruppenKennung\(/, `${name} löst die Gruppe nicht auf`);
    assert.ok(r.includes('${encodeURIComponent(kennung)}' + pfad), `${name} setzt die Kennung nicht in ${pfad}`);
  }
});
