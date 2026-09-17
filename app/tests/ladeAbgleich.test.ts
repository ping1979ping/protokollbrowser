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

// --- Umstieg auf Hub-Kennungen (999.1750, Punkt 3) -----------------------------------------------

/** Gerät vor dem Umstieg: alles mit geräte-lokalen Zufalls-UUIDs, Hub-Protokoll Nr. 5 ohne OID. */
function geraetVorUmstieg(mitAenderungen: boolean): LokalerStand {
  return {
    gruppen: [gruppe('alt-g', { legacy_id: 'OID-G' })],
    protokolle: [
      prot('alt-p4', 'alt-g', { legacy_id: 'OID-P4', nummer: 4 }),
      prot('alt-p5', 'alt-g', { legacy_id: '', nummer: 5, name: 'Baubesprechung 5 - 2026' }),
    ],
    elemente: [
      punkt('alt-e1', 'alt-p4', { legacy_id: 'OID-E1', position: '4.1', positionstext: mitAenderungen ? 'LOKAL: Kran geprüft' : 'Kran', is_modified: mitAenderungen }),
      punkt('alt-e51', 'alt-p5', { position: '5.1', positionstext: mitAenderungen ? 'LOKAL: Dach dicht' : 'Dach', is_modified: mitAenderungen }),
      punkt('alt-e52', 'alt-p5', { position: '5.2', positionstext: 'Fassade' }),
    ],
  };
}

/** Hub-Export nach dem Umstieg: HubId an allem, Protokoll 5 und seine Punkte ohne OID. */
function hubExport(): ProtokollPaket[] {
  const g = gruppe('hub-g', { legacy_id: 'OID-G', hub_id: 'hub-g' });
  return [
    { protokollgruppe: g, protokoll: prot('hub-p4', 'hub-g', { legacy_id: 'OID-P4', hub_id: 'hub-p4', nummer: 4, is_new: false }),
      protokollelemente: [punkt('hub-e1', 'hub-p4', { legacy_id: 'OID-E1', hub_id: 'hub-e1', position: '4.1', positionstext: 'SERVER: Kran' })] },
    { protokollgruppe: g, protokoll: prot('hub-p5', 'hub-g', { legacy_id: '', hub_id: 'hub-p5', nummer: 5, is_new: true, name: 'Baubesprechung 5 - 2026' }),
      protokollelemente: [
        punkt('hub-e51', 'hub-p5', { hub_id: 'hub-e51', position: '5.1', positionstext: 'SERVER: Dach' }),
        punkt('hub-e52', 'hub-p5', { hub_id: 'hub-e52', position: '5.2', positionstext: 'SERVER: Fassade' }),
      ] },
  ];
}

/** Plan auf den lokalen Stand anwenden (wie db.importPakete). */
function anwenden(lokal: LokalerStand, plan: ReturnType<typeof planeAbgleich>): LokalerStand {
  const ersetze = <T extends { id: string }>(alt: readonly T[], neu: readonly T[]) => {
    const m = new Map(alt.map(x => [x.id, x]));
    for (const x of neu) m.set(x.id, x);
    return [...m.values()];
  };
  return { gruppen: ersetze(lokal.gruppen, plan.gruppen), protokolle: ersetze(lokal.protokolle, plan.protokolle), elemente: ersetze(lokal.elemente, plan.elemente) };
}

test('Umstieg, Gerät ohne Änderungen: einmal laden — lokale ids bleiben, hub_id gelernt, keine Dubletten; zweites Laden ändert nichts', () => {
  const vorher = geraetVorUmstieg(false);
  const eins = anwenden(vorher, planeAbgleich(vorher, hubExport()));
  assert.deepEqual(eins.gruppen.map(g => [g.id, g.hub_id]), [['alt-g', 'hub-g']]);
  assert.deepEqual(eins.protokolle.map(p => [p.id, p.hub_id, p.is_new]), [['alt-p4', 'hub-p4', false], ['alt-p5', 'hub-p5', true]]);
  assert.deepEqual(eins.elemente.map(e => [e.id, e.hub_id, e.protokoll_id, e.positionstext]), [
    ['alt-e1', 'hub-e1', 'alt-p4', 'SERVER: Kran'],
    ['alt-e51', 'hub-e51', 'alt-p5', 'SERVER: Dach'],
    ['alt-e52', 'hub-e52', 'alt-p5', 'SERVER: Fassade'],
  ]);
  const zwei = anwenden(eins, planeAbgleich(eins, hubExport()));
  assert.deepEqual(zwei, eins);
});

