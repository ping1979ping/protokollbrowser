import { useSyncExternalStore } from 'react';

import { getAllGruppen } from '../db';
import {
  addUserAbo,
  listHubGruppen,
  listUserAbos,
  removeUserAbo,
  reorderUserAbos,
} from '../syncService';

/**
 * Abo-Store „Meine Protokolle" — jetzt SERVER-basiert (Plan 06.1-06, SC-1).
 *
 * Loest das fruehere localStorage-Provisorium (`ping.abos.*`) ab: die Abos leben
 * user-scoped im Hub (`/api/protokoll-abos`, Hub-JWT) und sind damit auf Handy
 * (PWA) und Desktop (Hub) DIESELBE Liste. Der Geraete-Sync-Scope
 * (`getSubscriptions`) bleibt unveraendert und wird serverseitig aus denselben
 * User-Abos abgeleitet.
 *
 * Die oeffentliche Store-Oberflaeche (isSubscribed/toggle/subscribe/unsubscribe/
 * setOrder/applyOrder/markSyncedNow/useAboState) bleibt IDENTISCH und spricht
 * durchgaengig die LOKALE PWA-`gruppe.id` — so laufen AboHome, AbonnierenScreen
 * und Gruppenuebersicht ohne Signaturbruch weiter. Intern uebersetzt der Store:
 *
 *   lokale gruppe.id  <->  legacy_id (DF-OID, stabil)  <->  Hub-UUID
 *
 * Die Abo-Endpunkte adressieren die Hub-UUID (Protokollgruppe.id); die lokale
 * PWA-gruppe.id ist eine beim Import erzeugte, geraetelokale UUID. `legacy_id`
 * (aus DocuFrame) ist die stabile Bruecke: `listHubGruppen()` liefert die
 * Zuordnung legacy_id -> Hub-UUID, `getAllGruppen()` die lokale Zuordnung.
 *
 * Offline-Toleranz: der letzte geladene Stand bleibt in-memory sichtbar;
 * Schreiboperationen laufen nur online (optimistisches UI + Rollback bei Fehler),
 * es wird KEIN Offline-Queue aufgebaut (Etappe 3).
 */

