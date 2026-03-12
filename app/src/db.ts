import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Protokollgruppe, Protokoll, Protokollelement, ProtokollPaket } from './types';

const DB_NAME = 'protokoll-app';
const DB_VERSION = 1;

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('protokollgruppen')) {
        db.createObjectStore('protokollgruppen', { keyPath: 'Id' });
      }
      if (!db.objectStoreNames.contains('protokolle')) {
        db.createObjectStore('protokolle', { keyPath: 'Id' });
      }
      if (!db.objectStoreNames.contains('elemente')) {
        const store = db.createObjectStore('elemente', { keyPath: 'Id' });
        store.createIndex('byProtokoll', 'ProtokollId');
      }
      if (!db.objectStoreNames.contains('fotos')) {
        const store = db.createObjectStore('fotos', { keyPath: 'fotoId' });
        store.createIndex('byElement', 'elementId');
      }
    },
  });
}

export async function importPakete(pakete: ProtokollPaket[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente'], 'readwrite');
  for (const paket of pakete) {
    await tx.objectStore('protokollgruppen').put(paket.Protokollgruppe);
    await tx.objectStore('protokolle').put(paket.Protokoll);
    for (const elem of paket.Protokollelemente) {
      await tx.objectStore('elemente').put(elem);
    }
  }
  await tx.done;
}

export async function getProtokolle(): Promise<Protokoll[]> {
  const db = await getDb();
  return db.getAll('protokolle');
}

export async function getProtokollgruppe(id: string): Promise<Protokollgruppe | undefined> {
  const db = await getDb();
  return db.get('protokollgruppen', id);
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

export async function clearAll(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente', 'fotos'], 'readwrite');
  await tx.objectStore('protokollgruppen').clear();
  await tx.objectStore('protokolle').clear();
  await tx.objectStore('elemente').clear();
  await tx.objectStore('fotos').clear();
  await tx.done;
}
