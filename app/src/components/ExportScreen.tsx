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

// ISO → DOCUframe Datumsformat "DD.MM.YYYY HH:MM:SS"
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
    GruppeId: gruppe.Id,
    GruppeName: gruppe.Name,
  });

  // Elemente nach Quell-Protokoll gruppieren
  const byProtokoll = new Map<string, Protokollelement[]>();
  for (const e of relevante) {
    const list = byProtokoll.get(e.ProtokollId) || [];
    list.push(e);
    byProtokoll.set(e.ProtokollId, list);
  }

  // Protokolle (fuer jeden betroffenen Protokoll)
  for (const [protId] of byProtokoll) {
    const prot = prots.find(p => p.Id === protId);
    if (!prot) continue;
    const isAnhang = prot.Nummer < 0;

    exportArray.push({
      Id: prot.Id,
      _ProtokollgruppeOid: gruppe.Id,
      Name: prot.Name,
      Datum: isAnhang ? formatDfDatum(prot.Datum) : formatDfDatum(datum + 'T09:00:00'),
      Ort: prot.Ort,
      Autor: isAnhang ? prot.Autor : autor,
      Vorbemerkung: isAnhang ? prot.Vorbemerkung : vorbemerkung,
      Nachbemerkung: prot.Nachbemerkung || '',
      Signatur: prot.Signatur || '',
      Erledigt: prot.Erledigt,
      Erstellt: prot.Erstellt,
      Verteilt: false,
      TeilnehmerAnmerkung: '',
      _TeilnehmerOids: prot.Teilnehmer?.map(t => t.Oid).filter(Boolean) || [],
      _VerteilerOids: prot.Verteiler?.map(t => t.Oid).filter(Boolean) || [],
    });
  }

  // Elemente (nur geaenderte/neue)
  for (const elem of relevante) {
    const geo = elem.MobileErfassung || { GeoLat: null, GeoLon: null, GeoAccuracy: null, GeoText: null, GeoHeading: null, GeoAltitude: null };
    exportArray.push({
      Id: elem.Id,
      _ProtokollOid: elem.ProtokollId,
      Position: elem.Position,
      Positionstitel: elem.Positionstitel,
      Positionstext: elem.Positionstext,
      Thema: elem.Thema,
      Status: elem.Status,
      Bemerkung: elem.Bemerkung,
      Erinnerung: elem.Erinnerung,
      Wert: elem.Wert,
      Termin: formatDfDatum(elem.Termin),
      _VerantwortlicherOid: elem.VerantwortlicherFirmaOid,
      Breitengrad: geo.GeoLat ?? 0,
      Laengengrad: geo.GeoLon ?? 0,
      Genauigkeit: geo.GeoAccuracy ?? 0,
      Kompassrichtung: geo.GeoHeading ?? 0,
      'Standort-Anzeigetext': geo.GeoText || '',
      'Hoehe ueber NN': geo.GeoAltitude ?? 0,
      'Anzahl Fotos': elem.FotoAnzahl ?? 0,
      'Pfad Foto-Ordner': elem.FotoPfad ?? '',
      'Mobil erfasst': elem.MobilErfasst ?? true,
      'Benutzer Kuerzel': elem.MobilUser ?? '',
      'Freitext-Notiz': elem.Notiz ?? '',
      Info: elem.Info ?? '',
      'Datum Mobil': elem.MobilDatum ? formatDfDatum(elem.MobilDatum) : '',
      VerweisArray: elem.Verweise || [],
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
    const isNeu = e._neu;
    const base: Record<string, unknown> = {
      Aktion: isNeu ? 'CREATE' : 'UPDATE',
      DfElementId: isNeu ? null : e.Id,
    };

    if (isNeu) {
      base.Position = e.Position;
      base.Positionstitel = e.Positionstitel;
      base.Positionstext = e.Positionstext;
      base.Thema = e.Thema;
      base.Status = e.Status;
      base.Termin = e.Termin;
      base.Verweise = e.Verweise || [];
    } else {
      base.StatusNeu = e.Status;
      base.TerminNeu = e.Termin;
    }

    base.BemerkungNeu = e.Bemerkung;
    base.VerantwortlicherFirmaOidNeu = e.VerantwortlicherFirmaOid;
    base.MobileDaten = {
      GeoLat: e.MobileErfassung.GeoLat,
      GeoLon: e.MobileErfassung.GeoLon,
      GeoAccuracy: e.MobileErfassung.GeoAccuracy,
      GeoText: e.MobileErfassung.GeoText || '',
      GeoHeading: e.MobileErfassung.GeoHeading,
      GeoAltitude: e.MobileErfassung.GeoAltitude,
      Fotos: e.MobileErfassung.Fotos,
      FotoAnzahl: e.FotoAnzahl ?? 0,
      FotoPfad: e.FotoPfad ?? '',
      MobilErfasst: e.MobilErfasst ?? false,
      MobilDatum: e.MobilDatum ?? '',
      MobilUser: e.MobilUser ?? '',
      Notiz: e.Notiz ?? '',
      Info: e.Info ?? '',
    };

    return base;
  }

  const byProtokoll = new Map<string, Protokollelement[]>();
  for (const e of relevante) {
    const list = byProtokoll.get(e.ProtokollId) || [];
    list.push(e);
    byProtokoll.set(e.ProtokollId, list);
  }

  const exportJson: unknown[] = [];
  for (const [protId, elems] of byProtokoll) {
    const prot = prots.find(p => p.Id === protId);
    const isAnhang = prot && prot.Nummer < 0;

    if (isAnhang) {
      exportJson.push({
        ProtokollgruppeId: gruppe.Id,
        ProtokollIdAlt: protId,
        AktionProtokoll: 'APPEND',
        ProtokollMeta: null,
        Elemente: elems.map(buildExportElement),
      });
    } else {
      exportJson.push({
        ProtokollgruppeId: gruppe.Id,
        ProtokollIdAlt: protokoll.Id,
        AktionProtokoll: 'CREATE',
        ProtokollMeta: {
          Name: `${protokoll.Name.replace(/\d+$/, '')}${protokoll.Nummer + 1}`,
          Datum: datum + 'T09:00:00',
          Ort: protokoll.Ort,
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
  const [autor, setAutor] = useState(protokoll.Autor);
  const [vorbemerkung, setVorbemerkung] = useState(`Folgeprotokoll zu Nr. ${protokoll.Nummer}`);
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
    getProtokolleByGruppe(gruppe.Id).then(async (prots) => {
      const allElems = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      setStats({
        geaendert: allElems.filter(e => e._geaendert && !e._neu).length,
        neu: allElems.filter(e => e._neu).length,
      });
    });
    getPendingExports().then(exps => {
      setPendingCount(exps.filter(e => e.gruppeId === gruppe.Id).length);
    });
  }, [gruppe.Id]);

  function toggleFormat() {
    const next: ExportFormat = exportFormat === 'v5c' ? 'classic' : 'v5c';
    setExportFormat(next);
    localStorage.setItem('exportFormat', next);
  }

  async function exportieren() {
    setExporting(true);
    try {
      const prots = await getProtokolleByGruppe(gruppe.Id);
      const alleElemente = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      const relevante = alleElemente.filter(e => e._geaendert || e._neu);

      if (relevante.length === 0) {
        alert('Keine Änderungen zum Exportieren vorhanden.');
        setExporting(false);
        return;
      }

      // Bautagebuch-Elemente ohne Wetter nachladen
      const btOhneWetter = relevante.filter(e =>
        e.Thema === 'Bautagebuch' &&
        e.Positionstext.includes('Wetter: —') &&
        e.MobileErfassung?.GeoLat != null
      );
      if (btOhneWetter.length > 0) {
        setWetterStatus(`Wetter für ${btOhneWetter.length} Eintrag/Einträge nachladen...`);
        for (const btElem of btOhneWetter) {
          try {
            const datumMatch = btElem.Termin?.slice(0, 10);
            const w = await fetchWeather(
              btElem.MobileErfassung.GeoLat!,
              btElem.MobileErfassung.GeoLon!,
              datumMatch || undefined
            );
            if (w) {
              btElem.Positionstext = btElem.Positionstext.replace('Wetter: —', `Wetter: ${w}`);
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
        const elemFotos = await getFotos(elem.Id);
        for (const foto of elemFotos) {
          photosFolder.file(foto.fileName, foto.blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `protocol_export_${ts}.zip`;
      const elementIds = relevante.map(e => e.Id);

      // ZIP in IndexedDB speichern
      await savePendingExport({
        id: `export-${Date.now()}`,
        gruppeId: gruppe.Id,
        blob: content,
        filename,
        elementIds,
        createdAt: new Date().toISOString(),
      });

      // Sofort versuchen hochzuladen
      const online = await checkConnectivity();
      if (online) {
        try {
          await uploadZip(gruppe.Id, content, filename);
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
        <button onClick={onBack} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurück</button>
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
              <p><span className="font-medium text-orange-600">{stats.geaendert}</span> geänderte Elemente</p>
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
