/**
 * DOCUframe-Datei-Export (V5c und „Klassisch") bleibt byte-gleich zum Stand 537dfd8 (999.1750).
 *
 * Seit „An Server senden" die Hub-Pakete aus hubPaket.ts nutzt, dienen die beiden Bauer nur noch
 * der heruntergeladenen Sicherungsdatei. Die erwarteten Bytes in tests/fixtures/
 * docuframe_export_{v5c,classic}_537dfd8.json hat der Code aus ExportScreen.tsx im Stand 537dfd8
 * für den Datensatz tests/fixtures/dfExportDatensatz.ts erzeugt (Uhr fest, Zeitzone Europe/Berlin).
 * Jede Änderung an Schlüsseln, Reihenfolge, Datumsform oder Einrückung macht diesen Test rot.
 */
process.env.TZ = 'Europe/Berlin';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildV5cExportJson, buildClassicExportJson } from '../src/dfExport.ts';
import * as d from './fixtures/dfExportDatensatz.ts';

const erwartet = (name: string) => readFileSync(new URL(`./fixtures/docuframe_export_${name}_537dfd8.json`, import.meta.url), 'utf8');

function mitFesterUhr<T>(f: () => T): T {
  mock.timers.enable({ apis: ['Date'], now: new Date(d.JETZT).getTime() });
  try {
    return f();
  } finally {
    mock.timers.reset();
  }
}

test('V5c: Datei-Inhalt byte-gleich zu 537dfd8', () => {
  const ist = mitFesterUhr(() => JSON.stringify(
    buildV5cExportJson(d.gruppe, d.prots, d.relevante, d.protokoll, d.datum, d.autor, d.vorbemerkung, d.verantwortlicheMap), null, 2));
  assert.equal(ist, erwartet('v5c'));
});

test('Klassisch: Datei-Inhalt byte-gleich zu 537dfd8', () => {
  const ist = mitFesterUhr(() => JSON.stringify(
    buildClassicExportJson(d.gruppe, d.prots, d.relevante, d.protokoll, d.datum, d.autor, d.vorbemerkung), null, 2));
  assert.equal(ist, erwartet('classic'));
});
