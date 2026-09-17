/**
 * Zugriff auf die Vertragsprobe protokoll_app_vertrag_v1.json (unveränderte Kopie aus hub-server
 * backend/tests/fixtures/protokoll/, 47b00099) für die Tests des Datenwegs App -> Hub.
 */
import { readFileSync } from 'node:fs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON-Probe, Struktur prüfen die Tests
export const vertrag: any = JSON.parse(readFileSync(new URL('./protokoll_app_vertrag_v1.json', import.meta.url), 'utf8'));

/** `bestand` der Vertragsprobe in der Form von GET /projects/{id}/export (hierarchisch, wie serialize_hierarchical). */
export function exportAusBestand(b: { gruppe: Record<string, unknown>; protokolle: Record<string, unknown>[] }): unknown[] {
  return [{
    Protokollgruppe: [{
      ...b.gruppe, ProjektNummer: '4711',
      Protokoll: b.protokolle.map((p) => {
        const { Elemente, ...kopf } = p;
        return { ...kopf, Protokollelemente: [(Elemente as Record<string, unknown>[]).map(e => ({ ...e, ProtokollId: '' }))] };
      }),
    }],
  }];
}
