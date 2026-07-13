/**
 * Sync-Service: PWA <-> Hub (Paritaets-Layer /api/protokoll-sync/*)
 *
 * Basis-URL = Hub-Origin (getServerUrl). Alle Sync-Pfade liegen unter dem
 * Prefix /api/protokoll-sync (D-10). Jeder Call ausser /health traegt einen
 * Hub-JWT (Authorization: Bearer). Ein 401 wird mit genau EINEM Refresh + Retry
 * abgefangen; bleibt es beim 401 -> sauberer Logout (T-06-06-02).
 */

import { importPakete, importVerantwortliche, getAllElemente, setSyncMeta, getPendingExports, deletePendingExport, importProjekte, importWertelisten, getWerteliste, importAdressen, importAnsprechpartner } from './db';
import { parseDfJson } from './dfimport';
import { parseProjekteJson, filterProjekteByStatus } from './projektimport';
import { parseAdressenJson } from './adressenimport';
import { getDeviceId, getDeviceName, getUserName } from './deviceIdentity';
import { getAccessToken, refresh, logout } from './authService';

const TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;

// Prefix des PWA-Paritaets-Layers im Hub (D-10). Die vier CRUD-Ressourcen der
// PWA bleiben logisch dieselben, werden aber unter diesem Namespace bedient.
const SYNC = '/api/protokoll-sync';

// Server-URL aus localStorage
const STORAGE_KEY = 'sync-server-url';

export function getServerUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  // Wenn vom Hub ausgeliefert (nicht GitHub Pages), eigene Origin als Server verwenden.
  // GitHub Pages hat base='/protokollbrowser/', Server-Build hat base='./'
  if (!location.pathname.startsWith('/protokollbrowser')) {
    return location.origin;
  }
  return '';
}

export function setServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

