/**
 * Gruppen-Detail benutzt die gemeinsamen Regeln — Quelltextprüfung.
 *
 * B1: „Aktuelles/Letztes Protokoll bearbeiten" öffnete das Protokoll mit der höchsten Nummer
 * (auch einen liegengebliebenen Entwurf), während neue Punkte nach protokollRegeln.aktuellesProtokoll
 * im bestätigten Protokoll landen. Die Regel selbst prüft tests/protokollRegeln.test.ts; hier wird
 * nur gesichert, dass das Gruppen-Detail keine eigene Ableitung mehr trägt.
 *
 * Grenze: Textprüfung, kein Rendering — die Wirkung zeigt die Browserprüfung.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const quelle = readFileSync(new URL('../src/components/redesign/GruppeDetail.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('B1: Gruppen-Detail bestimmt das aktuelle Protokoll mit aktuellesProtokoll aus protokollRegeln', () => {
  assert.match(quelle, /import\s*\{[^}]*\baktuellesProtokoll\b[^}]*\}\s*from\s*'\.\.\/\.\.\/protokollRegeln'/);
  assert.match(quelle, /=\s*aktuellesProtokoll\(protokolle\)/);
  assert.equal(/protokolle\[0\]/.test(quelle), false, 'eigene Ableitung „höchste Nummer = aktuell" ist noch da');
});