test('Umstieg, Gerät mit Änderungen: nichts verloren — Inhalt und Marke bleiben, hub_id wird trotzdem gelernt', () => {
  const vorher = geraetVorUmstieg(true);
  const plan = planeAbgleich(vorher, hubExport());
  const nachher = anwenden(vorher, plan);
  assert.deepEqual(plan.geschuetzt.map(e => e.id).sort(), ['alt-e1', 'alt-e51']);
  assert.deepEqual(nachher.elemente.map(e => [e.id, e.hub_id, e.positionstext, !!e.is_modified]), [
    ['alt-e1', 'hub-e1', 'LOKAL: Kran geprüft', true],
    ['alt-e51', 'hub-e51', 'LOKAL: Dach dicht', true],
    ['alt-e52', 'hub-e52', 'SERVER: Fassade', false],
  ]);
  assert.equal(nachher.elemente.length, 3, 'keine Dublette');
});

test('Umstieg: nicht eindeutige Position wird nicht geraten — Serverpunkt neu, lokale Punkte unberührt', () => {
  const vorher = geraetVorUmstieg(false);
  vorher.elemente.push(punkt('alt-e51b', 'alt-p5', { position: '5.1', positionstext: 'Dach (Dublette aus altem Ladestand)' }));
  const nachher = anwenden(vorher, planeAbgleich(vorher, hubExport()));
  const auf51 = nachher.elemente.filter(e => e.position === '5.1').map(e => [e.id, e.hub_id ?? null]).sort();
  assert.deepEqual(auf51, [['alt-e51', null], ['alt-e51b', null], ['hub-e51', 'hub-e51']]);
});

test('Umstieg: lokaler Entwurf (is_new) mit gleicher Nummer wird keinem Hub-Protokoll zugeordnet', () => {
  const vorher = geraetVorUmstieg(false);
  vorher.protokolle[1] = { ...vorher.protokolle[1], is_new: true };
  const nachher = anwenden(vorher, planeAbgleich(vorher, hubExport()));
  assert.deepEqual(nachher.protokolle.map(p => [p.id, p.hub_id ?? null]).sort(), [['alt-p4', 'hub-p4'], ['alt-p5', null], ['hub-p5', 'hub-p5']]);
});

test('Nach dem Umstieg: neu geladene Objekte tragen die Hub-UUID als id; gesendete lokale Neuanlage wird über ihre UUID erkannt', () => {
  const leer: LokalerStand = { gruppen: [], protokolle: [], elemente: [] };
  const plan = planeAbgleich(leer, hubExport());
  assert.equal(plan.gruppeId, 'hub-g');
  // lokal angelegter Punkt, gesendet (Hub übernahm die UUID), danach geändert
  const lokal = anwenden(leer, plan);
  lokal.elemente.push(punkt('neu-uuid', 'hub-p5', { position: '5.3', positionstext: 'LOKAL: nachgetragen', hub_id: 'neu-uuid', is_modified: true }));
  const server = hubExport();
  server[1].protokollelemente.push(punkt('neu-uuid', 'hub-p5', { hub_id: 'neu-uuid', position: '5.3', positionstext: 'SERVER: alt' }));
  const zwei = planeAbgleich(lokal, server);
  assert.deepEqual(zwei.geschuetzt.map(e => [e.id, e.positionstext]), [['neu-uuid', 'LOKAL: nachgetragen']]);
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
