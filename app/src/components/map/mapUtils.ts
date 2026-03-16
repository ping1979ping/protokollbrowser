import type { Protokollelement } from '../../types';

// Deutschland-Mitte als Fallback
export const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
export const DEFAULT_ZOOM = 6;
export const DETAIL_ZOOM = 18;

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

export function statusColor(status: number): string {
  switch (status) {
    case 10: return '#ca8a04'; // yellow/offen
    case 11: return '#dc2626'; // red/mangel
    case 20: case 25: return '#16a34a'; // green/erledigt
    case 19: return '#2563eb'; // blue/freigegeben
    default: return '#6b7280'; // gray/neu
  }
}
