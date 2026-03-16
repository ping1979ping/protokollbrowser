import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import DirectionMarker from './DirectionMarker';
import { DEFAULT_CENTER, DETAIL_ZOOM, formatCoord } from './mapUtils';
import 'leaflet/dist/leaflet.css';

interface Props {
  lat: number | null;
  lon: number | null;
  heading: number | null;
  onSave: (lat: number, lon: number, heading: number | null) => void;
  onCancel: () => void;
}

// Klick auf Karte setzt Marker-Position
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapEditorModal({ lat, lon, heading: initialHeading, onSave, onCancel }: Props) {
  const [pos, setPos] = useState<[number, number] | null>(
    lat != null && lon != null ? [lat, lon] : null,
  );
  const [heading, setHeading] = useState<number | null>(initialHeading);
  const [locating, setLocating] = useState(false);

  // Geräteposition als Fallback
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

  const handleMapClick = useCallback((newLat: number, newLon: number) => {
    setPos([newLat, newLon]);
  }, []);

  const handleDragEnd = useCallback((newLat: number, newLon: number) => {
    setPos([newLat, newLon]);
  }, []);

  const center: [number, number] = pos || DEFAULT_CENTER;
  const zoom = pos ? DETAIL_ZOOM : 6;

  function handleCompass() {
    if (!('DeviceOrientationEvent' in window)) {
      alert('Kompass nicht verfügbar auf diesem Gerät.');
      return;
    }
    // iOS 13+ braucht Permission
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (DOE.requestPermission) {
      DOE.requestPermission().then((result) => {
        if (result === 'granted') readCompass();
        else alert('Kompass-Berechtigung verweigert.');
      });
    } else {
      readCompass();
    }
  }

  function readCompass() {
    function handler(e: DeviceOrientationEvent) {
      if (e.alpha != null) {
        // alpha = 0 means north on Android, on iOS it's different
        // webkitCompassHeading is iOS-specific
        const iosHeading = (e as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
        setHeading(Math.round(iosHeading ?? (360 - e.alpha)));
      }
      window.removeEventListener('deviceorientation', handler);
    }
    window.addEventListener('deviceorientation', handler);
  }

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
          className="w-full h-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
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
        {/* Koordinaten */}
        <p className="text-[10px] text-gray-500 text-center font-mono">
          {pos ? formatCoord(pos[0], pos[1], null, heading) : 'Tippen Sie auf die Karte oder erfassen Sie GPS'}
        </p>

        {/* Richtungs-Slider */}
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
          <button
            onClick={handleCompass}
            className="bg-ping-blue-light text-ping-blue px-2 py-1 rounded text-[10px] font-medium"
            title="Kompass"
          >
            🧭
          </button>
          {heading != null && (
            <button
              onClick={() => setHeading(null)}
              className="text-gray-400 hover:text-red-500 text-[10px]"
              title="Richtung entfernen"
            >
              ✕
            </button>
          )}
        </div>

        {/* GPS-Taste */}
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
            className="flex-1 bg-green-600 text-white py-2 rounded text-xs font-medium"
          >
            GPS-Position verwenden
          </button>
        </div>
      </div>
    </div>
  );
}
