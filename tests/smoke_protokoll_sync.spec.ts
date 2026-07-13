import { test, expect, request, type APIRequestContext } from '@playwright/test';

/**
 * API-Smoke: Protokollbrowser-PWA gegen den Hub (Phase 06-06).
 *
 * Belegt die Kette Login -> health -> projects -> Kataloge -> export (-> upload)
 * gegen /api/protokoll-sync/* mit Hub-JWT, exakt wie syncService.fetchApi sie
 * aufruft (Bearer-Header, Envelope/RAW je Endpunkt).
 *
 * GPS/Kamera werden bewusst NICHT getestet (dev-HTTP ist kein Secure-Context, A6);
 * die echte Geraete-Verifikation ist Welle-0/Gate-G0 (Phase 07, HTTPS I-4).
 *
 * Voraussetzung: laufender Hub unter HUB_BASE_URL (Default http://localhost).
 * Ausfuehren:  npx playwright test tests/smoke_protokoll_sync.spec.ts
 *   (benoetigt die devDependency @playwright/test; sie ist NICHT Teil des
 *    PWA-Builds und wird bewusst nicht in package.json aufgenommen. Der Inhalt
 *    dieses Smokes wurde in 06-06 zusaetzlich per curl gegen den Live-Hub belegt.)
 */

const BASE = process.env.HUB_BASE_URL ?? 'http://localhost';
const SYNC = '/api/protokoll-sync';
const USER = process.env.HUB_TEST_USER ?? 'test@pettering.de';
const PASS = process.env.HUB_TEST_PASS ?? 'test123456';

async function newCtx(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE });
}

async function loginToken(api: APIRequestContext): Promise<string> {
  const resp = await api.post('/api/auth/login', {
    data: { identifier: USER, password: PASS },
  });
  expect(resp.status(), 'Login sollte 200 liefern').toBe(200);
  const body = await resp.json();
  expect(body.access_token, 'Login-Antwort enthaelt access_token').toBeTruthy();
  return body.access_token as string;
}

test('health ist ohne Token erreichbar (200, status ok)', async () => {
  const api = await newCtx();
  try {
    const resp = await api.get(`${SYNC}/health`);
    expect(resp.status()).toBe(200);
    expect((await resp.json()).status).toBe('ok');
  } finally {
    await api.dispose();
  }
});

test('projects ohne Token -> 401 (JWT-Pflicht)', async () => {
  const api = await newCtx();
  try {
    const resp = await api.get(`${SYNC}/projects`);
    expect(resp.status()).toBe(401);
  } finally {
    await api.dispose();
  }
});

test('Login -> projects (Envelope) -> Kataloge -> export gegen den Hub', async () => {
  const api = await newCtx();
  try {
    const token = await loginToken(api);
    const headers = { Authorization: `Bearer ${token}` };

    // projects: Hub-Envelope { data: [...] }
    const projResp = await api.get(`${SYNC}/projects`, { headers });
    expect(projResp.status()).toBe(200);
    const projJson = await projResp.json();
    const list = Array.isArray(projJson) ? projJson : projJson.data;
    expect(Array.isArray(list), 'projects liefert Liste (Envelope.data)').toBeTruthy();

    // Kataloge: RAW-Arrays (parser-kompatibel: parseProjekteJson / parseAdressenJson)
    const projCat = await api.get(`${SYNC}/projects-catalog`, { headers });
    expect(projCat.status()).toBe(200);
    expect(Array.isArray(await projCat.json()), 'projects-catalog ist ein Array').toBeTruthy();

    const addrCat = await api.get(`${SYNC}/addresses-catalog`, { headers });
    expect(addrCat.status()).toBe(200);
    expect(Array.isArray(await addrCat.json()), 'addresses-catalog ist ein Array').toBeTruthy();

    // export: nur wenn eine Protokollgruppe vorhanden ist (P2-Import gate-abhaengig);
    // sonst wird 404 toleriert + geloggt.
    if (list.length > 0) {
      const id = list[0].id;
      const expResp = await api.get(`${SYNC}/projects/${id}/export`, { headers });
      expect([200, 404]).toContain(expResp.status());
      if (expResp.status() === 200) {
        expect(Array.isArray(await expResp.json()), 'export = DF-hierarchical-Array (parseDfJson)').toBeTruthy();
      }
    } else {
      console.warn('[smoke] keine Protokollgruppen im Hub (P2-Import gate-abhaengig) - export uebersprungen');
    }
  } finally {
    await api.dispose();
  }
});
