import { useState, useEffect } from 'react';
import type { Protokoll, Protokollgruppe, Protokollelement } from '../types';
import { getElemente, getFotos, getProtokolleByGruppe, savePendingExport, getPendingExports, updateElement, getVerantwortliche, type PendingExport } from '../db';
import { checkConnectivity, collectOfflineTermsPaket } from '../syncService';
import { sendeExport, meldungGelesen, nochZuSenden } from '../uploadAblauf';
import { uploadAblaufDeps } from '../uploadAblaufDb';
import UploadMeldung from './UploadMeldung';
import { fetchWeather } from '../weatherService';
import { buildV5cExportJson, buildClassicExportJson, type ExportFormat } from '../dfExport';
import { baueHubPakete, textZurueckgehalten } from '../hubPaket';
import JSZip from 'jszip';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  onBack: () => void;
}

/** Fotos der gesendeten Punkte in den Ordner `photos/` des ZIP legen. */
async function legeFotosAb(zip: JSZip, elemente: readonly Protokollelement[]): Promise<void> {
  const photosFolder = zip.folder('photos')!;
  for (const elem of elemente) {
    const elemFotos = await getFotos(elem.id);
    for (const foto of elemFotos) {
      photosFolder.file(foto.fileName, foto.blob);
    }
  }
}

