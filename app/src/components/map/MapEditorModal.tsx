import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import DirectionMarker from './DirectionMarker';
import ZoomDisplay from './ZoomDisplay';
import LayerControl from './LayerControl';
import { DEFAULT_CENTER, DETAIL_ZOOM, LAYERS, formatCoord } from './mapUtils';
import type { LayerDef } from './mapUtils';
import 'leaflet/dist/leaflet.css';

interface Props {
  lat: number | null;
  lon: number | null;
  heading: number | null;
  onSave: (lat: number, lon: number, heading: number | null) => void;
  onCancel: () => void;
}

export default function MapEditorModal({ lat, lon, heading: initialHeading, onSave, onCancel }: Props) {
  const [pos, setPos] = useState<[number, number] | null>(
    lat != null && lon != null ? [lat, lon] : null,
  );
  const [heading, setHeading] = useState<number | null>(initialHeading);
  const [locating, setLocating] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerDef>(LAYERS[0]);
  const [layerOpacity, setLayerOpacity] = useState(60);

  useEffect(() => {
    if (pos) return;
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  const handleDragEnd = useCallback((newLat: number, newLon: number) => {
    setPos([newLat, newLon]);
  }, []);

  const center: [number, number] = pos || DEFAULT_CENTER;
  const zoom = pos ? DETAIL_ZOOM : 6;

  const [compassActive, setCompassActive] = useState(false);
  const compassHandlerRef = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha != null) {
      const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
      setHeading(Math.round(iosHeading ?? (360 - e.alpha)));
    }
  }, []);

  function toggleCompass() {
    if (compassActive) {
      window.removeEventListener('deviceorientation', compassHandlerRef as EventListener);
      setCompassActive(false);
      return;
    }
    if (!('DeviceOrientationEvent' in window)) {
      alert('Kompass nicht verfügbar auf diesem Gerät.');
      return;
    }
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DOE.requestPermission) {
      DOE.requestPermission().then((result) => {
        if (result === 'granted') {
          window.addEventListener('deviceorientation', compassHandlerRef as EventListener);
          setCompassActive(true);
        } else alert('Kompass-Berechtigung verweigert.');
      });
    } else {
      window.addEventListener('deviceorientation', compassHandlerRef as EventListener);
      setCompassActive(true);
    }
  }

  // Cleanup compass on unmount
  useEffect(() => {
    return () => window.removeEventListener('deviceorientation', compassHandlerRef as EventListener);
  }, [compassHandlerRef]);

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="bg-ping-blue text-white p-2 flex items-center justify-between shrink-0">
        <button onClick={onCancel} className="text-ping-blue-light hover:text-white text-sm">&times; Abbrechen</button>
        <span className="text-xs font-medium">Standort bearbeiten</span>
        <button
          onClick={() => pos && onSave(pos[0], pos[1], heading)}
          disabled={!pos}
          className="bg-white text-ping-blue px-3 py-1 rounded text-xs font-medium disabled:opacity-40"
        >
          Speichern
        </button>
      </div>

      {/* Karte */}
      <div className="flex-1 relative">
        {locating && (
          <div className="absolute inset-0 z-[1000] bg-white/80 flex items-center justify-center">
            <p className="text-sm text-gray-500">Standort wird ermittelt...</p>
          </div>
        )}
        <MapContainer
          center={center}
          zoom={zoom}
          maxZoom={20}
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            key={activeLayer.id}
            attribution={activeLayer.attribution}
            url={activeLayer.url}
            maxZoom={20}
            maxNativeZoom={activeLayer.maxNativeZoom}
            opacity={layerOpacity / 100}
            subdomains={activeLayer.subdomains || 'abc'}
          />
          <ZoomDisplay />
          <LayerControl
            activeLayer={activeLayer.id}
            opacity={layerOpacity}
            onLayerChange={setActiveLayer}
            onOpacityChange={setLayerOpacity}
          />
          {pos && (
            <DirectionMarker
              lat={pos[0]}
              lon={pos[1]}
              heading={heading}
              size={32}
              draggable
              onDragEnd={handleDragEnd}
            />
          )}
        </MapContainer>
      </div>

      {/* Untere Leiste */}
      <div className="bg-white border-t p-2 space-y-2 shrink-0">
        <p className="text-[10px] text-gray-500 text-center font-mono">
          {pos ? formatCoord(pos[0], pos[1], null, heading) : 'Tippen Sie auf die Karte oder erfassen Sie GPS'}
        </p>

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-400 whitespace-nowrap">Richtung:</label>
          <input
            type="range"
            min={0}
            max={359}
            value={heading ?? 0}
            onChange={(e) => setHeading(Number(e.target.value))}
            className="flex-1 h-1.5 accent-ping-blue"
          />
          <span className="text-[10px] text-gray-600 w-8 text-right font-mono">
            {heading != null ? `${heading}°` : '—'}
          </span>
          {heading != null && (
            <button
              onClick={() => setHeading(null)}
              className="text-gray-400 hover:text-red-500 text-[10px]"
              title="Richtung entfernen"
            >
              X
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!navigator.geolocation) return;
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  setPos([p.coords.latitude, p.coords.longitude]);
                  setLocating(false);
                },
                () => setLocating(false),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
              );
            }}
            className="bg-green-600 text-white py-1.5 px-3 rounded text-[10px] font-medium"
          >
            Aktuelle GPS-Position
          </button>
          <button
            onClick={toggleCompass}
            className={`py-1.5 px-3 rounded text-[10px] font-medium ${
              compassActive
                ? 'bg-ping-blue text-white'
                : 'bg-ping-blue-light text-ping-blue'
            }`}
          >
            Kompass {compassActive ? 'AN' : 'AUS'}
          </button>
        </div>
      </div>
    </div>
  );
}
