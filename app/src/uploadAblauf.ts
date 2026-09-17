/**
 * Upload eines ausstehenden Exports — EIN Ablauf für den Vordergrund (ExportScreen) und den
 * Hintergrund (useSyncStatus, sobald der Server wieder erreichbar ist). B4, RULE-7: beide Wege
 * löschen dieselben Änderungsmarken, behalten denselben Export und erzeugen dieselbe Meldung.
 *
 * Lebenslauf eines ausstehenden Exports:
 *  1. gespeichert, noch nicht gesendet (`auswertung` fehlt) -> wird gesendet, im Hintergrund
 *     bei jedem Erreichbar-Wechsel erneut versucht, bis der Hub antwortet.
 *  2. Hub hat alles übernommen -> Marken gelöscht, Export gelöscht.
 *  3. Hub hat NICHT alles übernommen (abgelehnt, übersprungen, unverarbeitet, Duplikat) ->
 *     nur belegt übernommene Marken gelöscht; der Export bleibt MIT Auswertung liegen und wird
 *     nicht erneut gesendet (der Hub hat die ZIP verarbeitet und antwortete sonst nur
 *     „duplicate"). Die Meldung bleibt sichtbar, bis der Nutzer sie als gelesen bestätigt.
 *  4. gelesen -> der Export wird erst gelöscht, wenn keiner seiner Punkte mehr eine
 *     Änderungsmarke trägt, also nichts Abgelehntes oder Unverarbeitetes mehr offen ist.
 *
 * Reine Ablauflogik; IndexedDB und Upload kommen als Abhängigkeiten herein
 * (Belegung: uploadAblaufDb.ts). Tests: tests/uploadAblauf.test.ts, Verdrahtung:
 * tests/uploadVerdrahtung.test.ts.
 */
import { werteUploadAus, type UploadAuswertung, type UploadBericht } from './uploadAuswertung.ts';

/** Benennung eines übersprungenen Punkts, festgehalten zum Zeitpunkt der Auswertung. */
export interface UploadPunkt {
  id: string;
  position: string;
  text: string;
  protokoll?: string;
}

export interface AusstehenderExport {
  id: string;
  gruppeId: string;
  blob: Blob;
  filename: string;
  elementIds: string[];
  createdAt: string;
  /** Antwort des Hub ausgewertet, aber nicht alles übernommen — wird nicht erneut gesendet. */
  auswertung?: UploadAuswertung;
  ausgewertetAm?: string;
  punkte?: UploadPunkt[];
  /** Meldung vom Nutzer als gelesen bestätigt. */
  gelesenAm?: string;
}

/** Was der Ablauf von einem gesendeten Punkt braucht (Auswertung, Benennung, offene Marken). */
export interface UploadElement {
  id: string;
  legacy_id?: string;
  position?: string;
  positionstext?: string;
  positionstitel?: string;
  protokoll_id?: string;
  is_new?: boolean;
  is_modified?: boolean;
}

export interface UploadAblaufDeps {
  upload: (gruppeId: string, blob: Blob, filename: string) => Promise<UploadBericht>;
  ladeElement: (id: string) => Promise<UploadElement | undefined>;
  loescheMarken: (ids: string[]) => Promise<void>;
  speichereExport: (exp: AusstehenderExport) => Promise<void>;
  loescheExport: (id: string) => Promise<void>;
  protokollName?: (protokollId: string) => Promise<string | undefined>;
  jetzt?: () => string;
}

const zeit = (deps: UploadAblaufDeps) => (deps.jetzt ? deps.jetzt() : new Date().toISOString());

async function ladeElemente(ids: readonly string[], deps: UploadAblaufDeps): Promise<UploadElement[]> {
  return (await Promise.all(ids.map(id => deps.ladeElement(id)))).filter((e): e is UploadElement => !!e);
}

