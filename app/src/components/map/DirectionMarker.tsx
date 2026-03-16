import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { statusColor } from './mapUtils';

interface Props {
  lat: number;
  lon: number;
  heading?: number | null;
  position?: string;
  status?: number;
  label?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lon: number) => void;
  onClick?: () => void;
  size?: number;
}

function createSvgIcon(position: string, heading: number | null | undefined, status: number, size: number): L.DivIcon {
  const color = statusColor(status);
  const r = size / 2;
  const svgSize = size + 16; // extra space for arrow
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

export default function DirectionMarker({
  lat, lon, heading, position = '', status = 0, label, draggable = false, onDragEnd, onClick, size = 24,
}: Props) {
  const icon = useMemo(
    () => createSvgIcon(position, heading, status, size),
    [position, heading, status, size],
  );

  return (
    <Marker
      position={[lat, lon]}
      icon={icon}
      draggable={draggable}
      eventHandlers={{
        dragend: (e) => {
          const latlng = e.target.getLatLng();
          onDragEnd?.(latlng.lat, latlng.lng);
        },
        click: () => onClick?.(),
      }}
    >
      {label && (
        <Popup>
          <div className="text-xs">
            <strong>Pos. {position}</strong>
            <p className="mt-0.5 text-gray-600">{label}</p>
          </div>
        </Popup>
      )}
    </Marker>
  );
}
