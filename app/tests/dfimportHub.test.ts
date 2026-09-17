/**
 * Parser übernimmt die Hub-Kennungen aus dem Export (999.1750, E-259).
 *
 * Der Hub-Export (hub-server services/protokoll_dfjson.py `serialize_hierarchical`, 47b00099)
 * trägt an Gruppe, Protokoll und Punkt zusätzlich `HubId`/`IsNew`; `Id` bleibt die OID, bei im Hub
 * angelegten Objekten leer. Vorher vergab parseDfJson für alles neue Zufalls-UUIDs — im Hub
 * angelegte Objekte (ohne OID) ließen sich dadurch weder wiedererkennen noch adressieren.
 * Eingabe ist der Bestand der Vertragsprobe in der Form des Hub-Exports.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDfJson } from '../src/dfimport.ts';
import { vertrag, exportAusBestand } from './fixtures/vertrag.ts';

test('Hub-Export: HubId wird lokale id und hub_id an Gruppe, Protokoll und Punkt', () => {
  const b = vertrag.bestand;
  const { pakete } = parseDfJson(exportAusBestand(b));
  assert.equal(pakete.length, 1);
  const [{ protokollgruppe: g, protokoll: p, protokollelemente: [e] }] = pakete;
  assert.deepEqual([g.id, g.hub_id, g.legacy_id], [b.gruppe.HubId, b.gruppe.HubId, '']);
  assert.deepEqual([p.id, p.hub_id, p.legacy_id, p.nummer], [b.protokolle[0].HubId, b.protokolle[0].HubId, '', 1]);
  const be = b.protokolle[0].Elemente[0];
  assert.deepEqual([e.id, e.hub_id, e.legacy_id, e.protokoll_id], [be.HubId, be.HubId, '', b.protokolle[0].HubId]);
});

test('IsNew: am Protokoll als is_new (offen/versendet), an der Gruppe als is_new, am Punkt NICHT als Änderungsmarke', () => {
  const b = structuredClone(vertrag.bestand);
  b.protokolle[0].Elemente[0].IsNew = true;
  const { pakete } = parseDfJson(exportAusBestand(b));
  const [{ protokollgruppe: g, protokoll: p, protokollelemente: [e] }] = pakete;
  assert.equal(g.is_new, true);
  assert.equal(p.is_new, false);
  assert.equal(e.is_new, undefined, 'Hub-IsNew am Punkt darf keine lokale Änderungsmarke setzen');
  assert.equal(e.is_modified, undefined);
});

test('Export ohne HubId (DocuFrame-Datei): Zufalls-UUID, keine hub_id — wie bisher', () => {
  const b = structuredClone(vertrag.bestand);
  delete b.gruppe.HubId; delete b.gruppe.IsNew;
  b.protokolle[0].Id = 'OID-P1'; delete b.protokolle[0].HubId; delete b.protokolle[0].IsNew;
  b.protokolle[0].Elemente[0].Id = 'OID-E1'; delete b.protokolle[0].Elemente[0].HubId; delete b.protokolle[0].Elemente[0].IsNew;
  const { pakete } = parseDfJson(exportAusBestand(b));
  const [{ protokoll: p, protokollelemente: [e] }] = pakete;
  assert.match(p.id, /^[0-9a-f-]{36}$/);
  assert.equal(p.hub_id, undefined);
  assert.equal(p.is_new, undefined);
  assert.deepEqual([e.legacy_id, e.hub_id, e.protokoll_id], ['OID-E1', undefined, p.id]);
});