/**
 * Sendet einen ausstehenden Export und setzt die Antwort um (Schritte 2 und 3 oben).
 * Netz- und HTTP-Fehler gehen an den Aufrufer; der Export bleibt dann unverändert ausstehend.
 * `datensatz` ist der liegen gebliebene Export mit Auswertung, `null` bei vollständiger Übernahme.
 */
export async function sendeExport(
  exp: AusstehenderExport,
  deps: UploadAblaufDeps,
): Promise<{ auswertung: UploadAuswertung; datensatz: AusstehenderExport | null }> {
  const bericht = await deps.upload(exp.gruppeId, exp.blob, exp.filename);
  const elemente = await ladeElemente(exp.elementIds, deps);
  const auswertung = werteUploadAus(bericht, elemente);
  await deps.loescheMarken(auswertung.markenLoeschen);

  if (auswertung.vollstaendig) {
    await deps.loescheExport(exp.id);
    return { auswertung, datensatz: null };
  }

  const punkte: UploadPunkt[] = [];
  for (const id of auswertung.uebersprungen) {
    const e = elemente.find(x => x.id === id);
    if (!e) continue;
    punkte.push({
      id,
      position: e.position ?? '',
      text: (e.positionstext || e.positionstitel || '').slice(0, 60),
      protokoll: e.protokoll_id && deps.protokollName ? await deps.protokollName(e.protokoll_id) : undefined,
    });
  }
  const datensatz: AusstehenderExport = { ...exp, auswertung, ausgewertetAm: zeit(deps), punkte, gelesenAm: undefined };
  await deps.speichereExport(datensatz);
  return { auswertung, datensatz };
}

/** Exporte, die noch gesendet werden müssen: gespeichert, aber ohne Antwort des Hub. */
export function nochZuSenden(exps: readonly AusstehenderExport[]): AusstehenderExport[] {
  return exps.filter(e => !e.auswertung);
}

/** Hintergrundweg: jeden noch nicht gesendeten Export senden; ein Fehler hält die übrigen nicht auf. */
export async function sendeAusstehende(
  exps: readonly AusstehenderExport[],
  deps: UploadAblaufDeps,
): Promise<{ gesendet: number; fehlgeschlagen: number }> {
  let gesendet = 0;
  let fehlgeschlagen = 0;
  for (const exp of nochZuSenden(exps)) {
    try {
      await sendeExport(exp, deps);
      gesendet++;
    } catch (err) {
      fehlgeschlagen++;
      console.warn('[Sync] Ausstehender Export nicht gesendet:', exp.filename, err);
    }
  }
  return { gesendet, fehlgeschlagen };
}

/** Meldungen, die der Nutzer in dieser Gruppe noch nicht gelesen hat (älteste zuerst). */
export function ungeleseneMeldungen(exps: readonly AusstehenderExport[], gruppeId: string): AusstehenderExport[] {
  return exps
    .filter(e => e.gruppeId === gruppeId && !!e.auswertung && !e.gelesenAm)
    .sort((a, b) => (a.ausgewertetAm ?? '').localeCompare(b.ausgewertetAm ?? ''));
}

/** Meldung als gelesen bestätigen; der Export wird gelöscht, sobald keine seiner Marken mehr offen ist. */
export async function meldungGelesen(exp: AusstehenderExport, deps: UploadAblaufDeps): Promise<void> {
  const gelesen: AusstehenderExport = { ...exp, gelesenAm: zeit(deps) };
  await deps.speichereExport(gelesen);
  await raeumeErledigteAuf([gelesen], deps);
}

/** Gelesene, ausgewertete Exporte löschen, deren Punkte keine Änderungsmarke mehr tragen. Ungelesene bleiben. */
export async function raeumeErledigteAuf(exps: readonly AusstehenderExport[], deps: UploadAblaufDeps): Promise<void> {
  for (const exp of exps) {
    if (!exp.auswertung || !exp.gelesenAm) continue;
    const elemente = await ladeElemente(exp.elementIds, deps);
    if (!elemente.some(e => e.is_new || e.is_modified)) await deps.loescheExport(exp.id);
  }
}
