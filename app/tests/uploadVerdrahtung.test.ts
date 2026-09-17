/**
 * Verdrahtung des Upload-Ablaufs (B4) — Quelltextprüfung.
 *
 * Die Prüfwelle hat in ExportScreen.tsx `clearSyncFlags(ausw.markenLoeschen)` durch
 * `clearSyncFlags(elementIds)` ersetzt: alle Tests blieben grün, im Browser waren alle
 * Marken weg. Komponenten lassen sich mit dem Node-Runner nicht rendern (kein DOM, keine
 * IndexedDB). Deshalb liegt die Logik in src/uploadAblauf.ts (tests/uploadAblauf.test.ts),
 * und dieser Test sichert, dass Vordergrund und Hintergrund nur über diesen Ablauf und die
 * eine Abhängigkeitsbelegung (src/uploadAblaufDb.ts) an Marken, Exporte und Upload kommen.
 *
 * Grenze, ehrlich benannt: das ist eine Textprüfung. Sie erkennt eigene Aufrufe von
 * Marken-/Export-/Upload-Funktionen in den beiden Aufrufern und eine vertauschte Belegung,
 * nicht aber ein Rendering, das die Meldung trotz Aufruf verschluckt — das zeigt nur der Browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const quelle = (pfad: string) =>
  readFileSync(new URL(`../src/${pfad}`, import.meta.url), 'utf8')
    // Kommentare entfernen, damit ein erwähnter Name nicht als Aufruf zählt
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const VERBOTEN = ['clearSyncFlags', 'deletePendingExport', 'uploadZip', 'werteUploadAus'];

for (const datei of ['components/ExportScreen.tsx', 'useSyncStatus.ts']) {
  test(`${datei}: kein eigener Zugriff auf Marken, Exporte oder Upload — nur über den Ablauf`, () => {
    const q = quelle(datei);
    for (const name of VERBOTEN) {
      assert.equal(new RegExp(`\\b${name}\\b`).test(q), false, `${datei} benutzt ${name} direkt`);
    }
    assert.match(q, /\buploadAblaufDeps\b/, `${datei} benutzt die gemeinsame Abhängigkeitsbelegung nicht`);
    // Die Belegung wird nur an den Ablauf weitergereicht, nie selbst aufgerufen (z. B. loescheMarken)
    assert.equal(/\buploadAblaufDeps\s*\??\.\s*\w/.test(q), false, `${datei} ruft eine Rolle der Belegung selbst auf`);
  });
}

test('ExportScreen sendet über sendeExport und zeigt die gemeinsame Meldung', () => {
  const q = quelle('components/ExportScreen.tsx');
  assert.match(q, /\bsendeExport\(/);
  assert.match(q, /<UploadMeldung\b/);
});

test('ExportScreen: „An Server senden" speichert und sendet das Hub-Paket-ZIP, die DOCUframe-Bauer nur im Datei-Zweig (999.1750)', () => {
  const q = quelle('components/ExportScreen.tsx');
  assert.match(q, /\bbaueHubPakete\(/);
  // Der ausstehende Export (gesendet über sendeExport) trägt das ZIP aus den Hub-Paketen
  assert.match(q, /hubZip\.file\('upload\.json', JSON\.stringify\(pakete\)\)/);
  assert.match(q, /const hubBlob = await hubZip\.generateAsync\(/);
  assert.match(q, /blob:\s*hubBlob,/);
  // Die DOCUframe-Bauer kommen nur im Datei-Zweig (autoBackup) vor dem Paketbau vor
  const beginn = q.indexOf("if (localStorage.getItem('autoBackup') !== 'false')");
  const ende = q.indexOf('baueHubPakete(');
  assert.ok(beginn > 0 && ende > beginn, 'Datei-Zweig nicht vor dem Paketbau gefunden');
  const dateiZweig = q.slice(beginn, ende);
  const rest = q.slice(0, beginn) + q.slice(ende);
  for (const name of ['buildV5cExportJson(', 'buildClassicExportJson(']) {
    assert.ok(dateiZweig.includes(name), `${name} fehlt im Datei-Zweig`);
    assert.equal(rest.includes(name), false, `${name} außerhalb des Datei-Zweigs`);
  }
});

test('useSyncStatus sendet über sendeAusstehende und liefert ungelesene Meldungen', () => {
  const q = quelle('useSyncStatus.ts');
  assert.match(q, /\bsendeAusstehende\(/);
  assert.match(q, /\bungeleseneMeldungen\(/);
  assert.match(q, /\bmeldungGelesen\(/);
});

test('ProtokollUebersicht zeigt die Meldungen des Hintergrundwegs', () => {
  const q = quelle('components/ProtokollUebersicht.tsx');
  assert.match(q, /sync\.uploadMeldungen/);
  assert.match(q, /<UploadMeldung\b/);
});

test('Abhängigkeitsbelegung: jede Rolle zeigt auf die passende DB-/Sync-Funktion', () => {
  const q = quelle('uploadAblaufDb.ts');
  const belegung: Record<string, string> = {
    upload: 'uploadZip',
    ladeElement: 'getElement',
    loescheMarken: 'clearSyncFlags',
    speichereExport: 'savePendingExport',
    loescheExport: 'deletePendingExport',
  };
  for (const [rolle, fn] of Object.entries(belegung)) {
    assert.match(q, new RegExp(`\\b${rolle}:\\s*${fn}\\s*,`), `${rolle} ist nicht direkt mit ${fn} belegt`);
  }
});
