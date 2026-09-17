/**
 * Abgleich beim Laden vom Server (downloadProject, Datei-Import) — reine Funktion.
 *
 * 999.1750, MANGEL aus der Prüfwelle (stiller Datenverlust): Das Laden ersetzte den Inhalt lokal
 * geänderter Punkte durch den Serverstand und behielt nur die Änderungsmarke; der nächste Export
 * schickte dann den Serverstand als „Änderung". Jetzt gilt: ein Punkt mit ungesendeter Änderung
 * (`is_modified`/`is_new`) wird beim Laden NICHT überschrieben — er bleibt samt Marke, wie er ist,
 * und wird in `geschuetzt` benannt, damit die Oberfläche es sagen kann.
 *
 * 999.1750, Kennungen aus dem Hub (Umstieg ohne Datenverlust): Der Hub-Export trägt `HubId`; der
 * Parser macht sie zur id neu geladener Objekte. Bestandsdaten eines Geräts tragen dagegen
 * geräte-lokale UUIDs. Die Zuordnung Server -> Gerät läuft bei JEDEM Laden in dieser Reihenfolge:
 *   1. Hub-UUID: lokale id oder hub_id gleich HubId (nach dem Umstieg der Normalfall; auch lokal
 *      angelegte und gesendete Objekte, denn der Hub übernimmt ihre UUID als Primärschlüssel),
 *   2. DocuFrame-OID (legacy_id),
 *   3. nur für Objekte ohne OID auf beiden Seiten und ohne Hub-UUID, die nicht lokal neu angelegt
 *      sind: Protokoll über die Nummer in derselben Gruppe, Punkt über die Position im
 *      zugeordneten Protokoll — und nur, wenn der Treffer auf beiden Seiten eindeutig ist.
 * Ein zugeordnetes Objekt behält seine lokale id (Verweise, Fotos, ausstehende Exporte zeigen
 * darauf) und lernt seine hub_id — auch ein geschützter Punkt, dessen Inhalt unangetastet bleibt.
 * Warum beim Laden und nicht in einer IndexedDB-Aufwertung: die Hub-UUIDs gibt es nur im Export
 * des Hub; eine Aufwertung läuft offline und könnte die Zuordnung nicht herstellen.
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
  /** Zu schreibende Punkte (Serverstand unter lokaler id; geschützte nur mit gelernter hub_id). */
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

interface Kennbar { id: string; hub_id?: string; legacy_id?: string; is_new?: boolean }

/** Stufe 1 und 2: Hub-UUID, dann OID — unter den noch nicht vergebenen lokalen Objekten. */
function perKennung<T extends Kennbar>(server: Kennbar, lokal: readonly T[], vergeben: Set<string>): T | undefined {
  const hub = server.hub_id;
  if (hub) {
    const t = lokal.find(l => !vergeben.has(l.id) && (l.id === hub || l.hub_id === hub));
    if (t) return t;
  }
  if (server.legacy_id) {
    return lokal.find(l => !vergeben.has(l.id) && l.legacy_id === server.legacy_id);
  }
  return undefined;
}

/** Lokales Objekt ohne jede Hub-Kennung, nicht lokal neu angelegt (Bestand vor dem Umstieg). */
const ohneKennung = (x: Kennbar) => !x.hub_id && !x.legacy_id && x.is_new !== true;

export function planeAbgleich(lokal: LokalerStand, pakete: readonly ProtokollPaket[]): AbgleichPlan {
  const gruppen = new Map<string, Protokollgruppe>();
  const protokolle = new Map<string, ProtokollMitGruppe>();
  const elemente = new Map<string, Protokollelement>();
  const geschuetzt = new Map<string, Protokollelement>();
  const vergebenG = new Set<string>();
  const vergebenP = new Set<string>();
  const vergebenE = new Set<string>();
  // Server-Gruppe (Objekt aus dem Parser) -> lokale id; alle Pakete einer Gruppe teilen sich eines
  const gruppeLokal = new Map<Protokollgruppe, string>();
  let gruppeId: string | null = null;

  for (const paket of pakete) {
    // --- Gruppe ---
    let gId = gruppeLokal.get(paket.protokollgruppe);
    if (!gId) {
      const g: Protokollgruppe = { ...paket.protokollgruppe };
      const lokG = perKennung(g, lokal.gruppen, vergebenG);
      if (lokG) {
        g.id = lokG.id;
        g.hub_id = g.hub_id || lokG.hub_id;
        g.projekt_id = g.projekt_id || lokG.projekt_id;
        vergebenG.add(lokG.id);
      }
      gruppen.set(g.id, g);
      gruppeLokal.set(paket.protokollgruppe, g.id);
      gId = g.id;
    }
    gruppeId ??= gId;

    // --- Protokoll ---
    const p: ProtokollMitGruppe = { ...paket.protokoll, gruppe_id: gId };
    let lokP = perKennung(p, lokal.protokolle, vergebenP);
    if (!lokP && !p.legacy_id) {
      const kandidaten = lokal.protokolle.filter(l => !vergebenP.has(l.id) && l.gruppe_id === gId && ohneKennung(l) && l.nummer === p.nummer);
      const serverGleich = pakete.filter(x => !x.protokoll.legacy_id && x.protokoll.nummer === p.nummer).length;
      if (kandidaten.length === 1 && serverGleich === 1) lokP = kandidaten[0];
    }
    if (lokP) {
      p.id = lokP.id;
      p.hub_id = p.hub_id || lokP.hub_id;
      vergebenP.add(lokP.id);
    }
    protokolle.set(p.id, p);

    // --- Punkte ---
    for (const roh of paket.protokollelemente) {
      const e: Protokollelement = { ...roh, protokoll_id: p.id };
      let lokE = perKennung(e, lokal.elemente, vergebenE);
      if (!lokE && lokP && !e.legacy_id) {
        const kandidaten = lokal.elemente.filter(l => !vergebenE.has(l.id) && l.protokoll_id === lokP!.id && ohneKennung(l) && l.position === e.position);
        const serverGleich = paket.protokollelemente.filter(x => !x.legacy_id && x.position === e.position).length;
        if (kandidaten.length === 1 && serverGleich === 1) lokE = kandidaten[0];
      }
      if (lokE) vergebenE.add(lokE.id);
      if (lokE && hatUngesendeteAenderung(lokE)) {
        // Ungesendete Änderung: Inhalt, Marke und Protokoll bleiben; nur die Hub-Kennung wird gelernt
        const gelernt = e.hub_id && e.hub_id !== lokE.hub_id ? { ...lokE, hub_id: e.hub_id } : lokE;
        if (gelernt !== lokE) elemente.set(gelernt.id, gelernt);
        geschuetzt.set(lokE.id, gelernt);
        continue;
      }
      if (lokE) {
        e.id = lokE.id;
        e.hub_id = e.hub_id || lokE.hub_id;
      }
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
