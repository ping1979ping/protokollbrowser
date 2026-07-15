import { useSyncExternalStore } from 'react';

/**
 * Lokaler Abo-Store (Frontend-only, localStorage).
 * Bildet das "Meine Protokolle"-Abo-Modell des Redesigns ab, OHNE Server-/Sync-
 * Aenderungen: ein Abo = eine abonnierte Protokollgruppe (per gruppe.id).
 * - `subscribed = null`  => Default: alle vorhandenen Gruppen gelten als abonniert
 *   (damit die Startseite auf bestehenden Daten nicht leer ist).
 * - Nach der ersten expliziten Aktion wird die Menge materialisiert.
 * - `order` ueberschreibt die Standard-Sortierung (aufsteigend nach Projektnummer).
 */

const K_SUB = 'ping.abos.subscribed.v1';
const K_ORDER = 'ping.abos.order.v1';
const K_LASTSYNC = 'ping.abos.lastSync.v1';

interface AboState {
  subscribed: string[] | null;
  order: string[];
  lastSync: string | null;
}

function load(): AboState {
  const readJson = <T,>(k: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(k);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    subscribed: readJson<string[] | null>(K_SUB, null),
    order: readJson<string[]>(K_ORDER, []),
    lastSync: (() => {
      try { return localStorage.getItem(K_LASTSYNC); } catch { return null; }
    })(),
  };
}

let state: AboState = load();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function persist() {
  try {
    if (state.subscribed === null) localStorage.removeItem(K_SUB);
    else localStorage.setItem(K_SUB, JSON.stringify(state.subscribed));
    localStorage.setItem(K_ORDER, JSON.stringify(state.order));
    if (state.lastSync) localStorage.setItem(K_LASTSYNC, state.lastSync);
  } catch {
    /* ignore quota / private mode */
  }
}
function set(next: Partial<AboState>) {
  state = { ...state, ...next };
  persist();
  emit();
}

export const aboStore = {
  getState: () => state,

  isSubscribed(id: string): boolean {
    if (state.subscribed === null) return true; // Default: alles abonniert
    return state.subscribed.includes(id);
  },

  /** Toggle. allIds wird gebraucht, um beim ersten Eingriff die Default-Menge zu materialisieren. */
  toggle(id: string, allIds: string[]) {
    const cur = state.subscribed ?? allIds.slice();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ subscribed: next });
  },
  subscribe(id: string, allIds: string[]) {
    const cur = state.subscribed ?? allIds.slice();
    if (!cur.includes(id)) set({ subscribed: [...cur, id] });
  },
  unsubscribe(id: string, allIds: string[]) {
    const cur = state.subscribed ?? allIds.slice();
    set({ subscribed: cur.filter((x) => x !== id) });
  },

  /** Manuelle Reihenfolge setzen (Drag&Drop der Abo-Karten). */
  setOrder(ids: string[]) {
    set({ order: ids });
  },

  /** Sortiert eine Menge von Abo-Ids: manuelle Order zuerst, Rest nach Fallback-Reihenfolge. */
  applyOrder<T>(items: T[], idOf: (t: T) => string): T[] {
    const ord = state.order;
    if (!ord.length) return items;
    const idx = (id: string) => {
      const i = ord.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return items.slice().sort((a, b) => idx(idOf(a)) - idx(idOf(b)));
  },

  getLastSync: () => state.lastSync,
  markSyncedNow(iso: string) {
    set({ lastSync: iso });
  },

  subscribe_(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

/** React-Hook: liefert reaktiven Abo-State. */
export function useAboState(): AboState {
  return useSyncExternalStore(
    (cb) => aboStore.subscribe_(cb),
    () => state,
    () => state,
  );
}
