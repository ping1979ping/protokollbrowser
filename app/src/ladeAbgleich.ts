/**
 * Abgleich beim Laden vom Server (downloadProject, Datei-Import) — reine Funktion.
 *
 * 999.1750, MANGEL aus der Prüfwelle (stiller Datenverlust): Das Laden ersetzte den Inhalt lokal
 * geänderter Punkte durch den Serverstand und behielt nur die Änderungsmarke; der nächste Export
 * schickte dann den Serverstand als „Änderung". Jetzt gilt: ein Punkt mit ungesendeter Änderung
 * (`is_modified`/`is_new`) wird beim Laden NICHT überschrieben — er bleibt samt Marke, wie er ist,
 * und wird in `geschuetzt` benannt, damit die Oberfläche es sagen kann.
 *
 * Der Plan wird in db.importPakete in EINER IndexedDB-Transaktion gelesen und geschrieben.
 * Tests: tests/ladeAbgleich.test.ts.
 */
import type { Protokoll, Protokollelement, Protokollgruppe, ProtokollPaket } from './types';

export type ProtokollMitGruppe = Protokoll & { gruppe_id: string };

export interface LokalerStand {
  gruppen: readonly Protokollgruppe[];
  protokolle: readonly ProtokollMitGruppe[];
  elemente: readonly Protokollelement[];
}

export interface AbgleichPlan {
  gruppen: Protokollgruppe[];
  protokolle: ProtokollMitGruppe[];
  /** Zu schreibende Punkte (Serverstand, lokale id beibehalten). */
  elemente: Protokollelement[];
  /** Lokal geänderte/neue Punkte, deren Inhalt NICHT durch den Serverstand ersetzt wurde. */
  geschuetzt: Protokollelement[];
  /** Lokale id der geladenen Gruppe (erstes Paket), `null` ohne Pakete. */
  gruppeId: string | null;
}

export const hatUngesendeteAenderung = (e: { is_new?: boolean; is_modified?: boolean }) => !!(e.is_new || e.is_modified);

/** Meldung nach dem Laden, wenn Punkte wegen ungesendeter Änderungen nicht überschrieben wurden. */
export function textGeschuetzt(anzahl: number): string | null {
  if (anzahl <= 0) return null;
  return anzahl === 1
    ? '1 Punkt hat ungesendete Änderungen und wurde nicht überschrieben. Erst senden, dann laden, um den Serverstand zu übernehmen.'
    : `${anzahl} Punkte haben ungesendete Änderungen und wurden nicht überschrieben. Erst senden, dann laden, um den Serverstand zu übernehmen.`;
}

function nachOid<T extends { legacy_id?: string }>(liste: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const x of liste) if (x.legacy_id) map.set(x.legacy_id, x);
  return map;
}

export function planeAbgleich(lokal: LokalerStand, pakete: readonly ProtokollPaket[]): AbgleichPlan {
  const gruppenNachOid = nachOid(lokal.gruppen);
  const protNachOid = nachOid(lokal.protokolle);
  const elemNachOid = nachOid(lokal.elemente);

  const gruppen = new Map<string, Protokollgruppe>();
  const protokolle = new Map<string, ProtokollMitGruppe>();
  const elemente = new Map<string, Protokollelement>();
  const geschuetzt = new Map<string, Protokollelement>();
  let gruppeId: string | null = null;

  for (const paket of pakete) {
    // Gruppe: bestehende lokale id wiederverwenden
    const g: Protokollgruppe = { ...paket.protokollgruppe };
    const lokG = g.legacy_id ? gruppenNachOid.get(g.legacy_id) : undefined;
    if (lokG) g.id = lokG.id;
    gruppen.set(g.id, g);
    gruppeId ??= g.id;

    // Protokoll: bestehende lokale id wiederverwenden
    const p: ProtokollMitGruppe = { ...paket.protokoll, gruppe_id: g.id };
    const lokP = p.legacy_id ? protNachOid.get(p.legacy_id) : undefined;
    if (lokP) p.id = lokP.id;
    protokolle.set(p.id, p);

    for (const roh of paket.protokollelemente) {
      const e: Protokollelement = { ...roh, protokoll_id: p.id };
      const lokE = e.legacy_id ? elemNachOid.get(e.legacy_id) : undefined;
      if (lokE && hatUngesendeteAenderung(lokE)) {
        // Ungesendete Änderung: lokalen Punkt unverändert lassen (Inhalt, Marke, Protokoll)
        geschuetzt.set(lokE.id, lokE);
        continue;
      }
      if (lokE) e.id = lokE.id;
      elemente.set(e.id, e);
    }
  }

  return {
    gruppen: [...gruppen.values()],
    protokolle: [...protokolle.values()],
    elemente: [...elemente.values()],
    geschuetzt: [...geschuetzt.values()],
    gruppeId,
  };
}
