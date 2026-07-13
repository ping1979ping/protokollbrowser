/**
 * Auth-Service: Hub-JWT-Login/Refresh/Logout fuer die Protokollbrowser-PWA (D-11).
 *
 * Ersetzt den frueheren Kuerzel-only-Stub: Feldnutzer sind echte Hub-User.
 * Access-/Refresh-Token liegen in localStorage; `syncService.fetchApi` haengt den
 * Bearer an jeden Sync-Call (ausser /health) und faengt einen 401 mit genau EINEM
 * Refresh + Retry ab (kein Endlos-Loop, T-06-06-02).
 *
 * Contract (bestaetigt gegen hub-server/backend/app/routers/auth.py + Live-Hub):
 *   POST {base}/api/auth/login    Body {identifier, password}
 *        -> {access_token, refresh_token, token_type, force_password_change}
 *   POST {base}/api/auth/refresh  Body {refresh_token}
 *        -> {access_token, refresh_token, ...}
 * `identifier` akzeptiert DocuFrame-Benutzername ODER E-Mail (Alias "email").
 * Access-Token ~15 min, Refresh-Token ~7 d (Hub-Config) — der 15-min-Ablauf auf
 * der Baustelle wird per Refresh abgefangen.
 */

import { getServerUrl } from './syncService';
import { getUserName, setUserName } from './deviceIdentity';

const ACCESS_KEY = 'hub-access-token';
const REFRESH_KEY = 'hub-refresh-token';
const AUTH_TIMEOUT_MS = 8000;

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

function storeTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}

/** Loescht die lokalen Tokens (Client-seitiger Logout). */
export function logout(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function postJson(path: string, body: unknown): Promise<Response> {
  const base = getServerUrl();
  if (!base) throw new Error('Kein Server konfiguriert');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Login gegen den Hub. Wirft bei falschen Zugangsdaten (401) oder Netzfehler.
 * Bei Erfolg werden Access+Refresh persistiert und der userName (fuer die
 * Protokoll-/Abo-Zuordnung) vorbelegt, falls noch leer.
 */
export async function login(username: string, password: string): Promise<void> {
  const resp = await postJson('/api/auth/login', {
    identifier: username.trim(),
    password,
  });
  if (resp.status === 401) {
    throw new Error('Benutzername oder Passwort falsch');
  }
  if (resp.status === 403) {
    throw new Error('Nutzerkonto ist deaktiviert');
  }
  if (!resp.ok) {
    throw new Error(`Login fehlgeschlagen: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  if (!data?.access_token || !data?.refresh_token) {
    throw new Error('Login-Antwort ohne Token');
  }
  storeTokens(data.access_token, data.refresh_token);
  if (!getUserName()) setUserName(username.trim());
}

/**
 * Erneuert Access+Refresh gegen den gespeicherten Refresh-Token.
 * true  = erneuert (neue Tokens persistiert).
 * false = Refresh endgueltig ungueltig -> logout() ausgefuehrt (definitiver
 *         Auth-Fehler); bei reinem Netzfehler ebenfalls false, aber OHNE Logout,
 *         damit der Refresh-Token fuer einen spaeteren Versuch erhalten bleibt.
 */
export async function refresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) {
    logout();
    return false;
  }
  let resp: Response;
  try {
    resp = await postJson('/api/auth/refresh', { refresh_token: rt });
  } catch {
    // Netzfehler (offline auf der Baustelle) -> Token behalten, spaeter erneut.
    return false;
  }
  if (!resp.ok) {
    // Server hat den Refresh-Token abgelehnt (abgelaufen/rotiert) -> Logout.
    logout();
    return false;
  }
  const data = await resp.json();
  if (!data?.access_token || !data?.refresh_token) {
    logout();
    return false;
  }
  storeTokens(data.access_token, data.refresh_token);
  return true;
}
