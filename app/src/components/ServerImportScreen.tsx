import { useEffect, useState, useMemo } from 'react';
import { getServerUrl, listRemoteProjects, downloadProject, checkConnectivity, getSubscriptions, saveSubscriptions, downloadAddressCatalog } from '../syncService';

interface RemoteProject {
  id: string;
  projektName?: string;
  projektNummer?: string;
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

function zeitAlter(timestamp: string): { tage: number; text: string } | null {
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return null;
    const tage = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (tage === 0) return { tage, text: 'heute' };
    if (tage === 1) return { tage, text: 'gestern' };
    if (tage <= 7) return { tage, text: `vor ${tage} Tagen` };
    if (tage <= 30) return { tage, text: `vor ${Math.floor(tage / 7)} Wochen` };
    return { tage, text: `vor ${Math.floor(tage / 30)} Monaten` };
  } catch { return null; }
}

function formatDatum(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return timestamp;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return timestamp; }
}

export default function ServerImportScreen({ onImported, onZurueck, onSettings }: Props) {
  const [projekte, setProjekte] = useState<RemoteProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState('');
  const [suchtext, setSuchtext] = useState('');

  const serverUrl = getServerUrl();

  const gefilterteProjekte = useMemo(() => {
    if (!suchtext.trim()) return projekte;
    const s = suchtext.toLowerCase();
    return projekte.filter(p =>
      (p.projektName || '').toLowerCase().includes(s) ||
      (p.projektNummer || '').toLowerCase().includes(s) ||
      (p.gruppeName || '').toLowerCase().includes(s) ||
      p.id.toLowerCase().includes(s)
    );
  }, [projekte, suchtext]);

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

      // Adressen-Katalog laden (optional — Fehler nicht blockierend)
      try {
        setProgress('Lade Adressen-Katalog...');
        const result = await downloadAddressCatalog();
        console.log(`[ServerImport] ${result.adressen} Adressen, ${result.ansprechpartner} Ansprechpartner geladen`);
      } catch (err) {
        console.warn('[ServerImport] Adressen-Katalog nicht verfuegbar:', (err as Error).message);
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
      {/* Header */}
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
            {/* Suchfeld + Laden-Button */}
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={suchtext}
                onChange={e => setSuchtext(e.target.value)}
                placeholder="Projektnummer oder Name suchen..."
                className="flex-1 border-2 border-gray-300 rounded-lg text-sm px-3 py-2 focus:border-ping-blue focus:outline-none"
              />
              <button
                onClick={handleSubscribeAndLoad}
                disabled={downloading || selected.size === 0}
                className="bg-ping-blue text-white px-4 py-2 rounded-lg font-medium text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {downloading
                  ? 'Lade...'
                  : `Laden (${selected.size})`
                }
              </button>
            </div>

            {/* Download-Fortschritt */}
            {downloading && progress && (
              <p className="text-xs text-ping-text-light text-center py-1">{progress}</p>
            )}

            {/* Projektliste */}
            {gefilterteProjekte.length === 0 && suchtext.trim() && (
              <p className="text-center text-ping-text-light py-8">
                Keine Treffer für &bdquo;{suchtext}&ldquo;
              </p>
            )}

            {gefilterteProjekte.map(p => {
              const alter = p.timestamp ? zeitAlter(p.timestamp) : null;
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 bg-white rounded-xl shadow-sm border-2 p-3 cursor-pointer transition ${
                    selected.has(p.id) ? 'border-ping-blue' : 'border-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleProject(p.id)}
                    disabled={downloading}
                    className="mt-1 w-5 h-5 rounded border-gray-300 text-ping-blue focus:ring-ping-blue flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    {/* Zeile 1: Projektnummer + Name */}
                    <div className="flex items-baseline gap-2">
                      {p.projektNummer && (
                        <span className="text-xs font-mono font-bold text-ping-blue">{p.projektNummer}</span>
                      )}
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {p.projektName || p.id}
                      </span>
                    </div>
                    {/* Zeile 2: Gruppenname */}
                    {p.gruppeName && (
                      <p className="text-xs text-gray-500 mt-0.5">{p.gruppeName}</p>
                    )}
                    {/* Zeile 3: Timestamp + Aktualität + Pending */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {p.timestamp && (
                        <span className="text-[10px] text-gray-400">
                          Export: {formatDatum(p.timestamp)}
                        </span>
                      )}
                      {alter && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          alter.tage <= 7
                            ? 'bg-green-100 text-green-700'
                            : alter.tage <= 30
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                        }`}>
                          {alter.text}
                        </span>
                      )}
                      {p.pendingChanges > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                          {p.pendingChanges} ausst.
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
