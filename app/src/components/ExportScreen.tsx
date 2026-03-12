import { useState } from 'react';
import type { Protokoll } from '../types';
import { getElemente, getFotos } from '../db';
import JSZip from 'jszip';

interface Props {
  protokoll: Protokoll;
  onBack: () => void;
}

export default function ExportScreen({ protokoll, onBack }: Props) {
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [autor, setAutor] = useState(protokoll.Autor);
  const [vorbemerkung, setVorbemerkung] = useState(`Folgeprotokoll zu Nr. ${protokoll.Nummer}`);
  const [exporting, setExporting] = useState(false);
  const [stats, setStats] = useState<{ geaendert: number; neu: number } | null>(null);

  useState(() => {
    getElemente(protokoll.Id).then(elems => {
      setStats({
        geaendert: elems.filter(e => e._geaendert && !e._neu).length,
        neu: elems.filter(e => e._neu).length,
      });
    });
  });

  async function exportieren() {
    setExporting(true);
    try {
      const elemente = await getElemente(protokoll.Id);
      const relevante = elemente.filter(e => e._geaendert || e._neu);

      if (relevante.length === 0) {
        alert('Keine Änderungen zum Exportieren vorhanden.');
        setExporting(false);
        return;
      }

      // Protokollgruppe laden für die ID
      // Wir nehmen die erste Gruppe (im Normalfall gibt es nur eine)
      const gruppeId = protokoll.Id; // Wird unten korrekt aufgelöst

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
        base.VerantwortlicherOidNeu = e.VerantwortlicherOid;
        base.MobileDaten = {
          GeoLat: e.MobileErfassung.GeoLat,
          GeoLon: e.MobileErfassung.GeoLon,
          GeoAccuracy: e.MobileErfassung.GeoAccuracy,
          GeoText: e.MobileErfassung.GeoText || '',
          Fotos: e.MobileErfassung.Fotos,
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

      // Fotos aus IndexedDB sammeln
      for (const elem of relevante) {
        const elemFotos = await getFotos(elem.Id);
        for (const foto of elemFotos) {
          photosFolder.file(foto.fileName, foto.blob);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `protocol_export_${ts}.zip`;
      a.click();
      URL.revokeObjectURL(url);
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
          disabled={exporting}
          className="w-full bg-green-600 text-white py-3 rounded-xl font-medium hover:bg-green-700 active:bg-green-800 transition disabled:opacity-50"
        >
          {exporting ? 'Exportiere...' : 'ZIP exportieren'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          Die Protokollnummer N+1 wird beim Re-Import in DOCUframe automatisch berechnet.
        </p>
      </div>
    </div>
  );
}
