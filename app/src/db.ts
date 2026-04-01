import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Protokollgruppe, Protokoll, Protokollelement, ProtokollPaket } from './types';

const DB_NAME = 'protokoll-app';
const DB_VERSION = 5;

export interface ProtokollMitGruppe extends Protokoll {
  GruppeId: string;
}

export interface Verantwortlicher {
  ID: string;
  Kuerzel: string;
  Name: string;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (db.objectStoreNames.contains('protokollgruppen')) db.deleteObjectStore('protokollgruppen');
      if (db.objectStoreNames.contains('protokolle')) db.deleteObjectStore('protokolle');
      if (db.objectStoreNames.contains('elemente')) db.deleteObjectStore('elemente');
      if (db.objectStoreNames.contains('fotos')) db.deleteObjectStore('fotos');
      if (db.objectStoreNames.contains('verantwortliche')) db.deleteObjectStore('verantwortliche');

      db.createObjectStore('protokollgruppen', { keyPath: 'Id' });
      const protStore = db.createObjectStore('protokolle', { keyPath: 'Id' });
      protStore.createIndex('byGruppe', 'GruppeId');
      const elemStore = db.createObjectStore('elemente', { keyPath: 'Id' });
      elemStore.createIndex('byProtokoll', 'ProtokollId');
      const fotoStore = db.createObjectStore('fotos', { keyPath: 'fotoId' });
      fotoStore.createIndex('byElement', 'elementId');
      db.createObjectStore('verantwortliche', { keyPath: 'ID' });
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
    await tx.objectStore('protokollgruppen').put(paket.Protokollgruppe);
    const protMitGruppe: ProtokollMitGruppe = { ...paket.Protokoll, GruppeId: paket.Protokollgruppe.Id };
    await tx.objectStore('protokolle').put(protMitGruppe);
    for (const elem of paket.Protokollelemente) {
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

export async function importVerantwortliche(firmen: { ID: string; Kürzel?: string; Kuerzel?: string; Name: string }[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('verantwortliche', 'readwrite');
  for (const f of firmen) {
    await tx.objectStore('verantwortliche').put({ ID: f.ID, Kuerzel: f.Kuerzel || f['Kürzel'] || '', Name: f.Name });
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
  basierend: { Name: string; Ort: string; Autor: string },
): Promise<ProtokollMitGruppe> {
  const prots = await getProtokolleByGruppe(gruppeId);
  // Bereits ein Draft-Protokoll vorhanden?
  const draft = prots.find(p => (p as ProtokollMitGruppe & { _neu?: boolean })._neu);
  if (draft) return draft;

  // Neues Protokoll anlegen: nächste Nummer
  const maxNummer = prots.reduce((max, p) => Math.max(max, p.Nummer), 0);
  const neueNummer = maxNummer + 1;
  // Name-Pattern: "Baustellennotiz 6 - 2025" → Basis "Baustellennotiz", dann "Nr - Jahr"
  const nameBase = basierend.Name.replace(/\s*\d+\s*[-–]\s*\d+$/, '').replace(/\s*\d+$/, '');
  const jahr = new Date().getFullYear();

  const neuProt: ProtokollMitGruppe & { _neu?: boolean } = {
    Id: `prot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    Name: `${nameBase} ${neueNummer} - ${jahr}`,
    Nummer: neueNummer,
    Datum: new Date().toISOString(),
    Ort: basierend.Ort,
    Autor: basierend.Autor,
    Vorbemerkung: '',
    Nachbemerkung: '',
    Erledigt: false,
    IstEinzelprotokoll: false,
    Erstellt: false,
    Signatur: '',
    Teilnehmer: [],
    Verteiler: [],
    GruppeId: gruppeId,
    _neu: true,
  };

  const db = await getDb();
  await db.put('protokolle', neuProt);
  console.log('[Draft] Neues Protokoll erstellt:', neuProt.Name, 'Nr.', neuProt.Nummer, 'Id:', neuProt.Id);
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
  // Element löschen
  await db.delete('elemente', id);
  // Zugehörige Fotos löschen
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
  return alle.filter(e => e.Verweise?.includes(vorgaengerId));
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
  // Alle Protokolle dieser Gruppe finden
  const prots = await db.getAllFromIndex('protokolle', 'byGruppe', gruppeId);
  const protIds = new Set(prots.map(p => p.Id));

  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente', 'fotos', 'syncMeta'], 'readwrite');

  // Gruppe löschen
  await tx.objectStore('protokollgruppen').delete(gruppeId);

  // Protokolle löschen
  for (const prot of prots) {
    await tx.objectStore('protokolle').delete(prot.Id);
  }

  // Elemente und zugehörige Fotos löschen
  const alleElemente = await tx.objectStore('elemente').getAll();
  for (const elem of alleElemente) {
    if (protIds.has(elem.ProtokollId)) {
      // Fotos dieses Elements löschen
      const fotos = await tx.objectStore('fotos').index('byElement').getAll(elem.Id);
      for (const foto of fotos) {
        await tx.objectStore('fotos').delete(foto.fotoId);
      }
      await tx.objectStore('elemente').delete(elem.Id);
    }
  }

  // Sync-Meta löschen
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
      elem._geaendert = false;
      elem._neu = false;
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

export async function getPendingChangesCount(gruppeId: string): Promise<number> {
  const db = await getDb();
  const prots = await db.getAllFromIndex('protokolle', 'byGruppe', gruppeId);
  const protIds = new Set(prots.map(p => p.Id));
  const alle = await db.getAll('elemente');
  return alle.filter(e => protIds.has(e.ProtokollId) && (e._geaendert || e._neu)).length;
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
  // Anhangprotokolle (negative Nummer) mit "Bautagebuch" im Namen
  const found = prots.find(p =>
    p.Nummer < 0 && p.Name.toLowerCase().includes('bautagebuch')
  );
  return found ?? null;
}

export async function getLetzteBautagebuchElemente(gruppeId: string): Promise<Protokollelement[]> {
  const btProt = await findBautagebuchProtokoll(gruppeId);
  if (!btProt) return [];
  const elems = await getElemente(btProt.Id);
  if (elems.length === 0) return [];
  // Alle Elemente im BT-Protokoll, sortiert nach Position absteigend (neueste zuerst)
  // Nicht nur Thema=Bautagebuch filtern — im Anhangprotokoll ist alles relevant
  elems.sort((a, b) => b.Position.localeCompare(a.Position, undefined, { numeric: true }));
  return elems;
}
