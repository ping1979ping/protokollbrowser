/**
 * Laden vom Server überschreibt keine ungesendeten Änderungen und löscht keine ausstehenden
 * Exporte (999.1750, MANGEL aus der Prüfwelle: stiller Datenverlust).
 *
 * Vorher: db.importPakete ersetzte den Inhalt geänderter Punkte durch den Serverstand (nur die
 * Marke blieb), downloadProject löschte jeden ausstehenden Export der Gruppe. Auslösbar über den
 * Sync-Knopf und „Einstellungen → Vom Server laden".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeAbgleich, textGeschuetzt, type LokalerStand, type ProtokollMitGruppe } from '../src/ladeAbgleich.ts';
import type { Protokollelement, Protokollgruppe, ProtokollPaket } from '../src/types.ts';

const T = '2026-09-17T07:00:00.000Z';
const ohneOrt = { geo_lat: null, geo_lon: null, geo_accuracy: null, geo_text: null, geo_heading: null, geo_altitude: null, fotos: [] };

const gruppe = (id: string, extra: Partial<Protokollgruppe> = {}): Protokollgruppe => ({
  id, created_at: T, updated_at: T, created_by: null, object_type: 'protokollgruppe', legacy_id: 'OID-G', name: 'Baubesprechung',
  projekt_nummer: '4711', projekt_name: 'Werkhalle', projekt_stammverzeichnis: '', protokollnummer: 4, vorwort: '', nachwort: '',
  themen: '', bemerkung: '', ...extra,
});
const prot = (id: string, gruppeId: string, extra: Partial<ProtokollMitGruppe> = {}): ProtokollMitGruppe => ({
  id, created_at: T, updated_at: T, created_by: null, object_type: 'protokoll', legacy_id: 'OID-P4', name: 'Baubesprechung 4',
  nummer: 4, datum: '2026-09-03T10:00:00', ort: '', autor: '', vorbemerkung: '', nachbemerkung: '', erledigt: false,
  ist_einzelprotokoll: false, erstellt: true, signatur: '', teilnehmer: [], verteiler: [], gruppe_id: gruppeId, ...extra,
});
const punkt = (id: string, protId: string, extra: Partial<Protokollelement> = {}): Protokollelement => ({
  id, created_at: T, updated_at: T, created_by: null, object_type: 'protokollelement', legacy_id: '', protokoll_id: protId,
  position: '', positionstitel: '', positionstext: '', thema: '', status: 10, termin: '', verantwortlicher_id: null,
  verantwortlicher_name: '', bemerkung: '', erinnerung: false, wert: 0, verweise: [], mobile_erfassung: { ...ohneOrt }, ...extra,
});

/** Gerät: Gruppe mit drei Punkten — einer lokal geändert, einer neu, einer unverändert. */
function geraet(): LokalerStand {
  return {
    gruppen: [gruppe('lokal-g')],
    protokolle: [prot('lokal-p4', 'lokal-g')],
    elemente: [
      punkt('lokal-e1', 'lokal-p4', { legacy_id: 'OID-E1', position: '4.1', positionstext: 'LOKAL: Kran geprüft', status: 20, is_modified: true }),
      punkt('lokal-e2', 'lokal-p4', { legacy_id: 'OID-E2', position: '4.2', positionstext: 'alt: Gerüst' }),
      punkt('lokal-neu', 'lokal-p4', { position: '4.3', positionstext: 'LOKAL: neuer Punkt', is_new: true }),
    ],
  };
}

/** Serverstand: dieselbe Gruppe (neue Zufalls-ids aus dem Parser), beide DocuFrame-Punkte geändert. */
function server(): ProtokollPaket[] {
  const g = gruppe('parser-g');
  return [{
    protokollgruppe: g,
    protokoll: prot('parser-p4', 'parser-g'),
    protokollelemente: [
      punkt('parser-e1', 'parser-p4', { legacy_id: 'OID-E1', position: '4.1', positionstext: 'SERVER: Kran offen', status: 10 }),
      punkt('parser-e2', 'parser-p4', { legacy_id: 'OID-E2', position: '4.2', positionstext: 'SERVER: Gerüst steht' }),
    ],
  }];
}

test('geänderter Punkt wird beim Laden nicht überschrieben und benannt', () => {
  const plan = planeAbgleich(geraet(), server());
  assert.equal(plan.elemente.some(e => e.id === 'lokal-e1'), false, 'geänderter Punkt darf nicht geschrieben werden');
  assert.deepEqual(plan.geschuetzt.map(e => [e.id, e.positionstext, e.is_modified]), [['lokal-e1', 'LOKAL: Kran geprüft', true]]);
});

test('unveränderter Punkt übernimmt den Serverstand und behält seine lokale id', () => {
  const plan = planeAbgleich(geraet(), server());
  assert.deepEqual(plan.elemente.map(e => [e.id, e.positionstext, e.protokoll_id]), [['lokal-e2', 'SERVER: Gerüst steht', 'lokal-p4']]);
  assert.equal(plan.gruppeId, 'lokal-g');
  assert.deepEqual(plan.protokolle.map(p => [p.id, p.gruppe_id]), [['lokal-p4', 'lokal-g']]);
});

test('lokal neuer Punkt bleibt unberührt (nicht im Plan)', () => {
  const plan = planeAbgleich(geraet(), server());
  assert.equal([...plan.elemente, ...plan.geschuetzt].some(e => e.id === 'lokal-neu'), false);
});

test('Gerät ohne Änderungen: alles vom Server übernommen, nichts geschützt, kein Hinweis', () => {
  const lokal = geraet();
  const ohne = { ...lokal, elemente: lokal.elemente.filter(e => !e.is_new).map(e => ({ ...e, is_modified: false })) };
  const plan = planeAbgleich(ohne, server());
  assert.deepEqual(plan.elemente.map(e => [e.id, e.positionstext]), [['lokal-e1', 'SERVER: Kran offen'], ['lokal-e2', 'SERVER: Gerüst steht']]);
  assert.deepEqual(plan.geschuetzt, []);
  assert.equal(textGeschuetzt(plan.geschuetzt.length), null);
});

test('Hinweistext nennt die Zahl', () => {
  assert.equal(textGeschuetzt(3), '3 Punkte haben ungesendete Änderungen und wurden nicht überschrieben. Erst senden, dann laden, um den Serverstand zu übernehmen.');
  assert.match(textGeschuetzt(1) ?? '', /^1 Punkt hat ungesendete Änderungen und wurde nicht überschrieben\./);
});

test('Verdrahtung: Laden löscht keine ausstehenden Exporte, Sync-Knopf und „Vom Server laden" zeigen den Hinweis', () => {
  const quelle = (pfad: string) => readFileSync(new URL(`../src/${pfad}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const sync = quelle('syncService.ts');
  const start = sync.indexOf('export async function downloadProject(');
  const rumpf = sync.slice(start, sync.indexOf('\nexport ', start + 10));
  assert.equal(/deletePendingExport|getPendingExports/.test(rumpf), false, 'downloadProject fasst ausstehende Exporte an');
  assert.match(rumpf, /geschuetzt/);
  const hook = quelle('useSyncStatus.ts');
  assert.match(hook, /setSyncHinweis\(textGeschuetzt\(geschuetzt\)\)/);
  assert.match(quelle('components/ProtokollUebersicht.tsx'), /sync\.syncHinweis/);
  assert.match(quelle('components/ServerImportScreen.tsx'), /textGeschuetzt\(geschuetzt\)/);
  assert.match(quelle('db.ts'), /planeAbgleich\(/);
});
