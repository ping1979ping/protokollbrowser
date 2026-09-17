/**
 * Datei-Export für DOCUframe (V5c und „Klassisch") — unverändert aus ExportScreen.tsx (Stand 537dfd8)
 * herausgelöst, damit der Inhalt der Sicherungsdatei ohne Browser prüfbar ist.
 *
 * Diese Bauer gehören NUR zum Datei-Download. An den Hub sendet die App seit 999.1750 immer die
 * Pakete aus hubPaket.ts. Die Ausgabe ist byte-gleich zum Stand 537dfd8 festgehalten:
 * tests/dfExport.test.ts gegen tests/fixtures/docuframe_export_*_537dfd8.json.
 */
import type { Protokoll, Protokollgruppe, Protokollelement } from './types';

export type ExportFormat = 'classic' | 'v5c';

// ISO -> DOCUframe Datumsformat "DD.MM.YYYY HH:MM:SS"
export function formatDfDatum(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function buildV5cExportJson(
  gruppe: Protokollgruppe,
  prots: Protokoll[],
  relevante: Protokollelement[],
  _protokoll: Protokoll,
  datum: string,
  autor: string,
  vorbemerkung: string,
  verantwortlicheMap?: Map<string, string>,
): unknown[] {
  const exportArray: unknown[] = [];

  // Manifest (wird vom Import-Makro als Element[0] gelesen)
  exportArray.push({
    timestamp: formatDfDatum(new Date().toISOString()),
    version: 'hub',
    gruppe_id: gruppe.legacy_id || gruppe.id,
    gruppe_name: gruppe.name,
    // Abwaertskompatibel
    GruppeId: gruppe.legacy_id || gruppe.id,
    GruppeName: gruppe.name,
  });

  // Elemente nach Quell-Protokoll gruppieren
  const byProtokoll = new Map<string, Protokollelement[]>();
  for (const e of relevante) {
    const list = byProtokoll.get(e.protokoll_id) || [];
    list.push(e);
    byProtokoll.set(e.protokoll_id, list);
  }

  // Protokolle (fuer jeden betroffenen Protokoll)
  for (const [protId] of byProtokoll) {
    const prot = prots.find(p => p.id === protId);
    if (!prot) continue;
    const isAnhang = prot.nummer < 0;

    exportArray.push({
      object_type: 'protokoll',
      id: prot.id,
      legacy_id: prot.legacy_id || '',
      _ProtokollgruppeOid: gruppe.legacy_id || gruppe.id,
      Name: prot.name,
      Datum: isAnhang ? formatDfDatum(prot.datum) : formatDfDatum(datum + 'T09:00:00'),
      Ort: prot.ort,
      Autor: isAnhang ? prot.autor : autor,
      Vorbemerkung: isAnhang ? prot.vorbemerkung : vorbemerkung,
      Nachbemerkung: prot.nachbemerkung || '',
      Signatur: prot.signatur || '',
      Erledigt: prot.erledigt,
      Erstellt: prot.erstellt,
      Verteilt: false,
      TeilnehmerAnmerkung: '',
      _TeilnehmerOids: prot.teilnehmer?.map(t => t.oid).filter(Boolean) || [],
      _VerteilerOids: prot.verteiler?.map(t => t.oid).filter(Boolean) || [],
    });
  }

  // Elemente (nur geaenderte/neue)
  for (const elem of relevante) {
    const geo = elem.mobile_erfassung || { geo_lat: null, geo_lon: null, geo_accuracy: null, geo_text: null, geo_heading: null, geo_altitude: null };
    exportArray.push({
      object_type: 'protokollelement',
      id: elem.id,
      legacy_id: elem.legacy_id || '',
      is_new: elem.is_new || false,
      is_modified: elem.is_modified || false,
      protokoll_id: elem.protokoll_id,
      position: elem.position,
      positionstitel: elem.positionstitel,
      positionstext: elem.positionstext,
      thema: elem.thema,
      status: elem.status,
      bemerkung: elem.bemerkung,
      erinnerung: elem.erinnerung,
      wert: elem.wert,
      termin: formatDfDatum(elem.termin),
      verantwortlicher_id: elem.verantwortlicher_id,
      verantwortlicher_legacy_id: (elem.verantwortlicher_id && verantwortlicheMap?.get(elem.verantwortlicher_id)) || '',
      mobile_erfassung: {
        geo_lat: geo.geo_lat ?? 0,
        geo_lon: geo.geo_lon ?? 0,
        geo_accuracy: geo.geo_accuracy ?? 0,
        geo_heading: geo.geo_heading ?? 0,
        geo_text: geo.geo_text || '',
        geo_altitude: geo.geo_altitude ?? 0,
      },
      foto_anzahl: elem.foto_anzahl ?? 0,
      foto_pfad: elem.foto_pfad ?? '',
      mobil_erfasst: elem.mobil_erfasst ?? true,
      mobil_user: elem.mobil_user ?? '',
      notiz: elem.notiz ?? '',
      info: elem.info ?? '',
      mobil_datum: elem.mobil_datum ? formatDfDatum(elem.mobil_datum) : '',
      verweise: elem.verweise || [],
    });
  }

  return exportArray;
}

export function buildClassicExportJson(
  gruppe: Protokollgruppe,
  prots: Protokoll[],
  relevante: Protokollelement[],
  protokoll: Protokoll,
  datum: string,
  autor: string,
  vorbemerkung: string,
): unknown[] {
  function buildExportElement(e: Protokollelement) {
    const isNeu = e.is_new;
    const base: Record<string, unknown> = {
      Aktion: isNeu ? 'CREATE' : 'UPDATE',
      DfElementId: isNeu ? null : e.id,
    };

    if (isNeu) {
      base.Position = e.position;
      base.Positionstitel = e.positionstitel;
      base.Positionstext = e.positionstext;
      base.Thema = e.thema;
      base.Status = e.status;
      base.Termin = e.termin;
      base.Verweise = e.verweise || [];
      // 06.5-09: kanonische/Client-UUID des Themas (Hub loest sie via term_remap auf).
      base.ThemaTermId = e.thema_term_id ?? '';
    } else {
      base.StatusNeu = e.status;
      base.TerminNeu = e.termin;
    }

    base.BemerkungNeu = e.bemerkung;
    base.VerantwortlicherFirmaOidNeu = e.verantwortlicher_id;
    base.MobileDaten = {
      GeoLat: e.mobile_erfassung.geo_lat,
      GeoLon: e.mobile_erfassung.geo_lon,
      GeoAccuracy: e.mobile_erfassung.geo_accuracy,
      GeoText: e.mobile_erfassung.geo_text || '',
      GeoHeading: e.mobile_erfassung.geo_heading,
      GeoAltitude: e.mobile_erfassung.geo_altitude,
      Fotos: e.mobile_erfassung.fotos,
      FotoAnzahl: e.foto_anzahl ?? 0,
      FotoPfad: e.foto_pfad ?? '',
      MobilErfasst: e.mobil_erfasst ?? false,
      MobilDatum: e.mobil_datum ?? '',
      MobilUser: e.mobil_user ?? '',
      Notiz: e.notiz ?? '',
      Info: e.info ?? '',
    };

    return base;
  }

  const byProtokoll = new Map<string, Protokollelement[]>();
  for (const e of relevante) {
    const list = byProtokoll.get(e.protokoll_id) || [];
    list.push(e);
    byProtokoll.set(e.protokoll_id, list);
  }

  const exportJson: unknown[] = [];
  for (const [protId, elems] of byProtokoll) {
    const prot = prots.find(p => p.id === protId);
    const isAnhang = prot && prot.nummer < 0;

    if (isAnhang) {
      exportJson.push({
        ProtokollgruppeId: gruppe.id,
        ProtokollIdAlt: protId,
        AktionProtokoll: 'APPEND',
        ProtokollMeta: null,
        Elemente: elems.map(buildExportElement),
      });
    } else {
      exportJson.push({
        ProtokollgruppeId: gruppe.id,
        ProtokollIdAlt: protokoll.id,
        AktionProtokoll: 'CREATE',
        ProtokollMeta: {
          Name: `${protokoll.name.replace(/\d+$/, '')}${protokoll.nummer + 1}`,
          Datum: datum + 'T09:00:00',
          Ort: protokoll.ort,
          Autor: autor,
          Vorbemerkung: vorbemerkung,
          Nachbemerkung: '',
        },
        Elemente: elems.map(buildExportElement),
      });
    }
  }

  return exportJson;
}
