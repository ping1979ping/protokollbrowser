import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, useMap, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import ZoomDisplay from './ZoomDisplay';
import { DEFAULT_CENTER, getTilesInBounds, LAYERS } from './mapUtils';
import type { LayerDef } from './mapUtils';
import 'leaflet/dist/leaflet.css';

interface Props {
  initialCenter?: [number, number];
  onClose: () => void;
}

interface CacheStats {
  osm: number;
  bayern: number;
  loading: boolean;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function BoundsReader({ onBoundsChange }: { onBoundsChange: (s: number, w: number, n: number, e: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const b = map.getBounds();
      onBoundsChange(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    };
    handler(); // initial bounds
    map.on('moveend', handler);
    map.on('zoomend', handler);
    return () => { map.off('moveend', handler); map.off('zoomend', handler); };
  }, [map, onBoundsChange]);
  return null;
}

async function getCacheStats(): Promise<CacheStats> {
  try {
    const cacheNames = await caches.keys();
    let osm = 0, bayern = 0;
    for (const name of cacheNames) {
      if (name.includes('map-tiles-osm') || (name.includes('map-tiles') && !name.includes('bayern'))) {
        const cache = await caches.open(name);
        osm += (await cache.keys()).length;
      }
      if (name.includes('map-tiles-bayern') || name.includes('bayern')) {
        const cache = await caches.open(name);
        bayern += (await cache.keys()).length;
      }
    }
    return { osm, bayern, loading: false };
  } catch {
    return { osm: 0, bayern: 0, loading: false };
  }
}

export default function TileCacheManager({ initialCenter, onClose }: Props) {
  const [mode, setMode] = useState<'viewport' | 'radius'>('viewport');
  const [center, setCenter] = useState<[number, number] | null>(initialCenter || null);
  const [radius, setRadius] = useState(500);
  const [minZoom, setMinZoom] = useState(15);
  const [maxZoom, setMaxZoom] = useState(18);
  const [layer, setLayer] = useState<LayerDef>(LAYERS[0]);
  const [bounds, setBounds] = useState<{ s: number; w: number; n: number; e: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [cacheStats, setCacheStats] = useState<CacheStats>({ osm: 0, bayern: 0, loading: true });
  const [lastDownloadBounds, setLastDownloadBounds] = useState<{ s: number; w: number; n: number; e: number } | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Stop map event propagation on controls
  useEffect(() => {
    if (controlsRef.current) {
      L.DomEvent.disableClickPropagation(controlsRef.current);
      L.DomEvent.disableScrollPropagation(controlsRef.current);
    }
  });

  // Load cache stats on mount and after download
  useEffect(() => { getCacheStats().then(setCacheStats); }, []);

  const downloadBounds = useMemo(() => {
    if (mode === 'viewport' && bounds) return bounds;
    if (mode === 'radius' && center) {
      const latOffset = radius / 111320;
      const lonOffset = radius / (111320 * Math.cos((center[0] * Math.PI) / 180));
      return {
        s: center[0] - latOffset, w: center[1] - lonOffset,
        n: center[0] + latOffset, e: center[1] + lonOffset,
      };
    }
    return null;
  }, [mode, bounds, center, radius]);

  const tileCount = useMemo(() => {
    if (!downloadBounds) return 0;
    return getTilesInBounds(downloadBounds.s, downloadBounds.w, downloadBounds.n, downloadBounds.e, minZoom, maxZoom).length;
  }, [downloadBounds, minZoom, maxZoom]);

  const estimatedMB = useMemo(() => (tileCount * 15 / 1024).toFixed(1), [tileCount]);

  const handleBoundsChange = useCallback((s: number, w: number, n: number, e: number) => {
    setBounds({ s, w, n, e });
  }, []);

  async function startDownload() {
    if (!downloadBounds) return;
    const tiles = getTilesInBounds(downloadBounds.s, downloadBounds.w, downloadBounds.n, downloadBounds.e, minZoom, maxZoom);

    if (tiles.length > 5000) {
      if (!confirm(`${tiles.length} Kacheln herunterladen (~${estimatedMB} MB)? Das kann einige Minuten dauern.`)) return;
    }

    setDownloading(true);
    setProgress({ done: 0, total: tiles.length });

    const BATCH_SIZE = 6;
    let successCount = 0;
    for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
      const batch = tiles.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (t) => {
          let url = layer.url
            .replace('{z}', String(t.z))
            .replace('{x}', String(t.x))
            .replace('{y}', String(t.y));

          if (layer.subdomains) {
            const sub = layer.subdomains[Math.floor(Math.random() * layer.subdomains.length)];
            url = url.replace('{s}', sub);
          } else {
            const subs = ['a', 'b', 'c'];
            url = url.replace('{s}', subs[Math.floor(Math.random() * subs.length)]);
          }

          try {
            const resp = await fetch(url, { mode: 'cors' });
            return resp.ok;
          } catch {
            return false;
          }
        }),
      );
      successCount += results.filter(Boolean).length;
      setProgress({ done: Math.min(i + BATCH_SIZE, tiles.length), total: tiles.length });
    }

