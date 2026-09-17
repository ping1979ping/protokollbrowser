/**
 * Reine Entscheidungsfunktion: unter welcher Kennung spricht die App eine Gruppe im Hub an
 * (Export/Download, Status, Upload — `/api/protokoll-sync/projects/{id}/…`).
 *
 * Aus syncService.resolveGruppenLegacyId extrahiert (06.3-Review IN-04), damit die
 * Fallback-Kette OHNE IndexedDB testbar ist (Node-Builtin-Runner `node --test`;
 * die PWA hat kein Vitest). Der IO-Teil (getProtokollgruppe/getAllGruppen) bleibt
 * im Service, die Auswahl-Logik ist hier rein.
 *
 * 999.1750: Der Hub nimmt als `{id}` die Hub-UUID ODER die OID (`_load_gruppe`, hub-server
 * backend/app/routers/protokoll_sync.py :256-285). Im Hub angelegte Gruppen haben keine OID und
 * sind nur über die Hub-UUID erreichbar — deshalb geht die Hub-UUID vor.
 *
 * Reihenfolge:
 *   1. PK-Treffer (per lokaler UUID geladene Gruppe): hub_id, sonst legacy_id
 *   2. Treffer im Voll-Scan (g.id oder g.hub_id === projectId): hub_id, sonst legacy_id
 *   3. sonst Passthrough: projectId ist bereits eine Hub-Kennung (ServerImport-Pfad)
 */
export interface GruppenRef {
  id: string;
  legacy_id?: string | null;
  hub_id?: string | null;
}

const kennungVon = (g: GruppenRef | undefined | null) => (g ? g.hub_id || g.legacy_id || '' : '');

export function waehleGruppenKennung(
  projectId: string,
  pkTreffer: GruppenRef | undefined | null,
  alleGruppen: readonly GruppenRef[],
): string {
  const ausPk = kennungVon(pkTreffer);
  if (ausPk) return ausPk;
  const fallback = alleGruppen.find((g) => g.id === projectId || (!!g.hub_id && g.hub_id === projectId));
  const ausScan = kennungVon(fallback);
  if (ausScan) return ausScan;
  // projectId ist bereits eine Hub-UUID oder OID (ServerImport) -> unveraendert.
  return projectId;
}
