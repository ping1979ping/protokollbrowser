import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Protokollgruppe, Protokoll, Protokollelement, ProtokollPaket, Projekt, Werteliste, Adresse, Ansprechpartner } from './types';

const DB_NAME = 'protokoll-app';
const DB_VERSION = 9;

export interface ProtokollMitGruppe extends Protokoll {
  gruppe_id: string;
}

export interface Verantwortlicher {
  id: string;
  legacy_id: string;
  kuerzel: string;
  name: string;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, tx) {
      // Bei jedem Schema-Upgrade: Stores neu anlegen
      // v6: Hub-konforme Feldnamen (snake_case, UUID, legacy_id)
      if (oldVersion < 6) {
        // Alte Stores loeschen falls vorhanden
        for (const name of Array.from(db.objectStoreNames)) {
          if (['protokollgruppen', 'protokolle', 'elemente', 'fotos', 'verantwortliche'].includes(name)) {
            db.deleteObjectStore(name);
          }
        }

        db.createObjectStore('protokollgruppen', { keyPath: 'id' });
        const protStore = db.createObjectStore('protokolle', { keyPath: 'id' });
        protStore.createIndex('byGruppe', 'gruppe_id');
        const elemStore = db.createObjectStore('elemente', { keyPath: 'id' });
        elemStore.createIndex('byProtokoll', 'protokoll_id');
        const fotoStore = db.createObjectStore('fotos', { keyPath: 'fotoId' });
        fotoStore.createIndex('byElement', 'elementId');
        db.createObjectStore('verantwortliche', { keyPath: 'id' });
      }
      // v7: legacy_id Indexes fuer Dedup bei Re-Import
      if (oldVersion < 7) {
        const storesForLegacyIdx = ['protokollgruppen', 'protokolle', 'elemente', 'verantwortliche'];
        for (const storeName of storesForLegacyIdx) {
          if (db.objectStoreNames.contains(storeName)) {
            const store = tx.objectStore(storeName);
            if (!store.indexNames.contains('byLegacyId')) {
              store.createIndex('byLegacyId', 'legacy_id');
            }
          }
        }
      }
      // v8: Projekt-Katalog + Wertelisten Stores
      if (oldVersion < 8) {
        if (!db.objectStoreNames.contains('projekte')) {
          const projStore = db.createObjectStore('projekte', { keyPath: 'id' });
          projStore.createIndex('byLegacyId', 'legacy_id');
          projStore.createIndex('byNummer', 'nummer');
        }
        if (!db.objectStoreNames.contains('wertelisten')) {
          const wlStore = db.createObjectStore('wertelisten', { keyPath: 'id' });
          wlStore.createIndex('byKlasseFeld', ['klasse', 'feld']);
        }
      }
      // v9: Adressen + Ansprechpartner Stores
      if (oldVersion < 9) {
        if (!db.objectStoreNames.contains('adressen')) {
          const adrStore = db.createObjectStore('adressen', { keyPath: 'id' });
          adrStore.createIndex('byLegacyId', 'legacy_id');
          adrStore.createIndex('byKuerzel', 'kuerzel');
          adrStore.createIndex('byName1', 'name1');
          adrStore.createIndex('byKlasse', 'klasse');
        }
        if (!db.objectStoreNames.contains('ansprechpartner')) {
          const aspStore = db.createObjectStore('ansprechpartner', { keyPath: 'id' });
          aspStore.createIndex('byLegacyId', 'legacy_id');
          aspStore.createIndex('byParentOid', 'parent_oid');
          aspStore.createIndex('byKuerzel', 'kuerzel');
        }
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'gruppeId' });
      }
      if (!db.objectStoreNames.contains('pendingExports')) {
        db.createObjectStore('pendingExports', { keyPath: 'id' });
      }
    },
  });
}

