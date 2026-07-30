/**
 * Kartenkern — der Teil der Kartenlogik, der ohne die Datentypen des
 * Protokollbrowsers auskommt und deshalb auch anderswo verwendbar ist.
 *
 * Bewusst NICHT hier: die Startkaskade (Mittelpunkt und Zoomstufen) und
 * alles, was am Protokollelement haengt — beides bleibt Sache der PWA.
 */

export { LAYERS } from './layers';
export type { LayerDef } from './layers';
export { latLonToTile, getTilesInBounds } from './tiles';
export { formatLatLon, formatCoord, headingArrow, KOORDINATEN_STELLEN } from './format';
export { statusColor, STATUS_FARBEN, STATUS_FARBE, STATUS_FARBE_UNBEKANNT } from './status';
export { createSvgIcon } from './marker';
