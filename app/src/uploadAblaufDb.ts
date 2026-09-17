/**
 * Belegung der Abhängigkeiten des Upload-Ablaufs (uploadAblauf.ts) mit IndexedDB und Sync-Dienst.
 * Die einzige Stelle, an der Vordergrund und Hintergrund an Marken, Exporte und Upload kommen —
 * tests/uploadVerdrahtung.test.ts prüft, dass jede Rolle auf die passende Funktion zeigt.
 */
import { clearSyncFlags, deletePendingExport, getElement, getProtokolle, savePendingExport } from './db';
import { uploadZip } from './syncService';
import type { UploadAblaufDeps } from './uploadAblauf';

export const uploadAblaufDeps: UploadAblaufDeps = {
  upload: uploadZip,
  ladeElement: getElement,
  loescheMarken: clearSyncFlags,
  speichereExport: savePendingExport,
  loescheExport: deletePendingExport,
  protokollName: async (protokollId) => (await getProtokolle()).find(p => p.id === protokollId)?.name,
};
