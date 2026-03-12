import { useRef } from 'react';
import type { ProtokollPaket } from '../types';
import { importPakete, clearAll } from '../db';
import { testDaten } from '../testdata';

interface Props {
  onImported: () => void;
}

export default function ImportScreen({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const pakete: ProtokollPaket[] = JSON.parse(text);
      await clearAll();
      await importPakete(pakete);
      onImported();
    } catch (err) {
      alert('Fehler beim Import: ' + (err as Error).message);
    }
  }

  async function handleTestdaten() {
    await clearAll();
    await importPakete(testDaten);
    onImported();
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">Protokoll-App</h1>
        <p className="text-gray-500 mb-8">Mobile Protokollerfassung für DOCUframe</p>

        <div className="space-y-4">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 active:bg-blue-800 transition"
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
              <span className="bg-white px-4 text-gray-400">oder</span>
            </div>
          </div>

          <button
            onClick={handleTestdaten}
            className="w-full bg-gray-100 text-gray-700 py-3 px-4 rounded-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition"
          >
            Testdaten laden
          </button>
        </div>
      </div>
    </div>
  );
}