export default function ExportScreen({ protokoll, gruppe, onBack }: Props) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [autor, setAutor] = useState(protokoll.autor);
  const [vorbemerkung, setVorbemerkung] = useState(`Folgeprotokoll zu Nr. ${protokoll.nummer}`);
  const [exporting, setExporting] = useState(false);
  const [uploadResult, setUploadResult] = useState<'ok' | 'teilweise' | null>(null);
  // B4: nicht vollständig übernommener Export (liegt mit Auswertung, bis die Meldung gelesen ist)
  const [liegenGeblieben, setLiegenGeblieben] = useState<PendingExport | null>(null);
  const [meldungBestaetigt, setMeldungBestaetigt] = useState(false);
  const [stats, setStats] = useState<{ geaendert: number; neu: number } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [exported, setExported] = useState(false);
  const [wetterStatus, setWetterStatus] = useState<string | null>(null);
  // 999.1750: zurückgehaltene Punkte (Kennung dem Hub unbekannt) und „nichts zu senden"
  const [zurueckgehalten, setZurueckgehalten] = useState(0);
  const [ohneVersand, setOhneVersand] = useState(false);
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
      // Ausgewertete Exporte warten nicht mehr auf den Upload (B4)
      setPendingCount(nochZuSenden(exps).filter(e => e.gruppeId === gruppe.id).length);
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
        alert('Keine Änderungen zum Exportieren vorhanden.');
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
        setWetterStatus(`Wetter für ${btOhneWetter.length} ${btOhneWetter.length === 1 ? 'Eintrag' : 'Einträge'} nachladen …`);
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

      // 06.5-09 (§6.8): offline angelegte Themen. Die Hub-Reconciliation (06.5-06) upsertet sie
      // auf name_norm und liefert ``term_remap`` zurueck (uploadZip wendet es still an).
      const termsPaket = gruppe.projekt_id ? await collectOfflineTermsPaket(gruppe.projekt_id) : null;

      // Sicherungsdatei für DOCUframe: Format nach Schalter, Inhalt unverändert (dfExport.ts).
      // Gebaut vor dem Senden wie bisher, heruntergeladen danach.
      let datei: { blob: Blob; name: string } | null = null;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      if (localStorage.getItem('autoBackup') !== 'false') {
        // Verantwortliche-Lookup (UUID → legacy_id)
        const verantwortliche = await getVerantwortliche();
        const verantwortlicheMap = new Map(verantwortliche.map(v => [v.id, v.legacy_id]));
        const exportJson = exportFormat === 'v5c'
          ? buildV5cExportJson(gruppe, prots, relevante, protokoll, datum, autor, vorbemerkung, verantwortlicheMap)
          : buildClassicExportJson(gruppe, prots, relevante, protokoll, datum, autor, vorbemerkung);
        const jsonFilename = exportFormat === 'v5c' ? 'protokolle.json' : 'protocol_export.json';
        if (termsPaket) exportJson.push(termsPaket);
        const zip = new JSZip();
        zip.file(jsonFilename, JSON.stringify(exportJson, null, 2));
        await legeFotosAb(zip, relevante);
        datei = { blob: await zip.generateAsync({ type: 'blob' }), name: `protocol_export_${ts}.zip` };
      }

      // An den Hub: IMMER die Hub-Pakete (hubPaket.ts, Vertrag protokoll_app_vertrag_v1) —
      // unabhängig vom Formatschalter. Themen reiten als `terms` am ersten Paket mit.
      const { pakete, elementIds, zurueckgehalten: halten } = baueHubPakete({
        protokolle: prots,
        elemente: relevante,
        terms: (termsPaket?.terms as unknown[] | undefined) ?? null,
      });
      // Umstieg (999.1750): Punkte mit einer dem Hub unbekannten Kennung gehen erst nach dem Laden mit
      setZurueckgehalten(halten.length);

      if (pakete.length === 0) {
        setOhneVersand(true);
        setExported(true);
      } else {
        const hubZip = new JSZip();
        hubZip.file('upload.json', JSON.stringify(pakete));
        await legeFotosAb(hubZip, relevante.filter(e => elementIds.includes(e.id)));
        const hubBlob = await hubZip.generateAsync({ type: 'blob' });

        // Hub-ZIP in IndexedDB speichern (wartet dort, bis der Hub geantwortet hat)
        const ausstehend: PendingExport = {
          id: `export-${Date.now()}`,
          gruppeId: gruppe.id,
          blob: hubBlob,
          filename: `hub_upload_${ts}.zip`,
          elementIds,
          createdAt: new Date().toISOString(),
        };
        await savePendingExport(ausstehend);

        // Sofort versuchen hochzuladen
        const online = await checkConnectivity();
        if (online) {
          try {
            // B4: derselbe Ablauf wie im Hintergrund (uploadAblauf.ts) — Marken nur für belegt
            // übernommene Punkte löschen; bei Abweichungen bleibt der Export mit Auswertung liegen.
            const { auswertung, datensatz } = await sendeExport(ausstehend, uploadAblaufDeps);
            setLiegenGeblieben(datensatz);
            setUploadResult(auswertung.vollstaendig ? 'ok' : 'teilweise');
            setExported(true);
          } catch {
            setPendingCount(prev => prev + 1);
            setExported(true);
          }
        } else {
          setPendingCount(prev => prev + 1);
          setExported(true);
        }
      }

      // Lokaler Download als Backup (DOCUframe-Format)
      if (datei) {
        const url = URL.createObjectURL(datei.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = datei.name;
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
              <h2 className="font-medium text-gray-900 text-sm">Format der Sicherungsdatei</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {exportFormat === 'v5c'
                  ? 'DOCUframe V5c — direkt importierbar'
                  : 'Klassisch — älteres DOCUframe-Format'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Gilt nur für die heruntergeladene Datei. An den Server wird immer im Hub-Format gesendet.
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

        {/* Protokoll-Metadaten — gehen nur in die DOCUframe-Datei (Folgeprotokoll), nicht an den Hub */}
        <p className="text-xs text-gray-500 px-1">Angaben für die DOCUframe-Datei:</p>
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
          {exporting ? (wetterStatus || 'Sende …') : exported ? (uploadResult ? 'Gesendet' : ohneVersand ? 'Nichts gesendet' : 'Zum Senden gespeichert') : 'An Server senden'}
        </button>

        {uploadResult === 'ok' && (
          <p className="text-green-600 text-sm font-medium text-center">Erfolgreich an Server gesendet!</p>
        )}

        {/* H1/B4: Ablehnungen und Übersprungenes benannt anzeigen — dieselbe Meldung wie im Browser,
            bis der Nutzer sie als gelesen bestätigt (sonst erscheint sie dort erneut). */}
        {uploadResult === 'teilweise' && liegenGeblieben?.auswertung && !meldungBestaetigt && (
          <UploadMeldung
            auswertung={liegenGeblieben.auswertung}
            punkte={liegenGeblieben.punkte}
            onGelesen={async () => {
              await meldungGelesen(liegenGeblieben, uploadAblaufDeps);
              setMeldungBestaetigt(true);
            }}
          />
        )}

        {exported && uploadResult === null && !ohneVersand && (
          <p className="text-yellow-600 text-sm font-medium text-center">
            Export gespeichert. Wird automatisch an Server gesendet sobald erreichbar.
          </p>
        )}

        {zurueckgehalten > 0 && (
          <p data-bereich="export-zurueckgehalten" role="status" className="text-yellow-700 text-sm font-medium text-center">
            {textZurueckgehalten(zurueckgehalten)}
          </p>
        )}

        <p className="text-xs text-gray-400 text-center">
          Die Protokollnummer N+1 wird beim Re-Import in DOCUframe automatisch berechnet.
        </p>
      </div>
    </div>
  );
}
