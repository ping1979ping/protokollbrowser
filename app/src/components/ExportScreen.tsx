import { useState, useEffect } from 'react';
import type { Protokoll, Protokollgruppe, Protokollelement } from '../types';
import { getElemente, getFotos, clearSyncFlags, getProtokolleByGruppe, savePendingExport, getPendingExports, deletePendingExport, updateElement } from '../db';
import { checkConnectivity, uploadZip } from '../syncService';
import { fetchWeather } from '../weatherService';
import JSZip from 'jszip';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  onBack: () => void;
}

type ExportFormat = 'classic' | 'v5c';

// ISO -> DOCUframe Datumsformat "DD.MM.YYYY HH:MM:SS"
function formatDfDatum(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildV5cExportJson(
  gruppe: Protokollgruppe,
  prots: Protokoll[],
  relevante: Protokollelement[],
  _protokoll: Protokoll,
  datum: string,
  autor: string,
  vorbemerkung: string,
): unknown[] {
  const exportArray: unknown[] = [];

  // Manifest (wird vom Import-Makro geskippt)
  exportArray.push({
    timestamp: formatDfDatum(new Date().toISOString()),
    version: 'app',
    GruppeId: gruppe.id,
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
      Id: prot.id,
      _ProtokollgruppeOid: gruppe.id,
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
      Id: elem.id,
      _ProtokollOid: elem.protokoll_id,
      Position: elem.position,
      Positionstitel: elem.positionstitel,
      Positionstext: elem.positionstext,
      Thema: elem.thema,
      Status: elem.status,
      Bemerkung: elem.bemerkung,
      Erinnerung: elem.erinnerung,
      Wert: elem.wert,
      Termin: formatDfDatum(elem.termin),
      _VerantwortlicherOid: elem.verantwortlicher_id,
      Breitengrad: geo.geo_lat ?? 0,
      Laengengrad: geo.geo_lon ?? 0,
      Genauigkeit: geo.geo_accuracy ?? 0,
      Kompassrichtung: geo.geo_heading ?? 0,
      'Standort-Anzeigetext': geo.geo_text || '',
      'Hoehe ueber NN': geo.geo_altitude ?? 0,
      'Anzahl Fotos': elem.foto_anzahl ?? 0,
      'Pfad Foto-Ordner': elem.foto_pfad ?? '',
      'Mobil erfasst': elem.mobil_erfasst ?? true,
      'Benutzer Kuerzel': elem.mobil_user ?? '',
      'Freitext-Notiz': elem.notiz ?? '',
      Info: elem.info ?? '',
      'Datum Mobil': elem.mobil_datum ? formatDfDatum(elem.mobil_datum) : '',
      VerweisArray: elem.verweise || [],
    });
  }

  return exportArray;
}

