import { useState, useEffect, useRef, useCallback } from 'react';
import { checkConnectivity, getServerUrl, syncProject } from './syncService';
import { getPendingChangesCount, setSyncMeta, getPendingExports, type PendingExport } from './db';
import { sendeAusstehende, ungeleseneMeldungen, meldungGelesen, raeumeErledigteAuf } from './uploadAblauf';
import { uploadAblaufDeps } from './uploadAblaufDb';
import { textGeschuetzt } from './ladeAbgleich';

const CHECK_INTERVAL_MS = 30_000;

export interface SyncStatus {
  isOnline: boolean;
  serverReachable: boolean;
  lastSync: string | null;
  syncError: string | null;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
  /** B4: ausgewertete Exporte dieser Gruppe, deren Meldung noch nicht gelesen ist. */
  uploadMeldungen: PendingExport[];
  /** Meldung bestätigen (Export bleibt, solange Marken offen sind). */
  meldungGelesen: (id: string) => Promise<void>;
  /** Steigt nach jedem Hintergrundversand und jedem Laden vom Server — Listen neu laden. */
  hintergrundStand: number;
  /** 999.1750: Hinweis nach dem Laden, z. B. dass Punkte mit ungesendeten Änderungen nicht überschrieben wurden. */
  syncHinweis: string | null;
  hinweisGelesen: () => void;
}

export function useSyncStatus(gruppeId: string): SyncStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverReachable, setServerReachable] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadMeldungen, setUploadMeldungen] = useState<PendingExport[]>([]);
  const [hintergrundStand, setHintergrundStand] = useState(0);
  const [syncHinweis, setSyncHinweis] = useState<string | null>(null);
  const wasReachable = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const refreshPending = useCallback(async () => {
    const count = await getPendingChangesCount(gruppeId);
    setPendingCount(count);
    return count;
  }, [gruppeId]);

  const ladeMeldungen = useCallback(async () => {
    setUploadMeldungen(ungeleseneMeldungen(await getPendingExports(), gruppeId));
  }, [gruppeId]);

  const bestaetigeMeldung = useCallback(async (id: string) => {
    const exp = (await getPendingExports()).find(e => e.id === id);
    if (exp) await meldungGelesen(exp, uploadAblaufDeps);
    await ladeMeldungen();
  }, [ladeMeldungen]);

  const doSync = useCallback(async () => {
    if (isSyncing || !getServerUrl()) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const { geschuetzt } = await syncProject(gruppeId);
      const now = new Date().toISOString();
      setLastSync(now);
      await setSyncMeta({ gruppeId, serverUrl: getServerUrl(), lastSync: now, autoSync: true });
      await refreshPending();
      // 999.1750: geschützte Punkte benennen; Liste mit dem geladenen Stand neu einlesen
      setSyncHinweis(textGeschuetzt(geschuetzt));
      setHintergrundStand(n => n + 1);
    } catch (err) {
      // quick-260720-m4x: Fehler sichtbar machen — KEIN lastSync (kein falsches
      // 'gerade eben'). Pending neu einlesen, damit es korrekt pending bleibt.
      console.warn('[Sync] Fehler:', err);
      setSyncError(err instanceof Error ? err.message : 'Sync fehlgeschlagen');
      await refreshPending();
    } finally {
      setIsSyncing(false);
    }
  }, [gruppeId, isSyncing, refreshPending]);

  // Online/Offline Events
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => { setIsOnline(false); setServerReachable(false); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Periodischer Health-Check + Auto-Sync
  useEffect(() => {
    if (!getServerUrl()) return;

    async function check() {
      if (!navigator.onLine) {
        setServerReachable(false);
        wasReachable.current = false;
        return;
      }

      const reachable = await checkConnectivity();
      setServerReachable(reachable);

      if (reachable && !wasReachable.current) {
        // Ausstehende Exporte (ZIPs) hochladen — manuell exportiert, Upload war offline.
        // B4: derselbe Ablauf wie im Export (uploadAblauf.ts); was der Hub nicht übernimmt,
        // bleibt als Export mit Auswertung liegen und erscheint als Meldung im Browser.
        // 999.1750: Senden, Aufräumen und Neuladen einzeln abgesichert — ein Fehler in einem Schritt
        // (oder an einem Export, s. sendeAusstehende/raeumeErledigteAuf) hält die übrigen nicht auf.
        try {
          const ergebnis = await sendeAusstehende(await getPendingExports(), uploadAblaufDeps);
          if (ergebnis.gesendet > 0) setHintergrundStand(n => n + 1);
        } catch (err) {
          console.warn('[Sync] Ausstehende Exporte nicht gesendet:', err);
        }
        try {
          await raeumeErledigteAuf(await getPendingExports(), uploadAblaufDeps);
        } catch (err) {
          console.warn('[Sync] Erledigte Exporte nicht aufgeräumt:', err);
        }
        try {
          await ladeMeldungen();
          // Pending count aktualisieren
          await refreshPending();
        } catch (err) {
          console.warn('[Sync] Meldungen/Änderungszähler nicht neu geladen:', err);
        }
      }
      wasReachable.current = reachable;
    }

    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [gruppeId, refreshPending, doSync, ladeMeldungen]);

  // Pending Count und ungelesene Meldungen bei Mount laden (Meldungen auch ohne Server)
  useEffect(() => { refreshPending(); }, [refreshPending]);
  useEffect(() => { ladeMeldungen(); }, [ladeMeldungen]);

  return {
    isOnline,
    serverReachable,
    lastSync,
    syncError,
    pendingCount,
    isSyncing,
    syncNow: doSync,
    uploadMeldungen,
    meldungGelesen: bestaetigeMeldung,
    hintergrundStand,
    syncHinweis,
    hinweisGelesen: () => setSyncHinweis(null),
  };
}
