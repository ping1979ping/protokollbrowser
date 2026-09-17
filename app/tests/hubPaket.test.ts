/**
 * Paketbau für „An Server senden" gegen die Vertragsprobe des Hub (999.1750, E-259).
 *
 * tests/fixtures/protokoll_app_vertrag_v1.json ist eine unveränderte Kopie von
 * hub-server backend/tests/fixtures/protokoll/protokoll_app_vertrag_v1.json (47b00099); der Hub
 * lädt `upload` daraus hoch und prüft Antwort und Datenbank. Hier wird aus dem Gerätestand, der
 * zu `bestand` und den beschriebenen Änderungen gehört, das Paket gebaut und mit `upload`
 * verglichen.
 *
 * Genau gleich sein muss: Paketfolge, Protokollköpfe, jede Kennung, jeder Schlüssel der Probe und
 * das Teilpaket am versendeten Protokoll (nur Status/Positionstext). Die App schickt an Punkten
 * offener Protokolle zusätzlich Erinnerung, Wert und die Verortungsschlüssel — sie gehören zu
 * `_ELEMENT_FELDER`/`_mobile_from_df` im Hub und tragen bei den neuen Punkten der Probe genau die
 * Werte, die der Hub ohne Schlüssel setzt (False, 0, keine Verortung). Das prüft der Test ebenfalls.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baueHubPakete, hubKennung, zuDfDatum, type HubElement } from '../src/hubPaket.ts';
import type { Protokoll, Protokollelement } from '../src/types.ts';

const vertrag = JSON.parse(readFileSync(new URL('./fixtures/protokoll_app_vertrag_v1.json', import.meta.url), 'utf8'));
const T = '2026-09-17T07:00:00.000Z';

function prot(p: Partial<Protokoll> & Pick<Protokoll, 'id' | 'name' | 'nummer' | 'datum'>): Protokoll {
  return {
    created_at: T, updated_at: T, created_by: null, object_type: 'protokoll', legacy_id: '', ort: '', autor: '',
    vorbemerkung: '', nachbemerkung: '', erledigt: false, ist_einzelprotokoll: false, erstellt: false, signatur: '',
    teilnehmer: [], verteiler: [], ...p,
  };
}

function punkt(e: Partial<Protokollelement> & Pick<Protokollelement, 'id' | 'protokoll_id'>): Protokollelement {
  return {
    created_at: T, updated_at: T, created_by: null, object_type: 'protokollelement', legacy_id: '', position: '',
    positionstitel: '', positionstext: '', thema: '', status: 0, termin: '', verantwortlicher_id: null,
    verantwortlicher_name: '', bemerkung: '', erinnerung: false, wert: 0, verweise: [],
    mobile_erfassung: { geo_lat: null, geo_lon: null, geo_accuracy: null, geo_text: null, geo_heading: null, geo_altitude: null, fotos: [] },
    ...e,
  };
}

/** Gerätestand nach dem Laden von `bestand` und den Änderungen, die die Probe beschreibt. */
function geraetestand() {
  const b = vertrag.bestand.protokolle[0];
  const be = b.Elemente[0];
  const neuProtId = vertrag.upload[0].Elemente[0].ProtokollId;
  const protokolle = [
    // versendet (IsNew false), im Hub angelegt: lokale id = HubId, keine OID
    prot({ id: b.HubId, hub_id: b.HubId, name: b.Name, nummer: b.Nummer, datum: '2026-09-03T10:00:00', is_new: false }),
    // offline angelegt, Gerät hat die Nummer 1 gewählt
    prot({ id: neuProtId, name: 'Baubesprechung 2', nummer: 1, datum: '2026-09-17T09:30:00', is_new: true }),
  ];
  const [n1, n2] = vertrag.upload[0].Elemente;
  const elemente = [
    punkt({
      id: n2.Id, protokoll_id: neuProtId, position: '2', positionstitel: 'Rohbau', positionstext: n2.Positionstext,
      thema: 'Rohbau', status: 10, termin: '2026-09-24T00:00:00', verantwortlicher_name: 'Rohbau Muster GmbH',
      bemerkung: 'Statiker informieren', is_new: true,
    }),
    punkt({
      id: n1.Id, protokoll_id: neuProtId, position: '1', positionstitel: 'Baustelleneinrichtung', positionstext: n1.Positionstext,
      thema: 'Baustelleneinrichtung', status: 20, is_new: true,
    }),
    punkt({
      id: be.HubId, hub_id: be.HubId, protokoll_id: b.HubId, position: be.Position, positionstitel: be.Positionstitel,
      positionstext: 'Schalung der Decke über EG geprüft', thema: be.Thema, status: 25, termin: '2026-09-10T00:00:00',
      verantwortlicher_name: be.VerantwortlicherName, bemerkung: be.Bemerkung, is_modified: true,
    }),
  ];
  return { protokolle, elemente };
}

