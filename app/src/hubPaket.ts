/**
 * Paketbau für das Senden an den Hub (999.1750, E-259) — reine Funktionen.
 *
 * Getrennt vom Datei-Export für DOCUframe (dfExport.ts): „An Server senden" nutzt immer diese
 * Pakete, der Formatschalter im Export wirkt nur auf die heruntergeladene Datei.
 *
 * Vertrag: tests/fixtures/protokoll_app_vertrag_v1.json (Kopie der Hub-Probe
 * backend/tests/fixtures/protokoll/protokoll_app_vertrag_v1.json, hub-server 47b00099).
 * Schlüssel belegt in hub-server backend/app/routers/protokoll_sync.py @ 47b00099:
 *  - JSON-Datei im ZIP = Liste von Paketen mit `ProtokollMeta`/`Elemente`, optional `terms`
 *    (`_iter_pakete` :574-588, Terms je Paket :961-962).
 *  - Protokoll eines Pakets = `ProtokollId` des ersten Elements (:996-1001); UUID wird beim ersten
 *    Upload Primärschlüssel, sonst OID (`_resolve_protokoll` :599-653). Kopf `Name`/`Nummer`/`Datum`
 *    (:595-597), Datum im DocuFrame-Format (`df_to_iso`).
 *  - Punkt: `Id` wie `ProtokollId` (`_upsert_element` :720-767); Felder aus `_ELEMENT_FELDER`
 *    (:530-548), Verortung und Fotos als `MobileErfassung` {GeoLat, GeoLon, GeoAccuracy, GeoText,
 *    GeoHeading, GeoAltitude, Fotos} (`_mobile_from_df` :504-524, :567-570). Fotonamen liest der
 *    Hub als `FileName` (services/protokoll_verortung.py :250).
 *  - Nur gesendete Schlüssel werden gesetzt und verglichen (`_element_columns` :551-571). Auf
 *    versendeten Protokollen übernimmt der Hub nur `status`/`positionstext`
 *    (services/protokoll_sperre.py :35) — deshalb gehen dort nur diese beiden Schlüssel hinaus.
 */
import type { FotoRef, Protokoll, Protokollelement } from './types';
import { istVerteilt } from './protokollRegeln.ts';

/** Kopf eines Pakets (Neuanlage oder offenes Protokoll). */
export interface HubProtokollMeta {
  Name: string;
  Nummer: number;
  Datum: string;
}

/** Ein Punkt im Paket; welche Schlüssel fehlen, lässt der Hub unverändert. */
export type HubElement = { Id: string; ProtokollId: string } & Record<string, unknown>;

export interface HubPaket {
  ProtokollMeta?: HubProtokollMeta;
  Elemente: HubElement[];
  terms?: unknown[];
}

export interface HubPaketErgebnis {
  pakete: HubPaket[];
  /** Punkte, die tatsächlich in einem Paket stehen (Reihenfolge wie im Paket). */
  elementIds: string[];
  /**
   * Punkte, die NICHT gepackt wurden, weil ihre Kennung (oder die ihres Protokolls) dem Hub noch
   * nicht sicher bekannt ist — Bestand vor dem Umstieg. Sie behalten ihre Änderungsmarke und gehen
   * nach dem nächsten Laden vom Server mit (ladeAbgleich.ts ordnet die Hub-UUID zu).
   */
  zurueckgehalten: string[];
}

/** Kennung gegenüber dem Hub: Hub-UUID, sonst DocuFrame-OID, sonst die lokale UUID. */
export function hubKennung(obj: { id: string; hub_id?: string | null; legacy_id?: string | null }): string {
  return obj.hub_id || obj.legacy_id || obj.id;
}

/**
 * Kennt der Hub die Kennung, unter der gesendet würde? Ja bei Hub-UUID oder OID; bei lokal neu
 * angelegten Objekten (`is_new`) wird die lokale UUID beim ersten Upload Primärschlüssel. Nein bei
 * Bestand vor dem Umstieg (lokale Zufalls-UUID, keine OID): gesendet entstünde im Hub eine Dublette.
 */
export function kennungGesichert(obj: { hub_id?: string | null; legacy_id?: string | null; is_new?: boolean }): boolean {
  return !!(obj.hub_id || obj.legacy_id || obj.is_new === true);
}

/**
 * Punkt nach belegter Übernahme durch den Hub (Marken löschen): ein neu angelegter Punkt ohne OID
 * behält seine UUID als hub_id — der Hub hat sie als Primärschlüssel übernommen.
 */
