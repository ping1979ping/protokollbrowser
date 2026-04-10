/**
 * Parser fuer DOCUframe Projekt-Export (projekte.json)
 * Extrahiert Wertelisten und Projekte aus dem Hub-Format.
 */

import type { Projekt, Werteliste } from './types';

function newUUID(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

interface ParseResult {
  projekte: Projekt[];
  wertelisten: Werteliste[];
  manifest: Record<string, unknown> | null;
}

export function parseProjekteJson(raw: unknown[]): ParseResult {
  const projekte: Projekt[] = [];
  const wertelisten: Werteliste[] = [];
  let manifest: Record<string, unknown> | null = null;

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    const objectType = obj['object_type'] as string | undefined;

    if (objectType === 'manifest') {
      manifest = obj;
      continue;
    }

    if (objectType === 'werteliste') {
      const eintraegeRaw = (obj['eintraege'] as Array<Record<string, unknown>>) || [];
      wertelisten.push({
        id: newUUID(),
        klasse: (obj['klasse'] as string) || '',
        feld: (obj['feld'] as string) || '',
        eintraege: eintraegeRaw.map(e => ({
          wert: (e['wert'] as number) || 0,
          text: (e['text'] as string) || '',
        })),
      });
      continue;
    }

    if (objectType === 'projekt' || '_oid' in obj) {
      const now = nowISO();
      const oid = (obj['_oid'] as string) || '';

      const rawData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_oid' && key !== 'object_type') {
          rawData[key] = value;
        }
      }

      projekte.push({
        id: newUUID(),
        created_at: now,
        updated_at: now,
        created_by: null,
        object_type: 'projekt',
        legacy_id: oid,
        nummer: (obj['Nummer'] as string) || '',
        bezeichnung: (obj['Bezeichnung'] as string) || (obj['Name'] as string) || '',
        status: typeof obj['_IMSStatus'] === 'number' ? obj['_IMSStatus'] : 0,
        projektleiter_kuerzel: (obj['_IMSProjektleiter_kuerzel'] as string) || '',
        projektleiter_name: (obj['_IMSProjektleiter_name'] as string) || '',
        projektleiter_oid: (obj['_IMSProjektleiter_oid'] as string) || '',
        raw_data: rawData,
      });
      continue;
    }
  }

  console.log(`[ProjektImport] ${projekte.length} Projekte, ${wertelisten.length} Wertelisten`);
  return { projekte, wertelisten, manifest };
}

export function filterProjekteByStatus(
  projekte: Projekt[],
  statusTexte: string[],
  werteliste: Werteliste | undefined,
): Projekt[] {
  if (!werteliste) {
    console.warn('[ProjektImport] Keine Werteliste fuer Status, kein Filter angewendet');
    return projekte;
  }

  const allowedValues = new Set<number>();
  for (const text of statusTexte) {
    const eintrag = werteliste.eintraege.find(e =>
      e.text.toLowerCase() === text.toLowerCase()
    );
    if (eintrag) {
      allowedValues.add(eintrag.wert);
    } else {
      console.warn(`[ProjektImport] Status-Wert "${text}" nicht in Werteliste gefunden`);
    }
  }

  if (allowedValues.size === 0) {
    console.warn('[ProjektImport] Keine gueltigen Status-Werte gefunden, alle Projekte behalten');
    return projekte;
  }

  const filtered = projekte.filter(p => allowedValues.has(p.status));
  console.log(`[ProjektImport] Filter: ${filtered.length}/${projekte.length} Projekte mit Status ${[...allowedValues].join(', ')}`);
  return filtered;
}
