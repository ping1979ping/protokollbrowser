import { useRef } from 'react';
import type { ProtokollPaket } from '../types';
import { importPakete, clearAll } from '../db';
import { testDaten } from '../testdata';
import logo from '../assets/ping-logo.png';

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
        </div>
      </div>
    </div>
  );
}
