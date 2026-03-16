import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Protokollelement } from '../../types';
import { STATUS_MAP } from '../../types';
import { updateElement } from '../../db';
import DirectionMarker from './DirectionMarker';
import ZoomDisplay from './ZoomDisplay';
import LayerControl from './LayerControl';
import TileCacheManager from './TileCacheManager';
import { DEFAULT_CENTER, elementeWithGps, LAYERS } from './mapUtils';
import type { LayerDef } from './mapUtils';
import 'leaflet/dist/leaflet.css';

interface Props {
  elemente: Protokollelement[];
  onElementClick: (elem: Protokollelement) => void;
  onRefresh: () => void;
}

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      // Timeout ensures map is fully initialized before fitting
      setTimeout(() => map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 }), 100);
    }
  }, [map, bounds]);
  return null;
}

export default function MapOverview({ elemente, onElementClick, onRefresh }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [changes, setChanges] = useState<Map<string, { lat: number; lon: number }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerDef>(LAYERS[0]);
  const [layerOpacity, setLayerOpacity] = useState(100);
  const [showTileCache, setShowTileCache] = useState(false);

  const mitGps = useMemo(() => elementeWithGps(elemente), [elemente]);
  const ohneGps = useMemo(() => elemente.filter(e => e.MobileErfassung.GeoLat == null || e.MobileErfassung.GeoLon == null), [elemente]);
  const [showOhneGps, setShowOhneGps] = useState(false);

  const bounds = useMemo(() => {
    if (mitGps.length === 0) return null;
    const latlngs = mitGps.map(e => [e.MobileErfassung.GeoLat!, e.MobileErfassung.GeoLon!] as [number, number]);
    return L.latLngBounds(latlngs);
  }, [mitGps]);

  function getPos(elem: Protokollelement): [number, number] {
    const change = changes.get(elem.Id);
    if (change) return [change.lat, change.lon];
    return [elem.MobileErfassung.GeoLat!, elem.MobileErfassung.GeoLon!];
  }

  function handleDrag(elemId: string, lat: number, lon: number) {
    setChanges(prev => {
      const next = new Map(prev);
      next.set(elemId, { lat, lon });
      return next;
    });
  }

  async function speichern() {
    setSaving(true);
    for (const [id, { lat, lon }] of changes) {
      const elem = elemente.find(e => e.Id === id);
      if (!elem) continue;
      const acc = elem.MobileErfassung.GeoAccuracy;
      const heading = elem.MobileErfassung.GeoHeading;
      let geoText = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
      if (acc != null) geoText += ` (${acc} m)`;
      if (heading != null) geoText += ` ${Math.round(heading)}°`;
      await updateElement({
        ...elem,
        _geaendert: true,
        MobileErfassung: {
          ...elem.MobileErfassung,
          GeoLat: lat,
          GeoLon: lon,
          GeoText: geoText,
        },
      });
    }
    setChanges(new Map());
    setEditMode(false);
    setSaving(false);
    onRefresh();
  }

  function abbrechen() {
    setChanges(new Map());
    setEditMode(false);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ minHeight: 200 }}>
      <div className="flex-1 relative min-h-0">
        {mitGps.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <p className="text-gray-400 text-sm">Keine Elemente mit GPS-Position vorhanden.</p>
          </div>
        ) : (
          <MapContainer
            center={bounds ? bounds.getCenter() : DEFAULT_CENTER}
            zoom={16}
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
            <FitBounds bounds={bounds} />
            <ZoomDisplay />
            <LayerControl
              activeLayer={activeLayer.id}
              opacity={layerOpacity}
              onLayerChange={setActiveLayer}
              onOpacityChange={setLayerOpacity}
            />
            {mitGps.map(elem => {
              const [lat, lon] = getPos(elem);
              return (
                <DirectionMarker
                  key={elem.Id}
                  lat={lat}
                  lon={lon}
                  heading={elem.MobileErfassung.GeoHeading}
                  position={elem.Position}
                  status={elem.Status}
                  label={elem.Positionstext?.slice(0, 80)}
                  firma={elem.VerantwortlicherFirmaName}
                  termin={elem.Termin}
                  draggable={editMode}
                  onDragEnd={(newLat, newLon) => handleDrag(elem.Id, newLat, newLon)}
                  onClick={editMode ? undefined : undefined}
                  onDetail={editMode ? undefined : () => onElementClick(elem)}
                />
              );
            })}
          </MapContainer>
        )}
      </div>

      {/* Untere Leiste */}
      <div className="bg-white border-t p-2 space-y-1.5 shrink-0">
        <div className="flex items-center gap-2">
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="flex-1 bg-ping-blue-light text-ping-blue py-2 rounded text-xs font-medium"
            >
              Positionen bearbeiten
            </button>
          ) : (
            <>
              <button onClick={abbrechen} className="flex-1 bg-gray-100 text-gray-600 py-2 rounded text-xs font-medium">
                Abbrechen
              </button>
              <button
                onClick={speichern}
                disabled={changes.size === 0 || saving}
                className="flex-1 bg-ping-blue text-white py-2 rounded text-xs font-medium disabled:opacity-40"
              >
                {saving ? 'Speichert...' : `Speichern (${changes.size})`}
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => setShowTileCache(true)}
          className="w-full text-[10px] text-gray-400 hover:text-ping-blue py-1"
        >
          Offline-Karten verwalten
        </button>
        {showTileCache && (
          <TileCacheManager
            initialCenter={bounds ? [bounds.getCenter().lat, bounds.getCenter().lng] : undefined}
            onClose={() => setShowTileCache(false)}
          />
        )}
        {ohneGps.length > 0 && (
          <div>
            <button
              onClick={() => setShowOhneGps(!showOhneGps)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              {ohneGps.length} Elemente ohne Position {showOhneGps ? '▴' : '▾'}
            </button>
            {showOhneGps && (
              <div className="mt-1 space-y-0.5 max-h-24 overflow-auto">
                {ohneGps.map(e => (
                  <button
                    key={e.Id}
                    onClick={() => onElementClick(e)}
                    className="block w-full text-left text-[10px] text-gray-500 hover:text-ping-blue px-1 py-0.5 rounded hover:bg-ping-blue-light"
                  >
                    <span className="font-mono text-gray-400">Pos. {e.Position}</span>{' '}
                    <span className={STATUS_MAP[e.Status]?.css + ' px-1 rounded text-[9px]'}>{STATUS_MAP[e.Status]?.label}</span>{' '}
                    {e.Positionstext?.slice(0, 40)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