export function nachUebernahme<T extends { id: string; hub_id?: string; legacy_id?: string; is_new?: boolean; is_modified?: boolean }>(e: T): T {
  const hub_id = e.hub_id || (!e.legacy_id && e.is_new ? e.id : undefined);
  return { ...e, ...(hub_id ? { hub_id } : {}), is_new: false, is_modified: false };
}

const zwei = (n: number) => String(n).padStart(2, '0');

/**
 * Datum der App (ISO) -> DocuFrame-Form „TT.MM.JJJJ hh:mm:ss", wie sie der Hub mit `df_to_iso`
 * liest. Ohne Zeitzone wird die Zeichenkette umgestellt (keine Verschiebung), mit Zeitzone
 * (z. B. `…Z` aus toISOString) gilt die Ortszeit des Geräts. Unbekanntes bleibt unverändert.
 */
export function zuDfDatum(s: string | null | undefined): string {
  if (!s) return '';
  const lokal = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (lokal) {
    const [, jahr, monat, tag, std = '00', min = '00', sek = '00'] = lokal;
    return `${tag}.${monat}.${jahr} ${std}:${min}:${sek}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()} ${zwei(d.getHours())}:${zwei(d.getMinutes())}:${zwei(d.getSeconds())}`;
    }
  }
  return s;
}

type FotoEintrag = Partial<FotoRef> & { FileName?: string; RelativePath?: string; ZielPfad?: string };

function fotoFuerHub(f: FotoEintrag | string): unknown {
  if (typeof f === 'string') return { FileName: f, RelativePath: `photos/${f}`, ZielPfad: '' };
  return {
    FileName: f.file_name ?? f.FileName ?? '',
    RelativePath: f.relative_path ?? f.RelativePath ?? '',
    ZielPfad: f.ziel_pfad ?? f.ZielPfad ?? '',
  };
}

/** Punkt eines offenen Protokolls: alle Felder, die die App führt. */
function elementVoll(e: Protokollelement, protokollKennung: string): HubElement {
  const m = e.mobile_erfassung;
  const aus: HubElement = {
    Id: hubKennung(e),
    ProtokollId: protokollKennung,
    Position: e.position ?? '',
    Positionstitel: e.positionstitel ?? '',
    Positionstext: e.positionstext ?? '',
    Thema: e.thema ?? '',
    Status: e.status ?? 0,
    Termin: zuDfDatum(e.termin),
    VerantwortlicherOid: e.verantwortlicher_id ?? '',
    VerantwortlicherName: e.verantwortlicher_name ?? '',
    Bemerkung: e.bemerkung ?? '',
    Erinnerung: !!e.erinnerung,
    Wert: e.wert ?? 0,
  };
  // Nur, was die App kennt: ein unbekannter Wert (nicht geladen) darf den Hub-Stand nicht leeren.
  if (e.notiz !== undefined) aus.Notiz = e.notiz;
  if (e.info !== undefined) aus.Info = e.info;
  if (e.thema_term_id) aus.ThemaTermId = e.thema_term_id;
  aus.MobileErfassung = {
    GeoLat: m?.geo_lat ?? null,
    GeoLon: m?.geo_lon ?? null,
    GeoAccuracy: m?.geo_accuracy ?? null,
    GeoText: m?.geo_text ?? null,
    GeoHeading: m?.geo_heading ?? null,
    GeoAltitude: m?.geo_altitude ?? null,
    Fotos: ((m?.fotos ?? []) as (FotoEintrag | string)[]).map(fotoFuerHub),
  };
  return aus;
}

/** Punkt eines versendeten Protokolls: nur die Felder, die der Hub dort annimmt. */
function elementVerteilt(e: Protokollelement, protokollKennung: string): HubElement {
  return {
    Id: hubKennung(e),
    ProtokollId: protokollKennung,
    Status: e.status ?? 0,
    Positionstext: e.positionstext ?? '',
  };
}

const nachPosition = (a: Protokollelement, b: Protokollelement) =>
  (a.position ?? '').localeCompare(b.position ?? '', undefined, { numeric: true });

/**
 * Baut die Pakete für den Upload: ein Paket je Protokoll mit zu sendenden Punkten.
 * `protokolle` = alle Protokolle der Gruppe (für die Verteilt-Regel), `elemente` = die zu
 * sendenden Punkte. Punkte ohne auffindbares Protokoll werden nicht gepackt (sie behalten ihre
 * Änderungsmarke). `terms` (offline angelegte Themen) hängen am ersten Paket.
 * Reihenfolge: offene Protokolle vor versendeten, dann nach Nummer.
 */