const HUB_VORGABE_OHNE_SCHLUESSEL: Record<string, unknown> = { Erinnerung: false, Wert: 0 };
const GEO = ['GeoLat', 'GeoLon', 'GeoAccuracy', 'GeoText', 'GeoHeading', 'GeoAltitude'];

function vergleicheMitProbe(ist: HubElement, soll: Record<string, unknown>, wo: string) {
  for (const [k, v] of Object.entries(soll)) {
    if (k === 'MobileErfassung') {
      const m = ist.MobileErfassung as Record<string, unknown>;
      for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) assert.deepEqual(m[mk], mv, `${wo}: MobileErfassung.${mk}`);
      for (const mk of Object.keys(m)) {
        if (mk in (v as object)) continue;
        assert.ok(GEO.includes(mk) && m[mk] === null, `${wo}: MobileErfassung.${mk} = ${JSON.stringify(m[mk])} ist kein Hub-Leerwert`);
      }
      continue;
    }
    assert.deepEqual(ist[k], v, `${wo}: ${k}`);
  }
  for (const k of Object.keys(ist)) {
    if (k in soll) continue;
    assert.ok(k in HUB_VORGABE_OHNE_SCHLUESSEL, `${wo}: zusätzlicher Schlüssel ${k}`);
    assert.deepEqual(ist[k], HUB_VORGABE_OHNE_SCHLUESSEL[k], `${wo}: ${k} weicht von der Hub-Vorgabe ab`);
  }
}

test('Vertragsprobe: Paketfolge, Köpfe, Kennungen und Schlüssel wie `upload`', () => {
  const { pakete, elementIds } = baueHubPakete(geraetestand());
  assert.equal(pakete.length, vertrag.upload.length);

  // Paket 1: Neuanlage offline, Kopf exakt, Punkte je Schlüssel der Probe
  assert.deepEqual(pakete[0].ProtokollMeta, vertrag.upload[0].ProtokollMeta);
  assert.equal(pakete[0].Elemente.length, vertrag.upload[0].Elemente.length);
  vertrag.upload[0].Elemente.forEach((soll: Record<string, unknown>, i: number) =>
    vergleicheMitProbe(pakete[0].Elemente[i], soll, `Paket 1 Punkt ${i + 1}`));
  assert.equal('terms' in pakete[0], false);

  // Paket 2: Teilpaket am versendeten Protokoll — exakt, ohne Kopf
  assert.deepEqual(pakete[1], vertrag.upload[1]);

  assert.deepEqual(elementIds, [vertrag.upload[0].Elemente[0].Id, vertrag.upload[0].Elemente[1].Id, vertrag.upload[1].Elemente[0].Id]);
});

test('Kennungsregel: Hub-UUID vor OID vor lokaler UUID — an Punkt und Protokoll', () => {
  const p = prot({ id: 'lokal-p', legacy_id: 'OID-P', name: 'Baubesprechung 4', nummer: 4, datum: '2026-09-03T10:00:00', is_new: true });
  const elemente = [
    punkt({ id: 'lokal-1', legacy_id: 'OID-1', hub_id: 'hub-1', protokoll_id: 'lokal-p', position: '1', is_modified: true }),
    punkt({ id: 'lokal-2', legacy_id: 'OID-2', protokoll_id: 'lokal-p', position: '2', is_modified: true }),
    punkt({ id: 'lokal-3', protokoll_id: 'lokal-p', position: '3', is_new: true }),
  ];
  const { pakete } = baueHubPakete({ protokolle: [p], elemente });
  assert.deepEqual(pakete[0].Elemente.map(e => [e.Id, e.ProtokollId]), [
    ['hub-1', 'OID-P'], ['OID-2', 'OID-P'], ['lokal-3', 'OID-P'],
  ]);
  const mitHub = baueHubPakete({ protokolle: [{ ...p, hub_id: 'hub-p' }], elemente });
  assert.deepEqual(mitHub.pakete[0].Elemente.map(e => e.ProtokollId), ['hub-p', 'hub-p', 'hub-p']);
  assert.equal(hubKennung({ id: 'a', hub_id: '', legacy_id: '' }), 'a');
});

