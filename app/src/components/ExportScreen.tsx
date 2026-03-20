import { useState, useEffect } from 'react';
import type { Protokoll, Protokollgruppe } from '../types';
import { getElemente, getFotos, clearSyncFlags, getProtokolleByGruppe, savePendingExport, getPendingExports, deletePendingExport, updateElement } from '../db';
import { checkConnectivity, uploadZip } from '../syncService';
import { fetchWeather } from '../weatherService';
import JSZip from 'jszip';

interface Props {
  protokoll: Protokoll;
  gruppe: Protokollgruppe;
  onBack: () => void;
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

  useEffect(() => {
    // Stats laden
    getProtokolleByGruppe(gruppe.Id).then(async (prots) => {
      const allElems = (await Promise.all(prots.map(p => getElemente(p.Id)))).flat();
      setStats({
        geaendert: allElems.filter(e => e._geaendert && !e._neu).length,
        neu: allElems.filter(e => e._neu).length,
      });
    });
    // Pending exports zählen
    getPendingExports().then(exps => {
      setPendingCount(exps.filter(e => e.gruppeId === gruppe.Id).length);
    });
  }, [gruppe.Id]);

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

      const gruppeId = gruppe.Id;

      const exportElemente = relevante.map(e => {
        const isNeu = e._neu;
        const base: any = {
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
      });

      const exportJson = [{
        ProtokollgruppeId: gruppeId,
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
        Elemente: exportElemente,
      }];

      // ZIP bauen
      const zip = new JSZip();
      zip.file('protocol_export.json', JSON.stringify(exportJson, null, 2));
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

      // ZIP in IndexedDB speichern → wird automatisch bei Serverkontakt hochgeladen
      await savePendingExport({
        id: `export-${Date.now()}`,
        gruppeId,
        blob: content,
        filename,
        elementIds,
        createdAt: new Date().toISOString(),
      });

      // Sofort versuchen hochzuladen
      const online = await checkConnectivity();
      if (online) {
        try {
          await uploadZip(gruppeId, content, filename);
          await clearSyncFlags(elementIds);
          // Pending export löschen — wurde sofort hochgeladen
          const exps = await getPendingExports();
          const latest = exps.find(e => e.filename === filename);
          if (latest) await deletePendingExport(latest.id);
          setUploadResult('ok');
          setExported(true);
        } catch {
          // Upload fehlgeschlagen — bleibt als pending in IndexedDB
          setPendingCount(prev => prev + 1);
          setExported(true);
        }
      } else {
        // Kein Server → bleibt als pending, wird automatisch hochgeladen
        setPendingCount(prev => prev + 1);
        setExported(true);
      }

      // Lokaler Download als Backup (falls in Einstellungen aktiviert)
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
