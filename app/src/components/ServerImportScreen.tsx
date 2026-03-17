import { useEffect, useState } from 'react';
import { getServerUrl, listRemoteProjects, downloadProject, checkConnectivity } from '../syncService';

interface RemoteProject {
  id: string;
  projektName?: string;
  gruppeName?: string;
  timestamp?: string;
  hasExport: boolean;
  pendingChanges: number;
}

interface Props {
  onImported: () => void;
  onZurueck: () => void;
  onSettings: () => void;
}

export default function ServerImportScreen({ onImported, onZurueck, onSettings }: Props) {
  const [projekte, setProjekte] = useState<RemoteProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const serverUrl = getServerUrl();

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    if (!serverUrl) {
      setError('Kein Server konfiguriert');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const online = await checkConnectivity();
      if (!online) {
        setError('Server nicht erreichbar');
        setLoading(false);
        return;
      }
      const list = await listRemoteProjects();
      setProjekte(list.filter(p => p.hasExport));
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function handleDownload(projectId: string) {
    setDownloading(projectId);
    try {
      await downloadProject(projectId);
      onImported();
    } catch (err) {
      alert('Fehler beim Laden: ' + (err as Error).message);
      setDownloading(null);
    }
  }

  return (
    <div className="min-h-screen bg-ping-bg">
      <div className="bg-ping-blue text-white p-4">
        <div className="flex items-center justify-between mb-1">
          <button onClick={onZurueck} className="text-ping-blue-light hover:text-white text-sm">&larr; Zurück</button>
          <button onClick={onSettings} className="text-ping-blue-light hover:text-white text-sm">Einstellungen</button>
        </div>
        <h1 className="text-lg font-bold mt-1">Vom Server laden</h1>
        <p className="text-ping-blue-light text-xs mt-0.5">{serverUrl || 'Kein Server'}</p>
      </div>
      <div className="p-3 space-y-2">
        {loading && (
          <p className="text-center text-ping-text-light py-8">Verbinde mit Server...</p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <div className="flex gap-2 justify-center mt-3">
              <button onClick={loadProjects} className="text-ping-blue text-sm font-medium">Nochmal versuchen</button>
              <button onClick={onSettings} className="text-ping-blue text-sm font-medium">Server konfigurieren</button>
            </div>
          </div>
        )}

        {!loading && !error && projekte.length === 0 && (
          <p className="text-center text-ping-text-light py-8">Keine Projekte auf dem Server.</p>
        )}

        {projekte.map(p => (
          <div key={p.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="font-medium text-ping-text">{p.projektName || p.id}</p>
            {p.gruppeName && <p className="text-sm text-ping-text-mid mt-0.5">{p.gruppeName}</p>}
            {p.timestamp && (
              <p className="text-xs text-ping-text-light mt-0.5">
                Export: {new Date(p.timestamp).toLocaleString('de-DE')}
              </p>
            )}
            <button
              onClick={() => handleDownload(p.id)}
              disabled={downloading !== null}
              className="mt-2 w-full bg-ping-blue text-white py-2 px-4 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {downloading === p.id ? 'Wird geladen...' : 'Projekt laden'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