test('zweimal gebaut: dieselben Kennungen (keine neue UUID je Sendung)', () => {
  const eins = baueHubPakete(geraetestand());
  const zwei = baueHubPakete(geraetestand());
  const kennungen = (r: typeof eins) => r.pakete.flatMap(p => p.Elemente.map(e => `${e.ProtokollId}/${e.Id}`));
  assert.deepEqual(kennungen(eins), kennungen(zwei));
});

test('versendetes Protokoll: nur Status und Positionstext, kein Kopf — auch für neue Punkte', () => {
  const p = prot({ id: 'p', legacy_id: 'OID-P', name: 'Baubesprechung 3', nummer: 3, datum: '2026-09-01T10:00:00', is_new: false });
  const { pakete } = baueHubPakete({
    protokolle: [p],
    elemente: [
      punkt({ id: 'e', legacy_id: 'OID-E', protokoll_id: 'p', status: 20, positionstext: 'erledigt', bemerkung: 'neu', termin: '2026-09-30T00:00:00', is_modified: true }),
      punkt({ id: 'n', protokoll_id: 'p', positionstext: 'neu im versendeten', is_new: true }),
    ],
  });
  assert.deepEqual(pakete, [{ Elemente: [
    { Id: 'OID-E', ProtokollId: 'OID-P', Status: 20, Positionstext: 'erledigt' },
    { Id: 'n', ProtokollId: 'OID-P', Status: 0, Positionstext: 'neu im versendeten' },
  ] }]);
});

test('offenes Protokoll: Verortung, Fotos (Hub-Schlüssel), Notiz/Info/Thema-Kennung nur wenn bekannt, Terms am ersten Paket', () => {
  const p = prot({ id: 'p', name: 'Baubesprechung 5 - 2026', nummer: 5, datum: '2026-09-17T09:00:00', is_new: true });
  const { pakete } = baueHubPakete({
    protokolle: [p],
    terms: [{ client_uuid: 't1', name: 'Dach', synonyme: [] }],
    elemente: [
      punkt({
        id: 'a', protokoll_id: 'p', position: '1', is_new: true, notiz: 'N', info: '', thema_term_id: 't1',
        mobile_erfassung: { geo_lat: 50.1, geo_lon: 11.2, geo_accuracy: 5, geo_text: '50.1, 11.2 (5 m)', geo_heading: 90, geo_altitude: 300,
          fotos: [{ file_name: 'x.jpg', relative_path: 'photos/x.jpg', ziel_pfad: '' }] },
      }),
      punkt({ id: 'b', protokoll_id: 'p', position: '2', is_new: true }),
    ],
  });
  const [a, b] = pakete[0].Elemente;
  assert.deepEqual(a.MobileErfassung, {
    GeoLat: 50.1, GeoLon: 11.2, GeoAccuracy: 5, GeoText: '50.1, 11.2 (5 m)', GeoHeading: 90, GeoAltitude: 300,
    Fotos: [{ FileName: 'x.jpg', RelativePath: 'photos/x.jpg', ZielPfad: '' }],
  });
  assert.equal(a.Notiz, 'N');
  assert.equal(a.Info, '');
  assert.equal(a.ThemaTermId, 't1');
  assert.equal('Notiz' in b || 'Info' in b || 'ThemaTermId' in b, false);
  assert.deepEqual(pakete[0].terms, [{ client_uuid: 't1', name: 'Dach', synonyme: [] }]);
  assert.deepEqual(pakete[0].ProtokollMeta, { Name: 'Baubesprechung 5 - 2026', Nummer: 5, Datum: '17.09.2026 09:00:00' });
});

test('Punkt ohne Protokoll wird nicht gepackt', () => {
  const { pakete, elementIds } = baueHubPakete({ protokolle: [], elemente: [punkt({ id: 'w', protokoll_id: 'fehlt', is_new: true })] });
  assert.deepEqual(pakete, []);
  assert.deepEqual(elementIds, []);
});

test('Datum für den Hub (DocuFrame-Form, wie df_to_iso sie liest)', () => {
  assert.equal(zuDfDatum('2026-09-24T00:00:00'), '24.09.2026 00:00:00');
  assert.equal(zuDfDatum('2026-09-24'), '24.09.2026 00:00:00');
  assert.equal(zuDfDatum('2026-09-17T09:30'), '17.09.2026 09:30:00');
  assert.equal(zuDfDatum(''), '');
  assert.equal(zuDfDatum(undefined), '');
  assert.equal(zuDfDatum('17.09.2026 09:30:00'), '17.09.2026 09:30:00');
  const d = new Date('2026-09-17T07:12:34.000Z');
  const p = (n: number) => String(n).padStart(2, '0');
  assert.equal(zuDfDatum('2026-09-17T07:12:34.000Z'), `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
});
