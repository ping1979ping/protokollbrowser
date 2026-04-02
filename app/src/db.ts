import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Protokollgruppe, Protokoll, Protokollelement, ProtokollPaket } from './types';

const DB_NAME = 'protokoll-app';
const DB_VERSION = 6;

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
    upgrade(db, oldVersion) {
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
  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente'], 'readwrite');
  for (const paket of pakete) {
    await tx.objectStore('protokollgruppen').put(paket.protokollgruppe);
    const protMitGruppe: ProtokollMitGruppe = { ...paket.protokoll, gruppe_id: paket.protokollgruppe.id };
    await tx.objectStore('protokolle').put(protMitGruppe);
    for (const elem of paket.protokollelemente) {
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

export async function importVerantwortliche(firmen: Verantwortlicher[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('verantwortliche', 'readwrite');
  for (const f of firmen) {
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
  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente', 'fotos', 'verantwortliche', 'syncMeta'], 'readwrite');
  await tx.objectStore('protokollgruppen').clear();
  await tx.objectStore('protokolle').clear();
  await tx.objectStore('elemente').clear();
  await tx.objectStore('fotos').clear();
  await tx.objectStore('verantwortliche').clear();
  await tx.objectStore('syncMeta').clear();
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
