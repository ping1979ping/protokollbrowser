import type { Protokollelement } from '../../types';

// Deutschland-Mitte als Fallback
export const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
export const DEFAULT_ZOOM = 6;
export const DETAIL_ZOOM = 19;

export function formatCoord(lat: number, lon: number, acc?: number | null, heading?: number | null): string {
  let text = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
  if (acc != null) text += ` (${acc} m)`;
  if (heading != null) text += ` ${headingArrow(heading)} ${Math.round(heading)}°`;
  return text;
}

export function headingArrow(deg: number): string {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const idx = Math.round(deg / 45) % 8;
  return arrows[idx];
}

export function elementeWithGps(elemente: Protokollelement[]): Protokollelement[] {
  return elemente.filter(e => e.MobileErfassung.GeoLat != null && e.MobileErfassung.GeoLon != null);
}

// Tile coordinate calculation for offline caching
export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

export function getTilesInBounds(
  south: number, west: number, north: number, east: number,
  minZoom: number, maxZoom: number,
): { z: number; x: number; y: number }[] {
  const tiles: { z: number; x: number; y: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const topLeft = latLonToTile(north, west, z);
    const bottomRight = latLonToTile(south, east, z);
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

export interface LayerDef {
  id: string;
  name: string;
  url: string;
  attribution: string;
  maxNativeZoom: number;
  subdomains?: string;
}

export const LAYERS: LayerDef[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19,
  },
  {
    id: 'ortho',
    name: 'Bayern Luftbild',
    url: 'https://wmtsod{s}.bayernwolke.de/wmts/by_dop/smerc/{z}/{x}/{y}.jpeg',
    attribution: '&copy; <a href="https://geodaten.bayern.de">Bayerische Vermessungsverwaltung</a> – CC BY 4.0',
    maxNativeZoom: 19,
    subdomains: '123456789',
  },
  {
    id: 'topo',
    name: 'Bayern Topographisch',
    url: 'https://wmtsod{s}.bayernwolke.de/wmts/by_amtl_karte/smerc/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://geodaten.bayern.de">Bayerische Vermessungsverwaltung</a> – CC BY 4.0',
    maxNativeZoom: 19,
    subdomains: '123456789',
  },
];

export function statusColor(status: number): string {
  switch (status) {
    case 10: return '#ca8a04'; // yellow/offen
    case 11: return '#dc2626'; // red/mangel
    case 20: case 25: return '#16a34a'; // green/erledigt
    case 19: return '#2563eb'; // blue/freigegeben
    default: return '#6b7280'; // gray/neu
  }
}
