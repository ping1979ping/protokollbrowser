/**
 * Textdarstellung von Koordinaten.
 */

/** Baut den Koordinatentext, optional mit Genauigkeit und Blickrichtung. */
export function formatCoord(lat: number, lon: number, acc?: number | null, heading?: number | null): string {
  let text = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
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