interface AboState {
  /** LOKALE gruppe.ids der abonnierten Gruppen. `null` = noch nicht geladen. */
  subscribed: string[] | null;
  /** LOKALE gruppe.ids in persoenlicher Reihenfolge. */
  order: string[];
  lastSync: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

let state: AboState = {
  subscribed: null,
  order: [],
  lastSync: null,
  loading: false,
  loaded: false,
  error: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function set(next: Partial<AboState>) {
  state = { ...state, ...next };
  emit();
}

// --- Cross-System-Aufloesung (nach jedem load() neu aufgebaut) ---------------
let localToLegacy = new Map<string, string>(); // lokale gruppe.id -> legacy_id
let legacyToLocal = new Map<string, string>(); // legacy_id        -> lokale gruppe.id
let legacyToHub = new Map<string, string>(); // legacy_id          -> Hub-UUID
let hubToLegacy = new Map<string, string>(); // Hub-UUID           -> legacy_id

function hubIdForLocal(localId: string): string | undefined {
  const legacy = localToLegacy.get(localId);
  return legacy ? legacyToHub.get(legacy) : undefined;
}
function localIdForHub(hubId: string): string | undefined {
  const legacy = hubToLegacy.get(hubId);
  return legacy ? legacyToLocal.get(legacy) : undefined;
}

// Einmalige Bereinigung der alten Provisorium-Keys (Testdaten, kein Backfill).
try {
  localStorage.removeItem('ping.abos.subscribed.v1');
  localStorage.removeItem('ping.abos.order.v1');
  localStorage.removeItem('ping.abos.lastSync.v1');
} catch {
  /* ignore private mode */
}

// load() gegen Doppelausfuehrung schuetzen (mehrere Screens mounten gleichzeitig).
let ladeLauf: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  set({ loading: true, error: null });
  try {
    const [locals, hubGruppen, abos] = await Promise.all([
      getAllGruppen(),
      listHubGruppen(),
      listUserAbos(),
    ]);

    localToLegacy = new Map<string, string>(
      locals.map((g) => [g.id, g.legacy_id] as [string, string]),
    );
    legacyToLocal = new Map<string, string>(
      locals.filter((g) => g.legacy_id).map((g) => [g.legacy_id, g.id] as [string, string]),
    );
    legacyToHub = new Map<string, string>(
      hubGruppen.filter((g) => g.legacy_id).map((g) => [g.legacy_id, g.id] as [string, string]),
    );
    hubToLegacy = new Map<string, string>(
      hubGruppen.filter((g) => g.legacy_id).map((g) => [g.id, g.legacy_id] as [string, string]),
    );

    // Server-Abos (Hub-UUID, sort_order) auf lokale gruppe.ids abbilden. Abos
    // ohne lokal vorhandene Gruppe (noch nicht heruntergeladen) werden hier
    // ausgelassen — sie bleiben serverseitig bestehen.
    const sorted = [...abos].sort((a, b) => a.sort_order - b.sort_order);
    const subscribed: string[] = [];
    const order: string[] = [];
    for (const a of sorted) {
      const localId = localIdForHub(a.gruppe_id);
      if (localId && !subscribed.includes(localId)) {
        subscribed.push(localId);
        order.push(localId);
      }
    }
    set({ subscribed, order, loaded: true, loading: false, error: null });
  } catch (e) {
    // Offline / Serverfehler: letzten bekannten Stand behalten, nur Flag setzen.
    set({
      loading: false,
      error: e instanceof Error ? e.message : 'Abos konnten nicht geladen werden',
    });
  } finally {
    ladeLauf = null;
  }
}

export const aboStore = {
  getState: () => state,

  /** Server-Abos laden (idempotent — parallele Aufrufe teilen sich den Lauf). */
  load(force = false): Promise<void> {
    if (ladeLauf) return ladeLauf;
    if (state.loaded && !force) return Promise.resolve();
    ladeLauf = doLoad();
    return ladeLauf;
  },

  isSubscribed(id: string): boolean {
    return state.subscribed?.includes(id) ?? false;
  },

  /**
   * Toggle. `allIds` wird fuer die neue Server-Semantik nicht mehr gebraucht,
   * bleibt aber in der Signatur (Aufrufer unveraendert).
   */
  toggle(id: string, allIds?: string[]) {
    if (this.isSubscribed(id)) this.unsubscribe(id, allIds);
    else this.subscribe(id, allIds);
  },

  subscribe(id: string, _allIds?: string[]) {
    if (state.subscribed?.includes(id)) return;
    const hubId = hubIdForLocal(id);
    if (!hubId) {
      set({ error: 'Gruppe ist (noch) nicht mit dem Hub verknuepft' });
      return;
    }
    const prevSub = state.subscribed;
    const prevOrder = state.order;
    // optimistisch
    set({
      subscribed: [...(state.subscribed ?? []), id],
      order: state.order.includes(id) ? state.order : [...state.order, id],
    });
    void addUserAbo(hubId).catch(() => {
      set({ subscribed: prevSub, order: prevOrder, error: 'Abonnieren fehlgeschlagen (offline?)' });
    });
  },

  unsubscribe(id: string, _allIds?: string[]) {
    if (!state.subscribed?.includes(id)) return;
    const hubId = hubIdForLocal(id);
    const prevSub = state.subscribed;
    const prevOrder = state.order;
    // optimistisch
    set({
      subscribed: (state.subscribed ?? []).filter((x) => x !== id),
      order: state.order.filter((x) => x !== id),
    });
    if (!hubId) return; // lokal entfernt; ohne Hub-Zuordnung nichts zu loeschen
    void removeUserAbo(hubId).catch(() => {
      set({ subscribed: prevSub, order: prevOrder, error: 'Entfernen fehlgeschlagen (offline?)' });
    });
  },

  /** Manuelle Reihenfolge setzen (Drag&Drop). Persistiert die Server-Reihenfolge. */
  setOrder(ids: string[]) {
    set({ order: ids });
    const hubIds = ids
      .map((id) => hubIdForLocal(id))
      .filter((x): x is string => Boolean(x));
    void reorderUserAbos(hubIds).catch(() => {
      /* offline: lokale Reihenfolge bleibt, kein Rollback (unkritisch) */
    });
  },

  /** Sortiert eine Menge nach der manuellen Order; Rest in Ursprungsreihenfolge. */
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
    // Nur in-memory (kein localStorage mehr) — der Sync-Zeitpunkt ist ein rein
    // optischer Indikator der Startseite.
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