    setLastDownloadBounds(downloadBounds);
    setDownloading(false);

    // Refresh cache stats
    const stats = await getCacheStats();
    setCacheStats(stats);

    alert(`${successCount} von ${tiles.length} Kacheln erfolgreich heruntergeladen.`);
  }

  const mapCenter = center || initialCenter || DEFAULT_CENTER;

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col" style={{ height: '100dvh' }}>
      <div className="bg-ping-blue text-white p-2 flex items-center justify-between shrink-0">
        <button onClick={onClose} className="text-ping-blue-light hover:text-white text-sm">&times; Schliessen</button>
        <span className="text-xs font-medium">Offline-Karten</span>
        <div />
      </div>

      {/* Cache-Statistik */}
      <div className="bg-gray-50 border-b px-3 py-2 flex items-center gap-3 shrink-0">
        <span className="text-[10px] text-gray-400 font-medium uppercase">Im Cache:</span>
        {cacheStats.loading ? (
          <span className="text-xs text-gray-400">Lade...</span>
        ) : (
          <>
            <span className="text-xs text-gray-600">
              <span className="font-medium text-ping-blue">{cacheStats.osm.toLocaleString()}</span> OSM
            </span>
            <span className="text-xs text-gray-600">
              <span className="font-medium text-green-600">{cacheStats.bayern.toLocaleString()}</span> Bayern
            </span>
            <span className="text-[10px] text-gray-400">
              ~ {((cacheStats.osm + cacheStats.bayern) * 15 / 1024).toFixed(0)} MB
            </span>
          </>
        )}
      </div>

      {/* Mode toggle */}
      <div className="bg-white border-b p-2 flex gap-2 shrink-0">
        <button
          onClick={() => setMode('viewport')}
          className={`flex-1 py-1.5 rounded text-xs font-medium ${mode === 'viewport' ? 'bg-ping-blue text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Sichtbarer Bereich
        </button>
        <button
          onClick={() => setMode('radius')}
          className={`flex-1 py-1.5 rounded text-xs font-medium ${mode === 'radius' ? 'bg-ping-blue text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Punkt + Radius
        </button>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <MapContainer
          center={mapCenter}
          zoom={15}
          maxZoom={20}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            attribution={layer.attribution}
            url={layer.url}
            maxZoom={20}
            maxNativeZoom={layer.maxNativeZoom}
            subdomains={layer.subdomains || 'abc'}
          />
          <ZoomDisplay />
          <BoundsReader onBoundsChange={handleBoundsChange} />
          {mode === 'radius' && (
            <MapClickHandler onClick={(lat, lon) => setCenter([lat, lon])} />
          )}
          {mode === 'radius' && center && (
            <Circle center={center} radius={radius} pathOptions={{ color: '#004899', fillOpacity: 0.1, weight: 2 }} />
          )}
          {/* Show last downloaded area */}
          {lastDownloadBounds && (
            <Rectangle
              bounds={[[lastDownloadBounds.s, lastDownloadBounds.w], [lastDownloadBounds.n, lastDownloadBounds.e]]}
              pathOptions={{ color: '#16a34a', fillOpacity: 0.08, weight: 2, dashArray: '6 4' }}
            />
          )}
        </MapContainer>
      </div>

      {/* Controls */}
      <div ref={controlsRef} className="bg-white border-t p-3 space-y-2 shrink-0">
        {mode === 'radius' && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-gray-400 whitespace-nowrap">Radius:</label>
            <input
              type="range" min={100} max={2000} step={100} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="flex-1 h-1.5 accent-ping-blue"
            />
            <span className="text-[10px] text-gray-600 w-10 text-right">{radius}m</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-400 whitespace-nowrap">Zoom:</label>
          <select value={minZoom} onChange={(e) => setMinZoom(Number(e.target.value))}
            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs">
            {Array.from({ length: 10 }, (_, i) => i + 10).map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400">bis</span>
          <select value={maxZoom} onChange={(e) => setMaxZoom(Number(e.target.value))}
            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs">
            {Array.from({ length: 10 }, (_, i) => i + 10).map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <label className="text-[10px] text-gray-400 whitespace-nowrap ml-2">Layer:</label>
          <select value={layer.id} onChange={(e) => setLayer(LAYERS.find(l => l.id === e.target.value) || LAYERS[0])}
            className="flex-1 px-1.5 py-0.5 border border-gray-200 rounded text-xs">
            {LAYERS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="text-center text-xs text-gray-500">
          {tileCount.toLocaleString()} Kacheln ~ {estimatedMB} MB
        </div>

        {downloading ? (
          <div className="space-y-1">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-ping-blue h-2 rounded-full transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total * 100) : 0}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              {progress.done} / {progress.total}
            </p>
          </div>
        ) : (
          <button
            onClick={startDownload}
            disabled={tileCount === 0}
            className="w-full bg-ping-blue text-white py-2.5 rounded-lg text-xs font-medium disabled:opacity-40"
          >
            Kacheln herunterladen
          </button>
        )}
      </div>
    </div>
  );
}
