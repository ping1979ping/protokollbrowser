import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Protokollgruppe, Protokoll, Protokollelement, ProtokollPaket } from './types';

const DB_NAME = 'protokoll-app';
const DB_VERSION = 2;

export interface ProtokollMitGruppe extends Protokoll {
  GruppeId: string;
}

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (db.objectStoreNames.contains('protokollgruppen')) db.deleteObjectStore('protokollgruppen');
      if (db.objectStoreNames.contains('protokolle')) db.deleteObjectStore('protokolle');
      if (db.objectStoreNames.contains('elemente')) db.deleteObjectStore('elemente');
      if (db.objectStoreNames.contains('fotos')) db.deleteObjectStore('fotos');

      db.createObjectStore('protokollgruppen', { keyPath: 'Id' });
      const protStore = db.createObjectStore('protokolle', { keyPath: 'Id' });
      protStore.createIndex('byGruppe', 'GruppeId');
      const elemStore = db.createObjectStore('elemente', { keyPath: 'Id' });
      elemStore.createIndex('byProtokoll', 'ProtokollId');
      const fotoStore = db.createObjectStore('fotos', { keyPath: 'fotoId' });
      fotoStore.createIndex('byElement', 'elementId');
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
  const tx = db.transaction(['protokollgruppen', 'protokolle', 'elemente', 'fotos'], 'readwrite');
  await tx.objectStore('protokollgruppen').clear();
  await tx.objectStore('protokolle').clear();
  await tx.objectStore('elemente').clear();
  await tx.objectStore('fotos').clear();
  await tx.done;
}
