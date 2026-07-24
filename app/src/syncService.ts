/**
 * Sync-Service: PWA <-> Hub (Paritaets-Layer /api/protokoll-sync/*)
 *
 * Basis-URL = Hub-Origin (getServerUrl). Alle Sync-Pfade liegen unter dem
 * Prefix /api/protokoll-sync (D-10). Jeder Call ausser /health traegt einen
 * Hub-JWT (Authorization: Bearer). Ein 401 wird mit genau EINEM Refresh + Retry
 * abgefangen; bleibt es beim 401 -> sauberer Logout (T-06-06-02).
 */

import { importPakete, importVerantwortliche, getAllElemente, getAllGruppen, getProtokollgruppe, setSyncMeta, getPendingExports, deletePendingExport, importProjekte, importWertelisten, getWerteliste, importAdressen, importAnsprechpartner, upsertProjektThemen, getAdhocProjektThemen, remapThemaTermIds, updateGruppeRefs } from './db';
import { parseDfJson } from './dfimport';
import { parseProjekteJson, filterProjekteByStatus } from './projektimport';
import { parseAdressenJson } from './adressenimport';
import { getDeviceId, getDeviceName, getUserName } from './deviceIdentity';
import { getAccessToken, refresh, logout } from './authService';
import { waehleLegacyId } from './gruppenLegacyId';

const TIMEOUT_MS = 5000;
const UPLOAD_TIMEOUT_MS = 30000;

// Prefix des PWA-Paritaets-Layers im Hub (D-10). Die vier CRUD-Ressourcen der
// PWA bleiben logisch dieselben, werden aber unter diesem Namespace bedient.
const SYNC = '/api/protokoll-sync';

// Hub-REST-Basis fuer die user-scoped Abo-/Gruppen-Endpunkte (Plan 06.1-02).
// Diese liegen NEBEN dem Sync-Namespace direkt unter /api (nicht unter SYNC).
const API = '/api';

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

/**
 * Lokale PWA-Gruppen-UUID -> Hub-legacy_id (DF-OID) fuer die Export-/Sync-Pfade.
 * Der Hub loest {id} in /projects/{id}/export ueber Protokollgruppe.legacy_id auf
 * (quick-260720-m4x): eine geraetelokale UUID ergaebe sonst 404. PK-Lookup zuerst,
 * dann Voll-Scan als Fallback; ist der Wert bereits eine legacy_id (ServerImport-
 * Pfad), bleibt er unveraendert (Passthrough).
 */
export async function resolveGruppenLegacyId(projectId: string): Promise<string> {
  let treffer;
  try {
    treffer = await getProtokollgruppe(projectId);
  } catch {
    treffer = undefined;
  }
  // Voll-Scan nur, wenn der PK-Lookup keine legacy_id lieferte.
  let alle: Awaited<ReturnType<typeof getAllGruppen>> = [];
  if (!treffer || !treffer.legacy_id) {
    try {
      alle = await getAllGruppen();
    } catch {
      alle = [];
    }
  }
  // Reine Entscheidungskette (06.3-Review IN-04, testbar ohne IndexedDB).
  return waehleLegacyId(projectId, treffer ?? null, alle);
}