/** Ein einzelner Fetch-Versuch mit optionalem Bearer-Token + Timeout. */
async function doFetch(path: string, options: (RequestInit & { timeoutMs?: number }) | undefined, token: string | null): Promise<Response> {
  const url = getServerUrl();
  if (!url) throw new Error('Kein Server konfiguriert');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? TIMEOUT_MS);

  try {
    const headers = new Headers(options?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return await fetch(`${url}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch gegen den Hub mit Hub-JWT. /health bleibt offen (Konnektivitaet).
 * 401 -> einmal refresh() -> Retry; zweiter 401 -> logout() + Fehler.
 */
async function fetchApi(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const skipAuth = path.includes('/health');

  let resp = await doFetch(path, options, skipAuth ? null : getAccessToken());

  if (!skipAuth && resp.status === 401) {
    const refreshed = await refresh();
    if (refreshed) {
      resp = await doFetch(path, options, getAccessToken());
    }
    if (resp.status === 401) {
      logout();
      throw new Error('Nicht authentifiziert - bitte neu anmelden (401)');
    }
  }

  if (!resp.ok) {
    throw new Error(`Server-Fehler: ${resp.status} ${resp.statusText}`);
  }
  return resp;
}

/** Verbindungstest (ohne Auth) */
export async function checkConnectivity(): Promise<boolean> {
  try {
    const resp = await fetchApi(`${SYNC}/health`);
    const data = await resp.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/** Verfuegbare Projekte vom Server (Hub-Envelope) */
export async function listRemoteProjects(): Promise<{
  id: string;
  projektName?: string;
  gruppeName?: string;
  projektNummer?: string;
  timestamp?: string;
  hasExport: boolean;
  pendingChanges: number;
}[]> {
  const resp = await fetchApi(`${SYNC}/projects`);
  const json = await resp.json();
  // Hub-Envelope: { data: [...], meta: {...}, errors: [] }
  // Fallback: direktes Array (alter Server ohne Envelope)
  const list = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
  return list;
}

/** Projekt vom Server herunterladen und in IndexedDB importieren */
export async function downloadProject(projectId: string): Promise<void> {
  const resp = await fetchApi(`${SYNC}/projects/${projectId}/export`, { timeoutMs: UPLOAD_TIMEOUT_MS });
  const raw = await resp.json();
  const { pakete, verantwortliche } = parseDfJson(raw);
  if (pakete.length === 0) throw new Error('Keine Protokolle in den Server-Daten');

  await importPakete(pakete);
  if (verantwortliche.length > 0) await importVerantwortliche(verantwortliche);

  // Alte PendingExports dieser Gruppe aufräumen (Daten sind jetzt im Server)
  const gruppeId = pakete[0].protokollgruppe.id;
  try {
    const pending = await getPendingExports();
    for (const exp of pending) {
      if (exp.gruppeId === gruppeId) await deletePendingExport(exp.id);
    }
  } catch { /* ignore */ }

  // Sync-Meta aktualisieren
  await setSyncMeta({
    gruppeId,
    serverUrl: getServerUrl(),
    lastSync: new Date().toISOString(),
    autoSync: true,
  });
}

/**
 * Geänderte/neue Elemente hochladen.
 * Hinweis: Der reale Hub-Upload laeuft ueber uploadZip (ZIP + Exactly-Once-Journal);
 * dieser JSON-/sync-Pfad ist Altbestand (kein aktiver Aufrufer) und existiert
 * Hub-seitig NICHT als Endpunkt — bleibt nur namespaced fuer Vollstaendigkeit.
 */
export async function uploadChanges(gruppeId: string): Promise<number> {
  const alle = await getAllElemente();
  const geaendert = alle.filter(e => e.is_modified || e.is_new);

  if (geaendert.length === 0) return 0;

  const changes = {
    deviceId: getDeviceId(),
    userName: getUserName(),
    gruppeId,
    timestamp: new Date().toISOString(),
    elemente: geaendert,
  };

  await fetchApi(`${SYNC}/projects/${gruppeId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });

  return geaendert.length;
}

/** Sync-Status eines Projekts vom Server abfragen (Hub-Envelope) */
export async function getRemoteStatus(projectId: string): Promise<{
  lastExport?: string;
  pendingChanges: number;
  lastUpload?: string;
}> {
  const resp = await fetchApi(`${SYNC}/projects/${projectId}/status`);
  const json = await resp.json();
  return json.data ?? json;
}

/** ZIP-Datei (JSON + Fotos) an den Server hochladen */
export async function uploadZip(gruppeId: string, zipBlob: Blob, filename: string): Promise<void> {
  const formData = new FormData();
  formData.append('file', zipBlob, filename);
  await fetchApi(`${SYNC}/projects/${gruppeId}/upload-zip`, {
    method: 'POST',
    body: formData,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/** Abonnierte Projekte vom Server laden */
export async function getSubscriptions(): Promise<string[]> {
  try {
    const resp = await fetchApi(`${SYNC}/subscriptions/${getDeviceId()}`);
    const data = await resp.json();
    return data.projects || [];
  } catch {
    return [];
  }
}

/** Projekt-Abos auf dem Server speichern */
export async function saveSubscriptions(projectIds: string[]): Promise<void> {
  await fetchApi(`${SYNC}/subscriptions/${getDeviceId()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: getUserName(),
      deviceName: getDeviceName(),
      projects: projectIds,
    }),
  });
}

/** Sync: Nur Download vom Server (Upload nur über manuellen ZIP-Export) */
export async function syncProject(gruppeId: string): Promise<{ downloaded: boolean }> {
  let downloaded = false;
  try {
    await downloadProject(gruppeId);
    downloaded = true;
  } catch {
    // Export möglicherweise nicht vorhanden
  }

  await setSyncMeta({
    gruppeId,
    serverUrl: getServerUrl(),
    lastSync: new Date().toISOString(),
    autoSync: true,
  });

  return { downloaded };
}

/** Projekt-Katalog vom Server laden, filtern und in IndexedDB importieren */
export async function downloadProjectCatalog(): Promise<{ total: number; imported: number }> {
  const resp = await fetchApi(`${SYNC}/projects-catalog`, { timeoutMs: UPLOAD_TIMEOUT_MS });
  const raw = await resp.json();

  if (!Array.isArray(raw)) {
    throw new Error('Projekt-Katalog: Ungueltiges Format (kein Array)');
  }

  const { projekte, wertelisten } = parseProjekteJson(raw);

  // Wertelisten zuerst importieren (wird fuer Filter benoetigt)
  if (wertelisten.length > 0) {
    await importWertelisten(wertelisten);
  }

  // Status-Filter: nur "in Arbeit" + "Gewaehrleistung"
  const statusWerteliste = await getWerteliste('Projekt', '_IMSStatus');
  const filtered = filterProjekteByStatus(
    projekte,
    ['in Arbeit', 'Gewährleistung'],
    statusWerteliste,
  );

  await importProjekte(filtered);
  return { total: projekte.length, imported: filtered.length };
}

/** Adressen-Katalog vom Server laden und in IndexedDB importieren */
export async function downloadAddressCatalog(): Promise<{ adressen: number; ansprechpartner: number }> {
  const resp = await fetchApi(`${SYNC}/addresses-catalog`, { timeoutMs: UPLOAD_TIMEOUT_MS });
  const raw = await resp.json();

  if (!Array.isArray(raw)) {
    throw new Error('Adressen-Katalog: Ungueltiges Format (kein Array)');
  }

  const { adressen, ansprechpartner, wertelisten } = parseAdressenJson(raw);

  if (wertelisten.length > 0) {
    await importWertelisten(wertelisten);
  }

  await importAdressen(adressen);
  await importAnsprechpartner(ansprechpartner);
  return { adressen: adressen.length, ansprechpartner: ansprechpartner.length };
}
