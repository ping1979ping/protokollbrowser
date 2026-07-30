import L from 'leaflet';
import { statusColor } from './status';

/**
 * Baut das Kartensymbol eines Punktes: farbiger Kreis mit Positionsnummer,
 * bei bekannter Blickrichtung zusaetzlich ein gedrehter Richtungspfeil.
 */
export function createSvgIcon(
  position: string,
  heading: number | null | undefined,
  status: number,
  size: number,
): L.DivIcon {
  const color = statusColor(status);
  const r = size / 2;
  const svgSize = size + 16;
  const center = svgSize / 2;

  let arrowSvg = '';
  if (heading != null) {
    arrowSvg = `
      <g transform="rotate(${heading}, ${center}, ${center})">
        <polygon points="${center},${center - r - 10} ${center - 5},${center - r - 2} ${center + 5},${center - r - 2}"
          fill="${color}" stroke="white" stroke-width="1"/>
      </g>`;
  }

  const fontSize = size <= 24 ? 9 : 11;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
      ${arrowSvg}
      <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="central"
        fill="white" font-size="${fontSize}" font-weight="bold" font-family="system-ui, sans-serif">${position}</text>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [svgSize, svgSize],
    iconAnchor: [center, center],
  });
}