/** Projekt vom Server herunterladen und in IndexedDB importieren */
export async function downloadProject(projectId: string): Promise<void> {
  const legacyId = await resolveGruppenLegacyId(projectId);
  const resp = await fetchApi(`${SYNC}/projects/${encodeURIComponent(legacyId)}/export`, { timeoutMs: UPLOAD_TIMEOUT_MS });
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

  // 06.5-09 (§6.8): Projekt-Woerterbuch spiegeln. BEST-EFFORT — ein
  // Term-Sync-Fehler darf den Protokoll-Download NICHT abbrechen (die
  // Erfassung degradiert dann auf "kein Picker", nicht auf einen kaputten Sync).
  try {
    const refs = await resolveHubGruppeRefs(pakete[0].protokollgruppe.legacy_id);
    if (refs?.projekt_id) {
      await updateGruppeRefs(gruppeId, refs.projekt_id, refs.hub_id);
      await syncProjektThemen(refs.projekt_id);
    }
  } catch (e) {
    console.warn('[06.5-09] Woerterbuch-Sync uebersprungen:', e);
  }
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

/**
 * 06.5-09 (§6.8): Projekt-Woerterbuch vom Hub in den IndexedDB-Store
 * ``projektThemen`` spiegeln. Kanal = GET /api/projects/{id}/terms/sync
 * (06.5-02), Hub-Envelope { data: { terms, zuordnungen } }. Es werden ALLE
 * Projekt-Terms gespiegelt (nicht nur die offene Gruppe) — der Offline-
 * Abgleich laeuft projektweit. Immer via fetchApi (Bearer + 401-Refresh).
 */
export async function syncProjektThemen(projektId: string): Promise<void> {
  const resp = await fetchApi(`${API}/projects/${encodeURIComponent(projektId)}/terms/sync`);
  const body = await resp.json();
  const data = (body?.data ?? body ?? {}) as { terms?: unknown[]; zuordnungen?: unknown[] };
  await upsertProjektThemen(
    projektId,
    (data.terms ?? []) as Parameters<typeof upsertProjektThemen>[1],
    (data.zuordnungen ?? []) as Parameters<typeof upsertProjektThemen>[2],
  );
}

/**
 * Hub-Referenzen einer Gruppe (Projekt-UUID + Gruppen-UUID) ueber die
 * legacy_id aufloesen. Der /api/protokollgruppen-Katalog traegt ``projekt_id``
 * bereits (ProtokollgruppeRead) — rein clientseitige Bruecke, KEIN neuer Endpunkt.
 */
export async function resolveHubGruppeRefs(
  legacyId: string,
): Promise<{ projekt_id?: string; hub_id: string } | null> {
  if (!legacyId) return null;
  const alle = await listHubGruppen();
  const treffer = alle.find(g => g.legacy_id === legacyId);
  if (!treffer) return null;
  return { projekt_id: treffer.projekt_id, hub_id: treffer.id };
}

/**
 * Offline angelegte Ad-hoc-Terms eines Projekts als hubToDf-Paket-Addon fuer
 * den Upload (§6.8). Shape exakt wie von der Hub-Reconciliation (06.5-06)
 * erwartet: { ProtokollMeta, Elemente:[], terms:[{client_uuid, name, synonyme}] }.
 * ``_iter_pakete`` akzeptiert es (ProtokollMeta/Elemente-Keys vorhanden), die
 * Elemente-Liste ist leer (Elemente reiten im normalen Export), die Terms
 * werden VOR den Elementen auf name_norm gemergt und liefern das term_remap.
 * ``null``, wenn keine Ad-hoc-Terms vorliegen (dann kein Addon anhaengen).
 */
export async function collectOfflineTermsPaket(
  projektId: string,
): Promise<Record<string, unknown> | null> {
  const adhoc = await getAdhocProjektThemen(projektId);
  if (adhoc.length === 0) return null;
  return {
    ProtokollMeta: {},
    Elemente: [],
    terms: adhoc.map(t => ({
      client_uuid: t.id,
      name: t.name,
      synonyme: t.synonyme ?? [],
    })),
  };
}

/** Report des ZIP-Uploads (Hub-Envelope-Daten). */
export interface UploadReport {
  status?: string;
  written?: number;
  skipped?: number;
  term_remap?: Record<string, string>;
  [k: string]: unknown;
}

/** ZIP-Datei (JSON + Fotos) an den Server hochladen. Wendet danach das
 * ``term_remap`` (§6.8) STILL auf die lokalen thema_term_ids an. */
export async function uploadZip(gruppeId: string, zipBlob: Blob, filename: string): Promise<UploadReport> {
  const formData = new FormData();
  formData.append('file', zipBlob, filename);
  const resp = await fetchApi(`${SYNC}/projects/${gruppeId}/upload-zip`, {
    method: 'POST',
    body: formData,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
  // 06.5-09 (§6.8): Hub-Envelope entpacken; term_remap {client_uuid ->
  // kanonische id} auf die lokalen IndexedDB-thema_term_ids anwenden und die
  // Verlierer-Terms verwerfen — STILL, kein Nutzer-Dialog. Best-effort: ein
  // Remap-Fehler kippt den Upload-Erfolg nicht (Terms serverseitig konsolidiert).
  let report: UploadReport = {};
  try {
    const body = await resp.json();
    report = (body?.data ?? body ?? {}) as UploadReport;
    const remap = report.term_remap;
    if (remap && Object.keys(remap).length > 0) {
      await remapThemaTermIds(remap);
    }
  } catch (e) {
    console.warn('[06.5-09] term_remap uebersprungen:', e);
  }
  return report;
}

/**
 * Abonnierte Projekte (Geraete-Sync-Scope) vom Server laden. `projects` wird
 * serverseitig aus den User-Abos abgeleitet (Hub-Phase 06.1, Plan 02) — der
 * Response-Shape `data.projects` (legacy_id-Liste) bleibt byte-identisch.
 */
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

// ===================================================================
// User-scoped Protokoll-Abos (Plan 06.1-06, Hub-JWT).
// „Meine Protokolle" ist jetzt user-basiert und geraeteuebergreifend identisch
// mit dem Hub-Desktop. Die Abo-Endpunkte adressieren die Hub-UUID der
// Protokollgruppe (Protokollgruppe.id) — NICHT die lokale PWA-gruppe.id. Die
// Aufloesung local -> legacy_id -> Hub-UUID uebernimmt der aboStore;
// listHubGruppen() liefert dafuer die Zuordnung id <-> legacy_id.
// ===================================================================

/** Hub-Protokollgruppe (Zuordnungsquelle): id = Hub-UUID, legacy_id = DF-OID. */
export interface HubGruppe {
  id: string;
  legacy_id: string;
  name?: string;
  projekt_nummer?: string;
  projekt_name?: string;
  // 06.5-09: das Katalog-Read (ProtokollgruppeRead) traegt projekt_id bereits —
  // rein clientseitige Bruecke legacy_id -> Hub-Projekt-UUID (kein neuer Endpunkt).
  projekt_id?: string;
}

/**
 * Katalog aller Hub-Protokollgruppen (durchpaginiert). Liefert id (Hub-UUID)
 * UND legacy_id — die Bruecke von der lokalen PWA-Gruppe (kennt nur legacy_id)
 * auf die Hub-UUID, die die Abo-Endpunkte erwarten.
 */
export async function listHubGruppen(): Promise<HubGruppe[]> {
  const alle: HubGruppe[] = [];
  for (let page = 1; page <= 50; page++) {
    const resp = await fetchApi(`${API}/protokollgruppen?page=${page}&size=100`);
    const body = await resp.json();
    const items: HubGruppe[] = Array.isArray(body?.data) ? body.data : [];
    alle.push(...items);
    const total: number = body?.meta?.total ?? alle.length;
    if (items.length === 0 || alle.length >= total) break;
  }
  return alle;
}

/**
 * Neue Protokollgruppe im Hub anlegen (SC-3: EIN Anlage-Endpoint fuer Desktop
 * UND PWA — POST /api/protokollgruppen). `fetchApi` kapselt Bearer-Token +
 * 401-Refresh+Retry; NIE roher fetch. Es gehen ausschliesslich
 * name/projekt_nummer/vorwort an den Server — `quelle`/`vorlageId` der PWA-Sheet
 * haben KEIN Backend-Gegenstueck (D-02-Andockpunkt) und werden bewusst NICHT
 * durchgereicht (RULE-2/Param-Drift-Schutz). `projekt_nummer` erzwingt den
 * Projekt-Bezug — eine Gruppe ohne Projekt waere verwaist (Anti-Pattern).
 */
export async function createGruppe(payload: { name: string; projekt_nummer: string; vorwort?: string; besprechungstyp?: string }): Promise<HubGruppe> {
  const resp = await fetchApi(`${API}/protokollgruppen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await resp.json();
  return body.data; // Hub-Envelope { data, meta, errors } entpacken
}

/** Ein User-Abo (Hub-Envelope entpackt): gruppe_id = Hub-UUID. */
export interface UserAbo {
  gruppe_id: string;
  sort_order: number;
  name?: string;
  projekt_name?: string | null;
  projekt_nummer?: string | null;
}

/** Abos des eingeloggten MA (bereits serverseitig nach sort_order sortiert). */
export async function listUserAbos(): Promise<UserAbo[]> {
  const resp = await fetchApi(`${API}/protokoll-abos`);
  const body = await resp.json();
  return Array.isArray(body?.data) ? body.data : [];
}

/** Gruppe abonnieren (idempotent). gruppeId = Hub-UUID. */
export async function addUserAbo(gruppeId: string): Promise<void> {
  await fetchApi(`${API}/protokoll-abos/${encodeURIComponent(gruppeId)}`, { method: 'PUT' });
}

/** Abo entfernen (nur die eigene Zeile). gruppeId = Hub-UUID. */
export async function removeUserAbo(gruppeId: string): Promise<void> {
  await fetchApi(`${API}/protokoll-abos/${encodeURIComponent(gruppeId)}`, { method: 'DELETE' });
}

/** Reihenfolge der eigenen Abos setzen (fremde/unbekannte IDs ignoriert der Server). */
export async function reorderUserAbos(gruppeIds: string[]): Promise<void> {
  await fetchApi(`${API}/protokoll-abos/reihenfolge`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gruppe_ids: gruppeIds }),
  });
}

/** Sync: Nur Download vom Server (Upload nur über manuellen ZIP-Export) */
export async function syncProject(gruppeId: string): Promise<{ downloaded: boolean }> {
  // quick-260720-m4x: Fehler NICHT mehr schlucken. Der Aufrufer (useSyncStatus)
  // braucht ihn, um syncError zu setzen und lastSync NICHT faelschlich zu
  // aktualisieren. downloadProject setzt bei Erfolg bereits die Sync-Meta.
  await downloadProject(gruppeId);

  await setSyncMeta({
    gruppeId,
    serverUrl: getServerUrl(),
    lastSync: new Date().toISOString(),
    autoSync: true,
  });

  return { downloaded: true };
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
