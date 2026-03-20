import { useState, useEffect, useRef, useCallback } from 'react';
import { checkConnectivity, getServerUrl, syncProject, uploadZip } from './syncService';
import { getPendingChangesCount, setSyncMeta, getPendingExports, deletePendingExport, clearSyncFlags } from './db';

const CHECK_INTERVAL_MS = 30_000;

export interface SyncStatus {
  isOnline: boolean;
  serverReachable: boolean;
  lastSync: string | null;
  pendingCount: number;
  isSyncing: boolean;
  syncNow: () => Promise<void>;
}

export function useSyncStatus(gruppeId: string): SyncStatus {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverReachable, setServerReachable] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const wasReachable = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const refreshPending = useCallback(async () => {
    const count = await getPendingChangesCount(gruppeId);
    setPendingCount(count);
    return count;
  }, [gruppeId]);

  const doSync = useCallback(async () => {
    if (isSyncing || !getServerUrl()) return;
    setIsSyncing(true);
    try {
      await syncProject(gruppeId);
      const now = new Date().toISOString();
      setLastSync(now);
      await setSyncMeta({ gruppeId, serverUrl: getServerUrl(), lastSync: now, autoSync: true });
      await refreshPending();
    } catch (err) {
      console.warn('[Sync] Fehler:', err);
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
        // Pending exports (ZIPs) hochladen — User hat manuell exportiert, Upload war offline
        try {
          const pendingExps = await getPendingExports();
          for (const exp of pendingExps) {
            await uploadZip(exp.gruppeId, exp.blob, exp.filename);
            await clearSyncFlags(exp.elementIds);
            await deletePendingExport(exp.id);
            console.log('[Sync] Pending export hochgeladen:', exp.filename);
          }
        } catch (err) {
          console.warn('[Sync] Pending export Upload fehlgeschlagen:', err);
        }

        // Pending count aktualisieren
        await refreshPending();
      }
      wasReachable.current = reachable;
    }

    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [gruppeId, refreshPending, doSync]);

  // Pending Count bei Mount laden
  useEffect(() => { refreshPending(); }, [refreshPending]);

  return {
    isOnline,
    serverReachable,
    lastSync,
    pendingCount,
    isSyncing,
    syncNow: doSync,
  };
}
