/**
 * Regressionstest des Kartenkerns (src/map-core/).
 * Laeuft ueber den Node-22-Builtin-Runner: `node --test app/tests/`
 * (Type-Stripping ab Node 22.18 default). Bewusst AUSSERHALB src/ — kein Vitest in der PWA.
 *
 * Der eigentliche Regressionsschutz liegt bei der Statusfarbe: Statusliste
 * (STATUS_MAP in src/types.ts) und Kartenfarbtabelle (src/map-core/status.ts)
 * sind zwei getrennt gepflegte Quellen. Wird die eine erweitert und die andere
 * vergessen, faellt genau dieser Test um — vorher fiel der vergessene Code
 * still in einen Default und wurde auf der Karte grau.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_MAP } from '../src/types.ts';
import { statusColor, STATUS_FARBEN, STATUS_FARBE } from '../src/map-core/status.ts';
import { formatLatLon, formatCoord, headingArrow } from '../src/map-core/format.ts';
import { latLonToTile } from '../src/map-core/tiles.ts';

// --- Statusfarben ---

test('jeder Statuscode der Statusliste steht ausdruecklich in der Farbtabelle', () => {
  // Nicht ueber statusColor pruefbar: drei Codes sind rechtmaessig grau und
  // waeren von einem grauen Default nicht zu unterscheiden. Deshalb hier die
  // Tabelle selbst — ein bekannter Code darf nie bloss zufaellig richtig sein.
  for (const key of Object.keys(STATUS_MAP)) {
    const code = Number(key);
    assert.ok(
      Object.prototype.hasOwnProperty.call(STATUS_FARBE, code),
      `Statuscode ${code} (${STATUS_MAP[code].label}) fehlt in STATUS_FARBE`,
    );
  }
});

test('die Kartenfarbe stimmt fuer jeden Statuscode mit dem Farbwort der Statusliste ueberein', () => {
  for (const key of Object.keys(STATUS_MAP)) {
    const code = Number(key);
    const eintrag = STATUS_MAP[code];
    const erwartet = STATUS_FARBEN[eintrag.farbe as keyof typeof STATUS_FARBEN];
    assert.ok(erwartet, `Farbwort "${eintrag.farbe}" hat keinen Hexwert`);
    assert.equal(
      statusColor(code),
      erwartet,
      `Statuscode ${code} (${eintrag.label}, ${eintrag.farbe}) liefert die falsche Kartenfarbe`,
    );
  }
});

test('die Farbtabelle enthaelt keinen Statuscode, den die Statusliste nicht kennt', () => {
  for (const key of Object.keys(STATUS_FARBE)) {
    assert.ok(STATUS_MAP[Number(key)], `Farbtabelle kennt unbekannten Statuscode ${key}`);
  }
});

test('ein unbekannter Statuscode bleibt grau', () => {
  assert.equal(statusColor(999), STATUS_FARBEN.grau);
  assert.equal(statusColor(-1), STATUS_FARBEN.grau);
});

// --- Koordinatentext ---

test('formatLatLon liefert genau fuenf Nachkommastellen', () => {
  assert.equal(formatLatLon(48.1374312345, 11.5754912345), '48.13743, 11.57549');
  assert.match(formatLatLon(48.1374312345, 11.5754912345), /^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
  // auch dann, wenn die Eingabe weniger Stellen hat
  assert.equal(formatLatLon(48.1, -11.5), '48.10000, -11.50000');
  assert.match(formatLatLon(0, 0), /^-?\d+\.\d{5}, -?\d+\.\d{5}$/);
});

test('formatLatLon rundet auch suedliche und westliche Koordinaten korrekt', () => {
  assert.equal(formatLatLon(-33.8688212, 151.2092931), '-33.86882, 151.20929');
});

test('formatCoord haengt Genauigkeit und Blickrichtung an', () => {
  assert.equal(
    formatCoord(48.1374312345, 11.5754912345, 12, 90),
    '48.13743, 11.57549 (12 m) → 90°',
  );
  assert.equal(formatCoord(48.1374312345, 11.5754912345, 12), '48.13743, 11.57549 (12 m)');
  assert.equal(formatCoord(48.1374312345, 11.5754912345), '48.13743, 11.57549');
  assert.equal(formatCoord(48.1374312345, 11.5754912345, null, 0), '48.13743, 11.57549 ↑ 0°');
});

test('headingArrow trifft die acht Himmelsrichtungen', () => {
  assert.equal(headingArrow(0), '↑');
  assert.equal(headingArrow(90), '→');
  assert.equal(headingArrow(180), '↓');
  assert.equal(headingArrow(270), '←');
  assert.equal(headingArrow(360), '↑');
});

// --- Kachelrechnung ---

test('latLonToTile trifft von Hand nachrechenbare Referenzwerte', () => {
  // Zoomstufe 0 hat genau eine Kachel — jede gueltige Koordinate landet auf 0/0.
  assert.deepEqual(latLonToTile(48.13743, 11.57549, 0), { x: 0, y: 0 });
  // Zoomstufe 2, n = 4: x = floor(((45+180)/360)*4) = floor(2.5) = 2;
  // am Aequator ist y = floor((1 - ln(1)/pi)/2 * 4) = floor(2) = 2.
  assert.deepEqual(latLonToTile(0, 45, 2), { x: 2, y: 2 });
  // Westrand: x = floor(0) = 0.
  assert.deepEqual(latLonToTile(0, -180, 2), { x: 0, y: 2 });
});

test('latLonToTile laeuft in die richtige Richtung', () => {
  const zoom = 12;
  const mitte = latLonToTile(48.13743, 11.57549, zoom);
  const oestlich = latLonToTile(48.13743, 11.9, zoom);
  const noerdlich = latLonToTile(48.4, 11.57549, zoom);
  assert.ok(oestlich.x > mitte.x, 'weiter oestlich muss eine groessere Spalte ergeben');
  assert.ok(noerdlich.y < mitte.y, 'weiter noerdlich muss eine kleinere Zeile ergeben');
  const n = Math.pow(2, zoom);
  assert.ok(mitte.x >= 0 && mitte.x < n && mitte.y >= 0 && mitte.y < n);
});
