import { useEffect, useState } from 'react';
import { getServerUrl, listRemoteProjects, downloadProject, checkConnectivity, getSubscriptions, saveSubscriptions } from '../syncService';

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');

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
      const [list, subs] = await Promise.all([
        listRemoteProjects(),
        getSubscriptions(),
      ]);
      const available = list.filter(p => p.hasExport);
      setProjekte(available);
      // Abonnierte Projekte vorauswählen
      setSelected(new Set(subs.filter(id => available.some(p => p.id === id))));
      setLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  function toggleProject(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubscribeAndLoad() {
    if (selected.size === 0) return;
    setDownloading(true);
    try {
      // Abos speichern
      await saveSubscriptions([...selected]);

      // Projekte nacheinander laden
      const ids = [...selected];
      for (let i = 0; i < ids.length; i++) {
        const p = projekte.find(p => p.id === ids[i]);
        setProgress(`Lade ${p?.projektName || ids[i]} (${i + 1}/${ids.length})...`);
        await downloadProject(ids[i]);
      }
      onImported();
    } catch (err) {
      alert('Fehler beim Laden: ' + (err as Error).message);
      setDownloading(false);
      setProgress('');
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

        {!loading && !error && projekte.length > 0 && (
          <>
            <p className="text-xs text-ping-text-light px-1">Projekte auswählen und abonnieren:</p>
            {projekte.map(p => (
              <label
                key={p.id}
                className={`flex items-start gap-3 bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition ${
                  selected.has(p.id) ? 'border-ping-blue ring-1 ring-ping-blue' : 'border-gray-100'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  disabled={downloading}
                  className="mt-0.5 w-5 h-5 rounded border-gray-300 text-ping-blue focus:ring-ping-blue flex-shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-medium text-ping-text">{p.projektName || p.id}</p>
                  {p.gruppeName && <p className="text-sm text-ping-text-mid mt-0.5">{p.gruppeName}</p>}
                  {p.timestamp && (
                    <p className="text-xs text-ping-text-light mt-0.5">
                      Export: {p.timestamp}
                    </p>
                  )}
                </div>
              </label>
            ))}

            <button
              onClick={handleSubscribeAndLoad}
              disabled={downloading || selected.size === 0}
              className="w-full bg-ping-blue text-white py-3 rounded-xl font-medium disabled:opacity-50 mt-2"
            >
              {downloading
                ? progress
                : selected.size === 0
                  ? 'Bitte Projekte auswählen'
                  : `${selected.size} Projekt${selected.size > 1 ? 'e' : ''} abonnieren & laden`
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}
