/**
 * Kachelrechnung des Kartenkerns (Web-Mercator-Schema z/x/y).
 *
 * Wird sowohl fuer die Anzeige als auch fuer die Offline-Bevorratung benutzt.
 */

/** Rechnet eine Koordinate in die Kachelnummer der gewuenschten Zoomstufe um. */
export function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/** Liefert alle Kacheln, die den angegebenen Ausschnitt ueber alle Zoomstufen abdecken. */
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
