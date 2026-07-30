/**
 * Textdarstellung von Koordinaten.
 *
 * Angezeigt und im Textfeld gespeichert werden hoechstens fuenf
 * Nachkommastellen — das entspricht rund einem Meter und damit dem, was die
 * Geraete tatsaechlich liefern. Mehr Stellen taeuschen eine Genauigkeit vor,
 * die es nicht gibt. Die gemessenen Zahlenwerte selbst werden davon nicht
 * beruehrt: sie bleiben ungerundet gespeichert.
 */

/** Nachkommastellen der Anzeige — bewusst begrenzt, siehe Dateikopf. */
export const KOORDINATEN_STELLEN = 5;

/** Baut den reinen Koordinatentext "Breite, Laenge". */
export function formatLatLon(lat: number, lon: number): string {
  return `${lat.toFixed(KOORDINATEN_STELLEN)}, ${lon.toFixed(KOORDINATEN_STELLEN)}`;
}

/** Baut den Koordinatentext, optional mit Genauigkeit und Blickrichtung. */
export function formatCoord(lat: number, lon: number, acc?: number | null, heading?: number | null): string {
  let text = formatLatLon(lat, lon);
  if (acc != null) text += ` (${acc} m)`;
  if (heading != null) text += ` ${headingArrow(heading)} ${Math.round(heading)}°`;
  return text;
}

/** Uebersetzt eine Gradzahl in einen der acht Richtungspfeile. */
export function headingArrow(deg: number): string {
  const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const idx = Math.round(deg / 45) % 8;
  return arrows[idx];
}
