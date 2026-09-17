/**
 * Upload-Ablauf für Vordergrund (ExportScreen) und Hintergrund (useSyncStatus) — B4.
 *
 * Geprüft wird nicht nur die Auswertung der Hub-Antwort (tests/uploadAuswertung.test.ts),
 * sondern was der Ablauf daraus MACHT: welche Änderungsmarken er löscht, ob der ausstehende
 * Export liegen bleibt, ob er erneut gesendet wird und wann die Meldung verschwindet.
 * Die Abhängigkeiten (IndexedDB, Upload) sind hier Attrappen mit Rückwirkung: sie halten
 * Marken und Exporte in Maps, damit der Zustand nach dem Ablauf abgelesen werden kann.
 *
 * Dass ExportScreen und useSyncStatus wirklich diesen Ablauf benutzen, prüft
 * tests/uploadVerdrahtung.test.ts.
 *
 * Läuft über den Node-22-Builtin-Runner (`npm test`), bewusst außerhalb von src/.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sendeExport, sendeAusstehende, ungeleseneMeldungen, meldungGelesen, raeumeErledigteAuf,
  type AusstehenderExport, type UploadAblaufDeps,
} from '../src/uploadAblauf.ts';

interface Punkt { id: string; legacy_id?: string; position: string; positionstext: string; positionstitel: string; protokoll_id: string; is_new?: boolean; is_modified?: boolean }

function welt(antworten: Array<Record<string, unknown> | Error>) {
  const punkte = new Map<string, Punkt>([
    ['e1', { id: 'e1', legacy_id: 'L1', position: '4.1', positionstext: 'Kranstandort abstimmen', positionstitel: '', protokoll_id: 'p4', is_modified: true }],
    ['e2', { id: 'e2', legacy_id: '', position: '4.2', positionstext: 'Absturzsicherung Treppenhaus', positionstitel: '', protokoll_id: 'p4', is_new: true }],
    ['e3', { id: 'e3', legacy_id: '', position: '3.3', positionstext: 'Neuer Punkt im versendeten Protokoll', positionstitel: '', protokoll_id: 'p3', is_new: true }],
  ]);
  const exporte = new Map<string, AusstehenderExport>();
  const aufrufe = { upload: [] as string[], markenGeloescht: [] as string[][], exportGeloescht: [] as string[] };
  const deps: UploadAblaufDeps = {
    upload: async (_g, _b, filename) => {
      aufrufe.upload.push(filename);
      const a = antworten.shift();
      if (!a) throw new Error('keine Antwort vorbereitet');
      if (a instanceof Error) throw a;
      return a;
    },
    ladeElement: async (id) => punkte.get(id),
    loescheMarken: async (ids) => {
      aufrufe.markenGeloescht.push([...ids]);
      for (const id of ids) { const p = punkte.get(id); if (p) { p.is_new = false; p.is_modified = false; } }
    },
    speichereExport: async (exp) => { exporte.set(exp.id, exp); },
    loescheExport: async (id) => { aufrufe.exportGeloescht.push(id); exporte.delete(id); },
    protokollName: async (id) => (id === 'p3' ? 'Baubesprechung 3 - 2026' : 'Baubesprechung 4 - 2026'),
    jetzt: () => '2026-09-17T12:00:00.000Z',
  };
  const exp = (id: string, elementIds = ['e1', 'e2', 'e3'], gruppeId = 'g1'): AusstehenderExport => {
    const e: AusstehenderExport = { id, gruppeId, blob: new Blob(['zip']), filename: `${id}.zip`, elementIds, createdAt: '2026-09-17T11:00:00.000Z' };
    exporte.set(id, e);
    return e;
  };
  const marken = () => [...punkte.values()].filter(p => p.is_new || p.is_modified).map(p => p.id).sort();
  return { deps, exporte, aufrufe, exp, marken };
}

const ok = (o: Record<string, unknown> = {}) => ({ status: 'ok', files: 1, photos: 0, written: 3, skipped: 0, felder_abgelehnt: 0, skipped_oids: [], term_remap: {}, ...o });

test('vollständig übernommen: alle Marken gelöscht, Export gelöscht, keine Meldung', async () => {
  const w = welt([ok()]);
  const e = w.exp('x1');
  const r = await sendeExport(e, w.deps);
  assert.equal(r.auswertung.vollstaendig, true);
  assert.deepEqual(w.marken(), []);
  assert.equal(w.exporte.has('x1'), false);
  assert.deepEqual(ungeleseneMeldungen([...w.exporte.values()], 'g1'), []);
});

test('Feldänderungen abgelehnt: KEINE Marke gelöscht, Export bleibt mit Auswertung liegen (ungelesen)', async () => {
  const w = welt([ok({ felder_abgelehnt: 1 })]);
  const e = w.exp('x1');
  const r = await sendeExport(e, w.deps);
  assert.equal(r.auswertung.vollstaendig, false);
  assert.deepEqual(w.marken(), ['e1', 'e2', 'e3']);
  for (const ids of w.aufrufe.markenGeloescht) assert.deepEqual(ids, []);
  assert.deepEqual(w.aufrufe.exportGeloescht, []);
  const liegt = w.exporte.get('x1');
  assert.ok(liegt, 'Export muss liegen bleiben');
  assert.equal(liegt.auswertung?.abgelehnteFelder, 1);
  assert.equal(liegt.gelesenAm, undefined);
  assert.deepEqual(ungeleseneMeldungen([...w.exporte.values()], 'g1').map(m => m.id), ['x1']);
});

test('übersprungener Punkt: nur die übernommenen Marken gelöscht, Export bleibt, Punkt benannt', async () => {
  const w = welt([ok({ written: 2, skipped: 1, skipped_oids: ['e3'] })]);
  await sendeExport(w.exp('x1'), w.deps);
  assert.deepEqual(w.marken(), ['e3']);
  const liegt = w.exporte.get('x1');
  assert.ok(liegt);
  assert.deepEqual(liegt.punkte, [{ id: 'e3', position: '3.3', text: 'Neuer Punkt im versendeten Protokoll', protokoll: 'Baubesprechung 3 - 2026' }]);
});

test('Duplikat: Marken bleiben, Export bleibt mit Auswertung', async () => {
  const w = welt([ok({ status: 'duplicate', written: 0 })]);
  await sendeExport(w.exp('x1'), w.deps);
  assert.deepEqual(w.marken(), ['e1', 'e2', 'e3']);
  assert.equal(w.exporte.get('x1')?.auswertung?.duplikat, true);
});

test('Netz-/HTTP-Fehler: Fehler geht an den Aufrufer, Marken und Export unverändert ausstehend', async () => {
  const w = welt([new Error('Server-Fehler: 500')]);
  const e = w.exp('x1');
  await assert.rejects(() => sendeExport(e, w.deps), /500/);
  assert.deepEqual(w.marken(), ['e1', 'e2', 'e3']);
  assert.deepEqual(w.aufrufe.markenGeloescht, []);
  assert.equal(w.exporte.get('x1')?.auswertung, undefined);
});

test('Hintergrund: erst HTTP 500, dann felder_abgelehnt — Meldung entsteht, Export bleibt, Marken bleiben', async () => {
  const w = welt([new Error('Server-Fehler: 500'), ok({ felder_abgelehnt: 1 })]);
  w.exp('x1');
  const r1 = await sendeAusstehende([...w.exporte.values()], w.deps);
  assert.deepEqual(r1, { gesendet: 0, fehlgeschlagen: 1 });
  assert.deepEqual(ungeleseneMeldungen([...w.exporte.values()], 'g1'), []);
  const r2 = await sendeAusstehende([...w.exporte.values()], w.deps);
  assert.deepEqual(r2, { gesendet: 1, fehlgeschlagen: 0 });
  assert.deepEqual(w.marken(), ['e1', 'e2', 'e3']);
  assert.deepEqual(ungeleseneMeldungen([...w.exporte.values()], 'g1').map(m => m.id), ['x1']);
});

test('Hintergrund: ausgewertete Exporte werden nicht erneut gesendet (der Hub antwortete nur „duplicate")', async () => {
  const w = welt([ok({ felder_abgelehnt: 1 })]);
  w.exp('x1');
  await sendeAusstehende([...w.exporte.values()], w.deps);
  const r = await sendeAusstehende([...w.exporte.values()], w.deps);
  assert.deepEqual(r, { gesendet: 0, fehlgeschlagen: 0 });
  assert.equal(w.aufrufe.upload.length, 1);
});

test('Hintergrund: ein fehlschlagender Export hält die übrigen nicht auf', async () => {
  const w = welt([new Error('Zeitüberschreitung'), ok({ written: 1 })]);
  w.exp('x1', ['e1']);
  w.exp('x2', ['e2']);
  const r = await sendeAusstehende([...w.exporte.values()], w.deps);
  assert.deepEqual(r, { gesendet: 1, fehlgeschlagen: 1 });
  assert.deepEqual(w.marken(), ['e1', 'e3']);
});

test('Meldungen je Gruppe: nur ausgewertete, ungelesene Exporte dieser Gruppe', () => {
  const basis = { blob: new Blob([]), filename: 'f.zip', elementIds: [], createdAt: '' };
  const a = werteDummy();
  const liste: AusstehenderExport[] = [
    { ...basis, id: 'a', gruppeId: 'g1' },
    { ...basis, id: 'b', gruppeId: 'g1', auswertung: a, ausgewertetAm: '2026-09-17T10:00:00.000Z' },
    { ...basis, id: 'c', gruppeId: 'g1', auswertung: a, ausgewertetAm: '2026-09-17T09:00:00.000Z', gelesenAm: '2026-09-17T11:00:00.000Z' },
    { ...basis, id: 'd', gruppeId: 'g2', auswertung: a, ausgewertetAm: '2026-09-17T10:00:00.000Z' },
  ];
  assert.deepEqual(ungeleseneMeldungen(liste, 'g1').map(m => m.id), ['b']);
});

test('gelesen: Meldung verschwindet; Export bleibt, solange einer seiner Punkte noch eine Marke trägt', async () => {
  const w = welt([ok({ felder_abgelehnt: 1 })]);
  await sendeExport(w.exp('x1'), w.deps);
  const liegt = w.exporte.get('x1');
  assert.ok(liegt);
  await meldungGelesen(liegt, w.deps);
  assert.equal(w.exporte.get('x1')?.gelesenAm, '2026-09-17T12:00:00.000Z');
  assert.deepEqual(ungeleseneMeldungen([...w.exporte.values()], 'g1'), []);
  assert.equal(w.exporte.has('x1'), true);
});

test('Aufräumen: gelesener Export ohne offene Marken wird gelöscht, ungelesener nie', async () => {
  const w = welt([ok({ felder_abgelehnt: 1 }), ok({ felder_abgelehnt: 1 })]);
  await sendeExport(w.exp('x1', ['e1']), w.deps);
  await sendeExport(w.exp('x2', ['e2']), w.deps);
  const x1 = w.exporte.get('x1');
  assert.ok(x1);
  await meldungGelesen(x1, w.deps);
  // Marken beider Punkte später durch einen vollständigen Upload erledigt
  await w.deps.loescheMarken(['e1', 'e2']);
  await raeumeErledigteAuf([...w.exporte.values()], w.deps);
  assert.equal(w.exporte.has('x1'), false);
  assert.equal(w.exporte.has('x2'), true, 'ungelesene Meldung bleibt, auch ohne Marken');
});

function werteDummy() {
  return {
    vollstaendig: false, duplikat: false, antwortUnvollstaendig: false, gesendet: 1, geschrieben: 1,
    abgelehnteFelder: 1, uebersprungen: [], uebersprungenOhneZuordnung: [], nichtVerarbeitet: 0, markenLoeschen: [],
  };
}
