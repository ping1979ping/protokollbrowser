import { useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, Circle } from 'react-leaflet';
import ZoomDisplay from './ZoomDisplay';
import { DEFAULT_CENTER, getTilesInBounds, LAYERS } from './mapUtils';
import type { LayerDef } from './mapUtils';
import 'leaflet/dist/leaflet.css';

interface Props {
  initialCenter?: [number, number];
  onClose: () => void;
}

function MapClickHandler({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click(e) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function BoundsReader({ onBoundsChange }: { onBoundsChange: (s: number, w: number, n: number, e: number) => void }) {
  const map = useMap();
  useMapEvents({
    moveend() {
      const b = map.getBounds();
      onBoundsChange(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    },
    zoomend() {
      const b = map.getBounds();
      onBoundsChange(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
    },
  });
  return null;
}

export default function TileCacheManager({ initialCenter, onClose }: Props) {
  const [mode, setMode] = useState<'viewport' | 'radius'>('viewport');
  const [center, setCenter] = useState<[number, number] | null>(initialCenter || null);
  const [radius, setRadius] = useState(500); // meters
  const [minZoom, setMinZoom] = useState(15);
  const [maxZoom, setMaxZoom] = useState(18);
  const [layer, setLayer] = useState<LayerDef>(LAYERS[0]);
  const [bounds, setBounds] = useState<{ s: number; w: number; n: number; e: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const tileCount = useMemo(() => {
    if (mode === 'viewport' && bounds) {
      return getTilesInBounds(bounds.s, bounds.w, bounds.n, bounds.e, minZoom, maxZoom).length;
    }
    if (mode === 'radius' && center) {
      // Approximate bounding box from center + radius
      const latOffset = radius / 111320;
      const lonOffset = radius / (111320 * Math.cos((center[0] * Math.PI) / 180));
      return getTilesInBounds(
        center[0] - latOffset, center[1] - lonOffset,
        center[0] + latOffset, center[1] + lonOffset,
        minZoom, maxZoom,
      ).length;
    }
    return 0;
  }, [mode, bounds, center, radius, minZoom, maxZoom]);

  const estimatedMB = useMemo(() => (tileCount * 15 / 1024).toFixed(1), [tileCount]);

  const handleBoundsChange = useCallback((s: number, w: number, n: number, e: number) => {
    setBounds({ s, w, n, e });
  }, []);

  async function startDownload() {
    let tiles: { z: number; x: number; y: number }[];

    if (mode === 'viewport' && bounds) {
      tiles = getTilesInBounds(bounds.s, bounds.w, bounds.n, bounds.e, minZoom, maxZoom);
    } else if (mode === 'radius' && center) {
      const latOffset = radius / 111320;
      const lonOffset = radius / (111320 * Math.cos((center[0] * Math.PI) / 180));
      tiles = getTilesInBounds(
        center[0] - latOffset, center[1] - lonOffset,
        center[0] + latOffset, center[1] + lonOffset,
        minZoom, maxZoom,
      );
    } else {
      return;
    }

    if (tiles.length > 5000) {
      if (!confirm(`${tiles.length} Kacheln herunterladen (~${estimatedMB} MB)? Das kann einige Minuten dauern.`)) return;
    }

    setDownloading(true);
    setProgress({ done: 0, total: tiles.length });

    const BATCH_SIZE = 6;
    for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
      const batch = tiles.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (t) => {
          let url = layer.url
            .replace('{z}', String(t.z))
            .replace('{x}', String(t.x))
            .replace('{y}', String(t.y));

          // Handle subdomains
          if (layer.subdomains) {
            const sub = layer.subdomains[Math.floor(Math.random() * layer.subdomains.length)];
            url = url.replace('{s}', sub);
          } else {
            const subs = ['a', 'b', 'c'];
            url = url.replace('{s}', subs[Math.floor(Math.random() * subs.length)]);
          }

          try {
            await fetch(url, { mode: 'cors' });
          } catch {
            // SW will cache successful responses
          }
        }),
      );
      setProgress({ done: Math.min(i + BATCH_SIZE, tiles.length), total: tiles.length });
    }

    setDownloading(false);
    alert('Kacheln heruntergeladen! Der Service Worker hat sie im Cache gespeichert.');
  }

  const mapCenter = center || initialCenter || DEFAULT_CENTER;

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col" style={{ height: '100dvh' }}>
      <div className="bg-ping-blue text-white p-2 flex items-center justify-between shrink-0">
        <button onClick={onClose} className="text-ping-blue-light hover:text-white text-sm">&times; Schliessen</button>
        <span className="text-xs font-medium">Offline-Karten</span>
        <div />
      </div>

      {/* Mode toggle */}
      <div className="bg-white border-b p-2 flex gap-2">
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
      <div className="flex-1 relative">
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
            <Circle center={center} radius={radius} pathOptions={{ color: '#004899', fillOpacity: 0.1 }} />
          )}
        </MapContainer>
      </div>

      {/* Controls */}
      <div className="bg-white border-t p-3 space-y-2.5 shrink-0">
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
          <select
            value={minZoom}
            onChange={(e) => setMinZoom(Number(e.target.value))}
            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs"
          >
            {Array.from({ length: 10 }, (_, i) => i + 10).map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <span className="text-[10px] text-gray-400">bis</span>
          <select
            value={maxZoom}
            onChange={(e) => setMaxZoom(Number(e.target.value))}
            className="px-1.5 py-0.5 border border-gray-200 rounded text-xs"
          >
            {Array.from({ length: 10 }, (_, i) => i + 10).map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-400 whitespace-nowrap">Layer:</label>
          <select
            value={layer.id}
            onChange={(e) => setLayer(LAYERS.find(l => l.id === e.target.value) || LAYERS[0])}
            className="flex-1 px-1.5 py-0.5 border border-gray-200 rounded text-xs"
          >
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
