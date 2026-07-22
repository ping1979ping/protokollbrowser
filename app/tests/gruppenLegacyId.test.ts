/**
 * Test der reinen Fallback-Kette waehleLegacyId (06.3-Review IN-04).
 * Laeuft ueber den Node-22-Builtin-Runner: `node --test app/tests/gruppenLegacyId.test.ts`
 * (Type-Stripping ab Node 22.18 default). Bewusst AUSSERHALB src/ — kein Vitest im PWA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { waehleLegacyId } from '../src/gruppenLegacyId.ts';

test('PK-Treffer mit legacy_id -> dessen legacy_id', () => {
  assert.equal(
    waehleLegacyId('uuid-1', { id: 'uuid-1', legacy_id: '1CY6CY' }, []),
    '1CY6CY',
  );
});

test('kein PK-Treffer, Fallback-Treffer (id===projectId) -> dessen legacy_id', () => {
  assert.equal(
    waehleLegacyId('uuid-2', null, [
      { id: 'uuid-x', legacy_id: 'AAA' },
      { id: 'uuid-2', legacy_id: 'BBB' },
    ]),
    'BBB',
  );
});

test('kein Treffer -> Passthrough (projectId ist bereits legacy_id, ServerImport)', () => {
  assert.equal(
    waehleLegacyId('1CY6CY', undefined, [{ id: 'uuid-y', legacy_id: 'CCC' }]),
    '1CY6CY',
  );
});

test('PK-Treffer ohne legacy_id -> Fallback greift', () => {
  assert.equal(
    waehleLegacyId('uuid-3', { id: 'uuid-3', legacy_id: '' }, [
      { id: 'uuid-3', legacy_id: 'DDD' },
    ]),
    'DDD',
  );
});

test('PK-Treffer null + leerer Katalog -> Passthrough', () => {
  assert.equal(waehleLegacyId('OID-42', null, []), 'OID-42');
});
