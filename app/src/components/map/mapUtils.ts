import type { Protokollelement } from '../../types';

/**
 * Uebergangsdatei: der wiederverwendbare Teil der Kartenlogik ist nach
 * src/map-core/ gewandert. Hier bleibt nur, was an den Datentyp des
 * Protokollelements oder an die Startkaskade der PWA gebunden ist.
 * Die Weiterleitungen halten bestehende Importpfade gueltig.
 */
export { LAYERS, latLonToTile, getTilesInBounds, formatCoord, headingArrow, statusColor } from '../../map-core';
export type { LayerDef } from '../../map-core';

// Deutschland-Mitte als Fallback — die Startkaskade bleibt bewusst PWA-Sache
export const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
export const DEFAULT_ZOOM = 6;
export const DETAIL_ZOOM = 19;

/** Filtert die Elemente heraus, die eine gespeicherte Koordinate tragen. */
export function elementeWithGps(elemente: Protokollelement[]): Protokollelement[] {
  return elemente.filter(e => e.mobile_erfassung.geo_lat != null && e.mobile_erfassung.geo_lon != null);
}
