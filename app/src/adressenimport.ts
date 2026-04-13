/**
 * Parser fuer DOCUframe Adressen-Export (adressen.json)
 * Extrahiert Adressen, Ansprechpartner und Wertelisten aus dem Hub-Format.
 */

import type { Adresse, Ansprechpartner, Werteliste } from './types';

function newUUID(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

interface ParseResult {
  adressen: Adresse[];
  ansprechpartner: Ansprechpartner[];
  wertelisten: Werteliste[];
  manifest: Record<string, unknown> | null;
}

export function parseAdressenJson(raw: unknown[]): ParseResult {
  const adressen: Adresse[] = [];
  const ansprechpartner: Ansprechpartner[] = [];
  const wertelisten: Werteliste[] = [];
  let manifest: Record<string, unknown> | null = null;

  for (const entry of raw) {
    const obj = entry as Record<string, unknown>;
    const objectType = obj['object_type'] as string | undefined;

    if (objectType === 'manifest' || objectType === 'manifest_ansprechpartner') {
      if (!manifest) manifest = obj;
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

    if (objectType === 'adresse') {
      const now = nowISO();
      const oid = (obj['_oid'] as string) || '';

      const rawData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!['_oid', '_klasse', 'object_type'].includes(key)) {
          rawData[key] = value;
        }
      }

      adressen.push({
        id: newUUID(),
        created_at: now,
        updated_at: now,
        created_by: null,
        object_type: 'adresse',
        legacy_id: oid,
        klasse: (obj['_klasse'] as string) || 'Adresse',
        name1: (obj['Name1'] as string) || '',
        name2: (obj['Name2'] as string) || '',
        kuerzel: (obj['Kuerzel'] as string) || '',
        nummer: (obj['Nummer'] as string) || '',
        strasse: (obj['Strasse'] as string) || '',
        hausnummer: (obj['Hausnummer'] as string) || '',
        plz: (obj['PLZ'] as string) || '',
        ort: (obj['Ort'] as string) || '',
        telefon: (obj['Telefon'] as string) || '',
        email: (obj['EMailAdresse'] as string) || '',
        raw_data: rawData,
      });
      continue;
    }

    if (objectType === 'ansprechpartner') {
      const now = nowISO();
      const oid = (obj['_oid'] as string) || '';

      const rawData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (!['_oid', '_parent_oid', '_parent_name', 'object_type'].includes(key)) {
          rawData[key] = value;
        }
      }

      ansprechpartner.push({
        id: newUUID(),
        created_at: now,
        updated_at: now,
        created_by: null,
        object_type: 'ansprechpartner',
        legacy_id: oid,
        parent_oid: (obj['_parent_oid'] as string) || '',
        parent_name: (obj['_parent_name'] as string) || '',
        name1: (obj['Name1'] as string) || '',
        name2: (obj['Name2'] as string) || '',
        kuerzel: (obj['Kuerzel'] as string) || '',
        nummer: (obj['Nummer'] as string) || '',
        telefon: (obj['Telefon'] as string) || '',
        email: (obj['EMailAdresse'] as string) || '',
        funktion: (obj['Funktion'] as string) || '',
        raw_data: rawData,
      });
      continue;
    }
  }

  console.log(`[AdressenImport] ${adressen.length} Adressen, ${ansprechpartner.length} Ansprechpartner, ${wertelisten.length} Wertelisten`);
  return { adressen, ansprechpartner, wertelisten, manifest };
}
