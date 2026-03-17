import { useRef, useState, useEffect } from 'react';
import { importPakete, importVerantwortliche, clearAll, getAllGruppen } from '../db';
import { decodeText, parseDfJson } from '../dfimport';
import logo from '../assets/ping-logo.png';

const BUILD_TIME = import.meta.env.VITE_BUILD_TIME || '?';

interface Props {
  onImported: () => void;
}

export default function ImportScreen({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(BUILD_TIME);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'version.txt', { cache: 'no-store' })
      .then(r => r.ok ? r.text() : null)
      .then(v => { if (v) setVersion(v.trim()); })
      .catch(() => {});
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const text = decodeText(buffer);
      const raw = JSON.parse(text);
      const { pakete, verantwortliche } = parseDfJson(raw);
      if (pakete.length === 0) {
        alert('Keine Protokolle in der Datei gefunden.');
        return;
      }
      await importPakete(pakete);
      if (verantwortliche.length > 0) await importVerantwortliche(verantwortliche);
      onImported();
    } catch (err) {
      alert('Fehler beim Import: ' + (err as Error).message);
    }
  }

  async function handleTestdaten() {
    // Testdaten direkt aus der mitgelieferten JSON-Datei laden
    try {
      const resp = await fetch(import.meta.env.BASE_URL + 'testdata.json');
      const buffer = await resp.arrayBuffer();
      const text = decodeText(buffer);
      const raw = JSON.parse(text);
      const { pakete, verantwortliche } = parseDfJson(raw);
      await importPakete(pakete);
      if (verantwortliche.length > 0) await importVerantwortliche(verantwortliche);
      onImported();
    } catch (err) {
      alert('Fehler beim Laden der Testdaten: ' + (err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-ping-bg flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <img src={logo} alt="PETTER INGENIEURE" className="h-14 mb-6" />
        <h1 className="text-xl font-bold text-ping-blue mb-1">Protokoll-App</h1>
        <p className="text-ping-text-mid text-sm mb-8">Mobile Protokollerfassung</p>

        <div className="space-y-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full bg-ping-blue text-white py-3 px-4 rounded-xl font-medium hover:bg-ping-blue-dark active:brightness-90 transition"
          >
            JSON-Datei importieren
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            className="hidden"
          />

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-ping-text-light">oder</span>
            </div>
          </div>

          <button
            onClick={handleTestdaten}
            className="w-full bg-ping-blue-light text-ping-blue py-3 px-4 rounded-xl font-medium hover:bg-ping-gold-light hover:text-ping-gold-dark transition"
          >
            Testdaten laden
          </button>

          <button
            onClick={async () => {
              const gruppen = await getAllGruppen();
              if (gruppen.length === 0) { alert('Keine Daten vorhanden.'); return; }
              if (!confirm(`Wirklich alle Daten löschen? (${gruppen.length} Projekt${gruppen.length !== 1 ? 'e' : ''})`)) return;
              await clearAll();
              alert('Alle Daten gelöscht.');
            }}
            className="w-full text-red-500 py-2 px-4 rounded-xl text-sm hover:bg-red-50 transition"
          >
            Alle Daten löschen
          </button>
        </div>
      </div>
      <p className="mt-4 text-[10px] text-gray-400 font-mono">Build: {version}</p>
    </div>
  );
}
