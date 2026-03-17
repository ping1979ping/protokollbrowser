import { useState } from 'react';
import { getServerUrl, setServerUrl, checkConnectivity } from '../syncService';

interface Props {
  onBack: () => void;
}

export default function SyncSettings({ onBack }: Props) {
  const [url, setUrl] = useState(getServerUrl());
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');

  async function handleTest() {
    setServerUrl(url);
    setStatus('testing');
    const ok = await checkConnectivity();
    setStatus(ok ? 'ok' : 'error');
  }

  function handleSave() {
    setServerUrl(url);
    onBack();
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <button onClick={onBack} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurück</button>
        <h1 className="text-lg font-bold mt-1">Sync-Einstellungen</h1>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ping-text mb-1">Server-URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
            placeholder="http://server:8080"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={!url || status === 'testing'}
            className="flex-1 bg-ping-blue-light text-ping-blue py-2 px-4 rounded-lg font-medium disabled:opacity-50"
          >
            {status === 'testing' ? 'Teste...' : 'Verbindung testen'}
          </button>
          <button
            onClick={handleSave}
            disabled={!url}
            className="flex-1 bg-ping-blue text-white py-2 px-4 rounded-lg font-medium disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
        {status === 'ok' && (
          <p className="text-green-600 text-sm font-medium">Verbindung erfolgreich!</p>
        )}
        {status === 'error' && (
          <p className="text-red-500 text-sm font-medium">Verbindung fehlgeschlagen. URL prüfen.</p>
        )}
        <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
          <p><strong>Hinweis:</strong> Der Exchange-Server muss erreichbar sein (gleiches WLAN).</p>
          <p>Format: <code>http://servername:8080</code></p>
        </div>
      </div>
    </div>
  );
}