export function baueHubPakete(eingabe: {
  protokolle: readonly Protokoll[];
  elemente: readonly Protokollelement[];
  terms?: unknown[] | null;
}): HubPaketErgebnis {
  const { protokolle, elemente } = eingabe;
  const jeProtokoll = new Map<string, Protokollelement[]>();
  const zurueckgehalten: string[] = [];
  for (const e of elemente) {
    const prot = protokolle.find(p => p.id === e.protokoll_id);
    if (!prot) continue;
    if (!kennungGesichert(e) || !kennungGesichert(prot)) {
      zurueckgehalten.push(e.id);
      continue;
    }
    const liste = jeProtokoll.get(e.protokoll_id) ?? [];
    liste.push(e);
    jeProtokoll.set(e.protokoll_id, liste);
  }

  const eintraege = [...jeProtokoll.entries()].map(([protId, punkte]) => {
    const prot = protokolle.find(p => p.id === protId)!;
    return { prot, punkte: [...punkte].sort(nachPosition), verteilt: istVerteilt(prot, protokolle) };
  });
  eintraege.sort((a, b) =>
    Number(a.verteilt) - Number(b.verteilt) ||
    a.prot.nummer - b.prot.nummer ||
    hubKennung(a.prot).localeCompare(hubKennung(b.prot)));

  const pakete: HubPaket[] = [];
  const elementIds: string[] = [];
  for (const { prot, punkte, verteilt } of eintraege) {
    const kennung = hubKennung(prot);
    const paket: HubPaket = verteilt
      ? { Elemente: punkte.map(e => elementVerteilt(e, kennung)) }
      : {
          ProtokollMeta: { Name: prot.name ?? '', Nummer: prot.nummer ?? 0, Datum: zuDfDatum(prot.datum) },
          Elemente: punkte.map(e => elementVoll(e, kennung)),
        };
    pakete.push(paket);
    elementIds.push(...punkte.map(e => e.id));
  }
  if (pakete.length > 0 && eingabe.terms && eingabe.terms.length > 0) {
    pakete[0].terms = eingabe.terms;
  }
  return { pakete, elementIds, zurueckgehalten };
}

// --- Nummern aus der Upload-Antwort (999.1750, Punkt 4) ----------------------------------------

/**
 * Nummer im Protokollnamen ersetzen, wenn der Name sie trägt: „Baubesprechung 3 - 2026" (Form der
 * Entwürfe, db.bildeEntwurfProtokoll) oder „Baubesprechung 3". Sonst bleibt der Name, wie er ist.
 */
export function nummerImNamen(name: string, alt: number, neu: number): string {
  const mitJahr = /^(.*?)(\d+)(\s*[-–]\s*\d{4})$/.exec(name);
  if (mitJahr && Number(mitJahr[2]) === alt) return `${mitJahr[1]}${neu}${mitJahr[3]}`;
  const amEnde = /^(.*\D)(\d+)$/.exec(name);
  if (amEnde && Number(amEnde[2]) === alt) return `${amEnde[1]}${neu}`;
  return name;
}

/**
 * Antwort `nummern` {Protokoll-Kennung wie gesendet -> Nummer im Hub} auf die lokalen Protokolle
 * anwenden (hub-server protokoll_sync.py :925-928, :1005-1006, :1045-1047). Die Kennung kann die
 * lokale id, die hub_id oder die OID sein (hubKennung beim Senden). Liefert nur geänderte
 * Protokolle — mit Hub-Nummer und angepasstem Namen; die Listen sortieren danach nach Nummer.
 */
export function planeNummern<T extends Pick<Protokoll, 'id' | 'name' | 'nummer'> & { hub_id?: string; legacy_id?: string }>(
  protokolle: readonly T[],
  nummern: Record<string, unknown> | null | undefined,
): T[] {
  const geaendert: T[] = [];
  for (const [kennung, wert] of Object.entries(nummern ?? {})) {
    if (typeof wert !== 'number' || !Number.isInteger(wert)) continue;
    const p = protokolle.find(x => x.id === kennung || x.hub_id === kennung || (!!x.legacy_id && x.legacy_id === kennung));
    if (!p || p.nummer === wert) continue;
    geaendert.push({ ...p, nummer: wert, name: nummerImNamen(p.name, p.nummer, wert) });
  }
  return geaendert;
}

/** Meldung im Export, wenn Punkte aus einem Ladestand vor dem Umstieg zurückgehalten wurden. */
export function textZurueckgehalten(anzahl: number): string | null {
  if (anzahl <= 0) return null;
  return anzahl === 1
    ? '1 Punkt stammt aus einem Ladestand vor der Umstellung und wird erst nach „Vom Server laden" gesendet. Seine Änderungen bleiben erhalten.'
    : `${anzahl} Punkte stammen aus einem Ladestand vor der Umstellung und werden erst nach „Vom Server laden" gesendet. Ihre Änderungen bleiben erhalten.`;
}