function buildClassicExportJson(
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

export default function ExportScreen({ protokoll, gruppe, onBack }: Props) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [autor, setAutor] = useState(protokoll.autor);
  const [vorbemerkung, setVorbemerkung] = useState(`Folgeprotokoll zu Nr. ${protokoll.nummer}`);
  const [exporting, setExporting] = useState(false);
  const [uploadResult, setUploadResult] = useState<'ok' | 'error' | null>(null);
  const [stats, setStats] = useState<{ geaendert: number; neu: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [exported, setExported] = useState(false);
  const [wetterStatus, setWetterStatus] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    () => (localStorage.getItem('exportFormat') as ExportFormat) || 'v5c'
  );

  useEffect(() => {
    getProtokolleByGruppe(gruppe.id).then(async (prots) => {
      const allElems = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      setStats({
        geaendert: allElems.filter(e => e.is_modified && !e.is_new).length,
        neu: allElems.filter(e => e.is_new).length,
      });
    });
    getPendingExports().then(exps => {
      setPendingCount(exps.filter(e => e.gruppeId === gruppe.id).length);
    });
  }, [gruppe.id]);

  function toggleFormat() {
    const next: ExportFormat = exportFormat === 'v5c' ? 'classic' : 'v5c';
    setExportFormat(next);
    localStorage.setItem('exportFormat', next);
  }

  async function exportieren() {
    setExporting(true);
    try {
      const prots = await getProtokolleByGruppe(gruppe.id);
      const alleElemente = (await Promise.all(prots.map(p => getElemente(p.id)))).flat();
      const relevante = alleElemente.filter(e => e.is_modified || e.is_new);

      if (relevante.length === 0) {
        alert('Keine Aenderungen zum Exportieren vorhanden.');
        setExporting(false);
        return;
      }

      // Bautagebuch-Elemente ohne Wetter nachladen
      const btOhneWetter = relevante.filter(e =>
        e.thema === 'Bautagebuch' &&
        e.positionstext.includes('Wetter: —') &&
        e.mobile_erfassung?.geo_lat != null
      );
      if (btOhneWetter.length > 0) {
        setWetterStatus(`Wetter fuer ${btOhneWetter.length} Eintrag/Eintraege nachladen...`);
        for (const btElem of btOhneWetter) {
          try {
            const datumMatch = btElem.termin?.slice(0, 10);
            const w = await fetchWeather(
              btElem.mobile_erfassung.geo_lat!,
              btElem.mobile_erfassung.geo_lon!,
              datumMatch || undefined
            );
            if (w) {
              btElem.positionstext = btElem.positionstext.replace('Wetter: —', `Wetter: ${w}`);
              await updateElement(btElem);
            }
          } catch { /* ignore */ }
        }
        setWetterStatus(null);
      }

      // JSON bauen je nach Format
      const exportJson = exportFormat === 'v5c'
        ? buildV5cExportJson(gruppe, prots, relevante, protokoll, datum, autor, vorbemerkung)
        : buildClassicExportJson(gruppe, prots, relevante, protokoll, datum, autor, vorbemerkung);

      const jsonFilename = exportFormat === 'v5c' ? 'protokolle.json' : 'protocol_export.json';

      // ZIP bauen
      const zip = new JSZip();
      zip.file(jsonFilename, JSON.stringify(exportJson, null, 2));
      const photosFolder = zip.folder('photos')!;

      for (const elem of relevante) {
        const elemFotos = await getFotos(elem.id);
        for (const foto of elemFotos) {
          photosFolder.file(foto.fileName, foto.blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `protocol_export_${ts}.zip`;
      const elementIds = relevante.map(e => e.id);

      // ZIP in IndexedDB speichern
      await savePendingExport({
        id: `export-${Date.now()}`,
        gruppeId: gruppe.id,
        blob: content,
        filename,
        elementIds,
        createdAt: new Date().toISOString(),
      });

      // Sofort versuchen hochzuladen
      const online = await checkConnectivity();
      if (online) {
        try {
          await uploadZip(gruppe.id, content, filename);
          await clearSyncFlags(elementIds);
          const exps = await getPendingExports();
          const latest = exps.find(e => e.filename === filename);
          if (latest) await deletePendingExport(latest.id);
          setUploadResult('ok');
          setExported(true);
        } catch {
          setPendingCount(prev => prev + 1);
          setExported(true);
        }
      } else {
        setPendingCount(prev => prev + 1);
        setExported(true);
      }

      // Lokaler Download als Backup
      if (localStorage.getItem('autoBackup') !== 'false') {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('Export-Fehler: ' + (err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <button onClick={onBack} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurueck</button>
        <h1 className="text-lg font-bold mt-1">Export</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Format-Umschalter */}
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-gray-900 text-sm">Export-Format</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {exportFormat === 'v5c'
                  ? 'DOCUframe V5c — direkt importierbar'
                  : 'Klassisch — Server-kompatibel'}
              </p>
            </div>
            <button
              onClick={toggleFormat}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                exportFormat === 'v5c'
                  ? 'bg-ping-blue text-white'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {exportFormat === 'v5c' ? 'V5c' : 'Klassisch'}
            </button>
          </div>
        </div>

        {/* Zusammenfassung */}
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <h2 className="font-medium text-gray-900 mb-2">Zusammenfassung</h2>
          {stats && (
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-medium text-orange-600">{stats.geaendert}</span> geaenderte Elemente</p>
              <p><span className="font-medium text-green-600">{stats.neu}</span> neue Elemente</p>
            </div>
          )}
        </div>

        {pendingCount > 0 && !exported && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
            <p className="text-yellow-800 text-sm font-medium">
              {pendingCount} Export{pendingCount > 1 ? 's' : ''} wartet auf Upload
            </p>
            <p className="text-yellow-600 text-xs mt-0.5">
              Wird automatisch gesendet sobald der Server erreichbar ist.
            </p>
          </div>
        )}

        {/* Protokoll-Metadaten */}
        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Neues Protokoll-Datum</label>
          <input
            type="date"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Autor</label>
          <input
            type="text"
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
        </div>

        <div className="bg-white rounded-xl p-3 border border-gray-100">
          <label className="text-xs text-gray-400 font-medium block mb-1">Vorbemerkung</label>
          <textarea
            value={vorbemerkung}
            onChange={(e) => setVorbemerkung(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ping-blue resize-none"
          />
        </div>

        <button
          onClick={exportieren}
          disabled={exporting || exported}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 active:bg-green-800 transition disabled:opacity-50"
        >
          {exporting ? (wetterStatus || 'Exportiere...') : exported ? 'Exportiert' : 'ZIP exportieren'}
        </button>

        {uploadResult === 'ok' && (
          <p className="text-green-600 text-sm font-medium text-center">Erfolgreich an Server gesendet!</p>
        )}

        {exported && uploadResult !== 'ok' && (
          <p className="text-yellow-600 text-sm font-medium text-center">
            Export gespeichert. Wird automatisch an Server gesendet sobald erreichbar.
          </p>
        )}

        <p className="text-xs text-gray-400 text-center">
          Die Protokollnummer N+1 wird beim Re-Import in DOCUframe automatisch berechnet.
        </p>
      </div>
    </div>
  );
}
