/**
 * Reine Entscheidungsfunktion fuer die Hub-legacy_id (DF-OID) eines Export-Calls.
 *
 * Aus syncService.resolveGruppenLegacyId extrahiert (06.3-Review IN-04), damit die
 * Fallback-Kette OHNE IndexedDB testbar ist (Node-Builtin-Runner `node --test`;
 * die PWA hat kein Vitest). Der IO-Teil (getProtokollgruppe/getAllGruppen) bleibt
 * im Service, die Auswahl-Logik ist hier rein.
 *
 * Reihenfolge:
 *   1. PK-Treffer (per lokaler UUID geladene Gruppe) mit legacy_id -> dessen legacy_id
 *   2. Fallback-Treffer im Voll-Scan (g.id === projectId) mit legacy_id -> dessen legacy_id
 *   3. sonst Passthrough: projectId ist bereits eine legacy_id (ServerImport-Pfad)
 */
export interface GruppenRef {
  id: string;
  legacy_id?: string | null;
}

export function waehleLegacyId(
  projectId: string,
  pkTreffer: GruppenRef | undefined | null,
  alleGruppen: readonly GruppenRef[],
): string {
  if (pkTreffer && pkTreffer.legacy_id) return pkTreffer.legacy_id;
  const fallback = alleGruppen.find((g) => g.id === projectId);
  if (fallback && fallback.legacy_id) return fallback.legacy_id;
  // projectId ist bereits eine legacy_id (ServerImport) -> unveraendert.
  return projectId;
}
