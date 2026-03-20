/**
 * Sync-Service: PWA ↔ Exchange Server
 */

import { importPakete, importVerantwortliche, getAllElemente, setSyncMeta } from './db';
import { parseDfJson } from './dfimport';
import { getDeviceId, getDeviceName, getUserName } from './deviceIdentity';

const TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;

// Server-URL aus localStorage
const STORAGE_KEY = 'sync-server-url';

export function getServerUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  // Wenn vom Exchange-Server geladen (nicht GitHub Pages), eigene Origin als Server verwenden
  // GitHub Pages hat base='/protokollbrowser/', Server-Build hat base='./'
  if (!location.pathname.startsWith('/protokollbrowser')) {
    return location.origin;
  }
  return '';
}

export function setServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ''));
}

async function fetchApi(path: string, options?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  const url = getServerUrl();
  if (!url) throw new Error('Kein Server konfiguriert');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? TIMEOUT_MS);

  try {
    const resp = await fetch(`${url}${path}`, {
      ...options,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Server-Fehler: ${resp.status} ${resp.statusText}`);
    }
    return resp;
  } finally {
    clearTimeout(timeout);
  }
}

/** Verbindungstest */
export async function checkConnectivity(): Promise<boolean> {
  try {
    const resp = await fetchApi('/api/health');
    const data = await resp.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
}

/** Verfügbare Projekte vom Server */
export async function listRemoteProjects(): Promise<{
  id: string;
  projektName?: string;
  gruppeName?: string;
  timestamp?: string;
  hasExport: boolean;
  pendingChanges: number;
}[]> {
  const resp = await fetchApi('/api/projects');
  return resp.json();
}

/** Projekt vom Server herunterladen und in IndexedDB importieren */
export async function downloadProject(projectId: string): Promise<void> {
  const resp = await fetchApi(`/api/projects/${projectId}/export`);
  const raw = await resp.json();
  const { pakete, verantwortliche } = parseDfJson(raw);
  if (pakete.length === 0) throw new Error('Keine Protokolle in den Server-Daten');

  await importPakete(pakete);
  if (verantwortliche.length > 0) await importVerantwortliche(verantwortliche);

  // Sync-Meta aktualisieren
  const gruppeId = pakete[0].Protokollgruppe.Id;
  await setSyncMeta({
    gruppeId,
    serverUrl: getServerUrl(),
    lastSync: new Date().toISOString(),
    autoSync: true,
  });
}

/** Geänderte/neue Elemente hochladen */
export async function uploadChanges(gruppeId: string): Promise<number> {
  const alle = await getAllElemente();
  const geaendert = alle.filter(e => e._geaendert || e._neu);

  if (geaendert.length === 0) return 0;

  const changes = {
    deviceId: getDeviceId(),
    userName: getUserName(),
    gruppeId,
    timestamp: new Date().toISOString(),
    elemente: geaendert,
  };

  await fetchApi(`/api/projects/${gruppeId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });

  return geaendert.length;
}

/** Sync-Status eines Projekts vom Server abfragen */
export async function getRemoteStatus(projectId: string): Promise<{
  lastExport?: string;
  pendingChanges: number;
  lastUpload?: string;
}> {
  const resp = await fetchApi(`/api/projects/${projectId}/status`);
  return resp.json();
}

/** ZIP-Datei (JSON + Fotos) an den Server hochladen */
export async function uploadZip(gruppeId: string, zipBlob: Blob, filename: string): Promise<void> {
  const formData = new FormData();
  formData.append('file', zipBlob, filename);
  await fetchApi(`/api/projects/${gruppeId}/upload-zip`, {
    method: 'POST',
    body: formData,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/** Abonnierte Projekte vom Server laden */
export async function getSubscriptions(): Promise<string[]> {
  try {
    const resp = await fetchApi(`/api/subscriptions/${getDeviceId()}`);
    const data = await resp.json();
    return data.projects || [];
  } catch {
    return [];
  }
}

/** Projekt-Abos auf dem Server speichern */
export async function saveSubscriptions(projectIds: string[]): Promise<void> {
  await fetchApi(`/api/subscriptions/${getDeviceId()}`, {
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
