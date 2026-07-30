/**
 * Basiskarten des Kartenkerns.
 *
 * Bewusst ohne Bezug auf PWA-Datentypen, damit derselbe Kern spaeter auch
 * ausserhalb des Protokollbrowsers verwendet werden kann.
 */

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
    url: 'https://wmtsod{s}.bayernwolke.de/wmts/by_dop/smerc/{z}/{x}/{y}',
    attribution: '&copy; <a href="https://geodaten.bayern.de">Bayerische Vermessungsverwaltung</a> – CC BY 4.0',
    maxNativeZoom: 19,
    subdomains: '123456789',
  },
  {
    id: 'topo',
    name: 'Bayern Topographisch',
    url: 'https://wmtsod{s}.bayernwolke.de/wmts/by_amtl_karte/smerc/{z}/{x}/{y}',
    attribution: '&copy; <a href="https://geodaten.bayern.de">Bayerische Vermessungsverwaltung</a> – CC BY 4.0',
    maxNativeZoom: 19,
    subdomains: '123456789',
  },
];