export async function importPakete(pakete: ProtokollPaket[]): Promise<void> {
  const db = await getDb();

  // Dedup: legacy_id → bestehende UUID Mappings laden
  const gruppenMap = await buildLegacyIdMap(db, 'protokollgruppen');
  const protMap = await buildLegacyIdMap(db, 'protokolle');
  const elemMap = await buildLegacyIdMap(db, 'elemente');

  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente'], 'readwrite');
  for (const paket of pakete) {
    // Gruppe: bestehende UUID wiederverwenden
    const existingGruppeId = gruppenMap.get(paket.protokollgruppe.legacy_id);
    if (existingGruppeId) paket.protokollgruppe.id = existingGruppeId;

    await tx.objectStore('protokollgruppen').put(paket.protokollgruppe);

    // Protokoll: bestehende UUID wiederverwenden
    const existingProtId = protMap.get(paket.protokoll.legacy_id);
    if (existingProtId) paket.protokoll.id = existingProtId;

    const protMitGruppe: ProtokollMitGruppe = { ...paket.protokoll, gruppe_id: paket.protokollgruppe.id };
    await tx.objectStore('protokolle').put(protMitGruppe);

    for (const elem of paket.protokollelemente) {
      // Element: bestehende UUID wiederverwenden
      const existingElemId = elemMap.get(elem.legacy_id);
      if (existingElemId) {
        // Lokale Flags bewahren
        const existing = await tx.objectStore('elemente').get(existingElemId);
        if (existing?.is_modified) elem.is_modified = true;
        if (existing?.is_new) elem.is_new = true;
        elem.id = existingElemId;
      }
      // protokoll_id auf (evtl. korrigierte) Protokoll-UUID setzen
      elem.protokoll_id = paket.protokoll.id;
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

async function buildLegacyIdMap(db: IDBPDatabase, storeName: string): Promise<Map<string, string>> {
  const all = await db.getAll(storeName);
  const map = new Map<string, string>();
  for (const obj of all as Array<{ id: string; legacy_id?: string }>) {
    if (obj.legacy_id) {
      map.set(obj.legacy_id, obj.id);
    }
  }
  return map;
}

export async function importVerantwortliche(firmen: Verantwortlicher[]): Promise<void> {
  const db = await getDb();
  const verantwMap = await buildLegacyIdMap(db, 'verantwortliche');
  const tx = db.transaction('verantwortliche', 'readwrite');
  for (const f of firmen) {
    const existingId = verantwMap.get(f.legacy_id);
    if (existingId) f.id = existingId;
    await tx.objectStore('verantwortliche').put(f);
  }
  await tx.done;
}

export async function getVerantwortliche(): Promise<Verantwortlicher[]> {
  const db = await getDb();
  return db.getAll('verantwortliche');
}

export async function getAllGruppen(): Promise<Protokollgruppe[]> {
  const db = await getDb();
  return db.getAll('protokollgruppen');
}

export async function getProtokollgruppe(id: string): Promise<Protokollgruppe | undefined> {
  const db = await getDb();
  return db.get('protokollgruppen', id);
}

export async function getProtokolleByGruppe(gruppeId: string): Promise<ProtokollMitGruppe[]> {
  const db = await getDb();
  return db.getAllFromIndex('protokolle', 'byGruppe', gruppeId);
}

export async function getOrCreateDraftProtokoll(
  gruppeId: string,
  basierend: { name: string; ort: string; autor: string },
): Promise<ProtokollMitGruppe> {
  const prots = await getProtokolleByGruppe(gruppeId);
  const draft = prots.find(p => (p as ProtokollMitGruppe & { is_new?: boolean }).is_new);
  if (draft) return draft;

  const maxNummer = prots.reduce((max, p) => Math.max(max, p.nummer), 0);
  const neueNummer = maxNummer + 1;
  const nameBase = basierend.name.replace(/\s*\d+\s*[-–]\s*\d+$/, '').replace(/\s*\d+$/, '');
  const jahr = new Date().getFullYear();
  const now = new Date().toISOString();

  const neuProt: ProtokollMitGruppe = {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    created_by: null,
    object_type: 'protokoll',
    legacy_id: '',
    name: `${nameBase} ${neueNummer} - ${jahr}`,
    nummer: neueNummer,
    datum: now,
    ort: basierend.ort,
    autor: basierend.autor,
    vorbemerkung: '',
    nachbemerkung: '',
    erledigt: false,
    ist_einzelprotokoll: false,
    erstellt: false,
    signatur: '',
    teilnehmer: [],
    verteiler: [],
    gruppe_id: gruppeId,
    is_new: true,
  };

  const db = await getDb();
  await db.put('protokolle', neuProt);
  console.log('[Draft] Neues Protokoll erstellt:', neuProt.name, 'Nr.', neuProt.nummer, 'Id:', neuProt.id);
  return neuProt;
}

export async function getProtokolle(): Promise<ProtokollMitGruppe[]> {
  const db = await getDb();
  return db.getAll('protokolle');
}

export async function getElemente(protokollId: string): Promise<Protokollelement[]> {
  const db = await getDb();
  return db.getAllFromIndex('elemente', 'byProtokoll', protokollId);
}

export async function updateElement(element: Protokollelement): Promise<void> {
  const db = await getDb();
  await db.put('elemente', element);
}

export async function addElement(element: Protokollelement): Promise<void> {
  const db = await getDb();
  await db.put('elemente', element);
}

export async function saveFoto(fotoId: string, elementId: string, blob: Blob, fileName: string): Promise<void> {
  const db = await getDb();
  await db.put('fotos', { fotoId, elementId, blob, fileName });
}

export async function getFotos(elementId: string): Promise<{ fotoId: string; blob: Blob; fileName: string }[]> {
  const db = await getDb();
  return db.getAllFromIndex('fotos', 'byElement', elementId);
}

export async function deleteFoto(fotoId: string): Promise<void> {
  const db = await getDb();
  await db.delete('fotos', fotoId);
}

export async function getElement(id: string): Promise<Protokollelement | undefined> {
  const db = await getDb();
  return db.get('elemente', id);
}

export async function deleteElement(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('elemente', id);
  const fotos = await db.getAllFromIndex('fotos', 'byElement', id);
  const tx = db.transaction('fotos', 'readwrite');
  for (const foto of fotos) {
    await tx.objectStore('fotos').delete(foto.fotoId);
  }
  await tx.done;
}

export async function getAllElemente(): Promise<Protokollelement[]> {
  const db = await getDb();
  return db.getAll('elemente');
}

export async function findNachfolger(vorgaengerId: string): Promise<Protokollelement[]> {
  const alle = await getAllElemente();
  return alle.filter(e => e.verweise?.includes(vorgaengerId));
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  const storeNames: string[] = ['protokollgruppen', 'protokolle', 'elemente', 'fotos', 'verantwortliche', 'syncMeta'];
  if (db.objectStoreNames.contains('projekte')) storeNames.push('projekte');
  if (db.objectStoreNames.contains('wertelisten')) storeNames.push('wertelisten');
  if (db.objectStoreNames.contains('adressen')) storeNames.push('adressen');
  if (db.objectStoreNames.contains('ansprechpartner')) storeNames.push('ansprechpartner');
  const tx = db.transaction(storeNames, 'readwrite');
  await tx.objectStore('protokollgruppen').clear();
  await tx.objectStore('protokolle').clear();
  await tx.objectStore('elemente').clear();
  await tx.objectStore('fotos').clear();
  await tx.objectStore('verantwortliche').clear();
  await tx.objectStore('syncMeta').clear();
  if (db.objectStoreNames.contains('projekte')) await tx.objectStore('projekte').clear();
  if (db.objectStoreNames.contains('wertelisten')) await tx.objectStore('wertelisten').clear();
  if (db.objectStoreNames.contains('adressen')) await tx.objectStore('adressen').clear();
  if (db.objectStoreNames.contains('ansprechpartner')) await tx.objectStore('ansprechpartner').clear();
  await tx.done;
}

export async function clearProjekt(gruppeId: string): Promise<void> {
  const db = await getDb();
  const prots = await db.getAllFromIndex('protokolle', 'byGruppe', gruppeId);
  const protIds = new Set(prots.map(p => p.id));

  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente', 'fotos', 'syncMeta'], 'readwrite');

  await tx.objectStore('protokollgruppen').delete(gruppeId);

  for (const prot of prots) {
    await tx.objectStore('protokolle').delete(prot.id);
  }

  const alleElemente = await tx.objectStore('elemente').getAll();
  for (const elem of alleElemente) {
    if (protIds.has(elem.protokoll_id)) {
      const fotos = await tx.objectStore('fotos').index('byElement').getAll(elem.id);
      for (const foto of fotos) {
        await tx.objectStore('fotos').delete(foto.fotoId);
      }
      await tx.objectStore('elemente').delete(elem.id);
    }
  }

  await tx.objectStore('syncMeta').delete(gruppeId);
  await tx.done;
}

export interface SyncMeta {
  gruppeId: string;
  serverUrl?: string;
  lastSync?: string;
  autoSync?: boolean;
}

export async function clearSyncFlags(elementIds: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('elemente', 'readwrite');
  for (const id of elementIds) {
    const elem = await tx.objectStore('elemente').get(id);
    if (elem) {
      elem.is_modified = false;
      elem.is_new = false;
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

export async function getPendingChangesCount(gruppeId: string): Promise<number> {
  const db = await getDb();
  const prots = await db.getAllFromIndex('protokolle', 'byGruppe', gruppeId);
  const protIds = new Set(prots.map(p => p.id));
  const alle = await db.getAll('elemente');
  return alle.filter(e => protIds.has(e.protokoll_id) && (e.is_modified || e.is_new)).length;
}

export async function getSyncMeta(gruppeId: string): Promise<SyncMeta | undefined> {
  const db = await getDb();
  return db.get('syncMeta', gruppeId);
}

export async function setSyncMeta(meta: SyncMeta): Promise<void> {
  const db = await getDb();
  await db.put('syncMeta', meta);
}

// --- Pending Exports (ZIP-Blobs die auf Upload warten) ---

export interface PendingExport {
  id: string;
  gruppeId: string;
  blob: Blob;
  filename: string;
  elementIds: string[];
  createdAt: string;
}

export async function savePendingExport(exp: PendingExport): Promise<void> {
  const db = await getDb();
  await db.put('pendingExports', exp);
}

export async function getPendingExports(): Promise<PendingExport[]> {
  const db = await getDb();
  return db.getAll('pendingExports');
}

export async function deletePendingExport(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('pendingExports', id);
}

export async function findBautagebuchProtokoll(gruppeId: string): Promise<ProtokollMitGruppe | null> {
  const prots = await getProtokolleByGruppe(gruppeId);
  const found = prots.find(p =>
    p.nummer < 0 && p.name.toLowerCase().includes('bautagebuch')
  );
  return found ?? null;
}

export async function getLetzteBautagebuchElemente(gruppeId: string): Promise<Protokollelement[]> {
  const btProt = await findBautagebuchProtokoll(gruppeId);
  if (!btProt) return [];
  const elems = await getElemente(btProt.id);
  if (elems.length === 0) return [];
  elems.sort((a, b) => b.position.localeCompare(a.position, undefined, { numeric: true }));
  return elems;
}

// --- Projekte (Nachschlage-Tabelle) ---

export async function importProjekte(projekte: Projekt[]): Promise<void> {
  const db = await getDb();
  const existingMap = await buildLegacyIdMap(db, 'projekte');
  const tx = db.transaction('projekte', 'readwrite');
  for (const p of projekte) {
    const existingId = existingMap.get(p.legacy_id);
    if (existingId) p.id = existingId;
    await tx.objectStore('projekte').put(p);
  }
  await tx.done;
}

export async function getAllProjekte(): Promise<Projekt[]> {
  const db = await getDb();
  return db.getAll('projekte');
}

export async function getProjektByNummer(nummer: string): Promise<Projekt | undefined> {
  const db = await getDb();
  const results = await db.getAllFromIndex('projekte', 'byNummer', nummer);
  return results[0];
}

// --- Wertelisten ---

export async function importWertelisten(listen: Werteliste[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('wertelisten', 'readwrite');
  const existing = await tx.objectStore('wertelisten').getAll();
  const existingMap = new Map(existing.map((w: Werteliste) => [`${w.klasse}|${w.feld}`, w.id]));
  for (const wl of listen) {
    const key = `${wl.klasse}|${wl.feld}`;
    const existingId = existingMap.get(key);
    if (existingId) wl.id = existingId;
    await tx.objectStore('wertelisten').put(wl);
  }
  await tx.done;
}

export async function getWerteliste(klasse: string, feld: string): Promise<Werteliste | undefined> {
  const db = await getDb();
  const results = await db.getAllFromIndex('wertelisten', 'byKlasseFeld', [klasse, feld]);
  return results[0];
}

export async function getAllWertelisten(): Promise<Werteliste[]> {
  const db = await getDb();
  return db.getAll('wertelisten');
}

// --- Adressen (Nachschlage-Tabelle) ---

export async function importAdressen(adressen: Adresse[]): Promise<void> {
  const db = await getDb();
  const existingMap = await buildLegacyIdMap(db, 'adressen');
  const tx = db.transaction('adressen', 'readwrite');
  for (const a of adressen) {
    const existingId = existingMap.get(a.legacy_id);
    if (existingId) a.id = existingId;
    await tx.objectStore('adressen').put(a);
  }
  await tx.done;
}

export async function getAllAdressen(): Promise<Adresse[]> {
  const db = await getDb();
  return db.getAll('adressen');
}

export async function getAdresseByOid(oid: string): Promise<Adresse | undefined> {
  const db = await getDb();
  const results = await db.getAllFromIndex('adressen', 'byLegacyId', oid);
  return results[0];
}

export async function getAdressenByKlasse(klasse: string): Promise<Adresse[]> {
  const db = await getDb();
  return db.getAllFromIndex('adressen', 'byKlasse', klasse);
}

export async function searchAdressen(query: string): Promise<Adresse[]> {
  const db = await getDb();
  const all = await db.getAll('adressen');
  const q = query.toLowerCase();
  return all.filter((a: Adresse) =>
    a.name1.toLowerCase().includes(q) ||
    a.kuerzel.toLowerCase().includes(q) ||
    a.ort.toLowerCase().includes(q) ||
    a.nummer.toLowerCase().includes(q)
  );
}

// --- Ansprechpartner (Nachschlage-Tabelle) ---

export async function importAnsprechpartner(aps: Ansprechpartner[]): Promise<void> {
  const db = await getDb();
  const existingMap = await buildLegacyIdMap(db, 'ansprechpartner');
  const tx = db.transaction('ansprechpartner', 'readwrite');
  for (const ap of aps) {
    const existingId = existingMap.get(ap.legacy_id);
    if (existingId) ap.id = existingId;
    await tx.objectStore('ansprechpartner').put(ap);
  }
  await tx.done;
}

export async function getAllAnsprechpartner(): Promise<Ansprechpartner[]> {
  const db = await getDb();
  return db.getAll('ansprechpartner');
}

export async function getAnsprechpartnerByAdresse(adressOid: string): Promise<Ansprechpartner[]> {
  const db = await getDb();
  return db.getAllFromIndex('ansprechpartner', 'byParentOid', adressOid);
}
