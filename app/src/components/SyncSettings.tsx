import { useState } from 'react';
import { getServerUrl, setServerUrl, checkConnectivity } from '../syncService';
import { getDeviceId, getDeviceName, setDeviceName, getUserName, setUserName } from '../deviceIdentity';

interface Props {
  onBack: () => void;
}

export default function SyncSettings({ onBack }: Props) {
  const [url, setUrl] = useState(getServerUrl());
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [userName, setUserNameLocal] = useState(getUserName());
  const [deviceName, setDeviceNameLocal] = useState(getDeviceName());
  const deviceId = getDeviceId();
  const [autoBackup, setAutoBackup] = useState(() => localStorage.getItem('autoBackup') !== 'false');

  function toggleAutoBackup() {
    const next = !autoBackup;
    setAutoBackup(next);
    localStorage.setItem('autoBackup', String(next));
  }

  async function handleTest() {
    setServerUrl(url);
    setStatus('testing');
    const ok = await checkConnectivity();
    setStatus(ok ? 'ok' : 'error');
  }

  function handleSave() {
    setServerUrl(url);
    setUserName(userName);
    setDeviceName(deviceName);
    onBack();
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <button onClick={onBack} className="text-ping-blue-light hover:text-white text-base">&larr; Zurück</button>
        <h1 className="text-lg font-bold mt-1">Sync-Einstellungen</h1>
      </div>
      <div className="p-4 space-y-4">
        {/* Server-URL */}
        <div>
          <label className="block text-base font-medium text-ping-text mb-1">Server-URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
            placeholder="http://server:8080"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={!url || status === 'testing'}
            className="flex-1 bg-ping-blue-light text-ping-blue py-3 px-4 rounded-lg font-medium disabled:opacity-50 text-base"
          >
            {status === 'testing' ? 'Teste...' : 'Verbindung testen'}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-ping-blue text-white py-3 px-4 rounded-lg font-medium text-base"
          >
            Speichern
          </button>
        </div>
        {status === 'ok' && (
          <p className="text-green-600 text-base font-medium">Verbindung erfolgreich!</p>
        )}
        {status === 'error' && (
          <p className="text-red-500 text-base font-medium">Verbindung fehlgeschlagen. URL prüfen.</p>
        )}

        {/* Benutzer + Gerät */}
        <hr className="border-gray-200" />
        <div>
          <label className="block text-base font-medium text-ping-text mb-1">Benutzer-Kürzel</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserNameLocal(e.target.value)}
            placeholder="z.B. WEBE"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
          <p className="text-sm text-gray-600 mt-1">Wird bei mobil erfassten Elementen als Bearbeiter gesetzt</p>
        </div>
        <div>
          <label className="block text-base font-medium text-ping-text mb-1">Gerätename</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceNameLocal(e.target.value)}
            placeholder="z.B. Peters iPhone"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-ping-blue"
          />
          <p className="text-sm text-gray-600 mt-1">Zur Unterscheidung bei mehreren Geräten</p>
        </div>

        {/* Export-Einstellungen */}
        <hr className="border-gray-200" />
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-base font-medium text-ping-text">Lokale Sicherungskopie</label>
            <p className="text-sm text-gray-600 mt-0.5">ZIP-Datei beim Export auf Gerät herunterladen</p>
          </div>
          <button
            onClick={toggleAutoBackup}
            className={`relative inline-flex items-center w-11 h-6 rounded-full transition ${autoBackup ? 'bg-green-500' : 'bg-gray-500'}`}
          >
            <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transition-transform ${autoBackup ? 'translate-x-[1.3rem]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {/* Device-ID */}
        <div className="p-3.5 bg-gray-50 rounded-lg text-sm text-gray-500 space-y-1">
          <p><strong>Geräte-ID:</strong> <code className="break-all">{deviceId}</code></p>
          <p><strong>Hinweis:</strong> Der Exchange-Server muss erreichbar sein (gleiches WLAN).</p>
        </div>
      </div>
    </div>
  );
}
