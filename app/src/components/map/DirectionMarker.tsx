import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { STATUS_MAP } from '../../types';
import { statusColor } from './mapUtils';

interface Props {
  lat: number;
  lon: number;
  heading?: number | null;
  position?: string;
  status?: number;
  label?: string;
  firma?: string;
  termin?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lon: number) => void;
  onClick?: () => void;
  onDetail?: () => void;
  size?: number;
}

function createSvgIcon(position: string, heading: number | null | undefined, status: number, size: number): L.DivIcon {
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

export default function DirectionMarker({
  lat, lon, heading, position = '', status = 0, label, firma, termin,
  draggable = false, onDragEnd, onClick, onDetail, size = 24,
}: Props) {
  const icon = useMemo(
    () => createSvgIcon(position, heading, status, size),
    [position, heading, status, size],
  );

  const st = STATUS_MAP[status];

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
        <Popup maxWidth={250}>
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-1.5">
              <strong className="font-mono">Pos. {position}</strong>
              {st && (
                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${st.css}`}>
                  {st.label}
                </span>
              )}
            </div>
            <p className="text-gray-600 leading-tight">{label}</p>
            {firma && <p className="text-gray-500"><span className="text-gray-400">Firma:</span> {firma}</p>}
            {termin && (
              <p className="text-gray-500">
                <span className="text-gray-400">Termin:</span>{' '}
                {new Date(termin).toLocaleDateString('de-DE')}
              </p>
            )}
            {onDetail && (
              <button
                onClick={(e) => { e.stopPropagation(); onDetail(); }}
                className="mt-1 w-full bg-ping-blue text-white py-1 rounded text-[11px] font-medium hover:bg-ping-blue-dark transition"
              >
                Details anzeigen
              </button>
            )}
          </div>
        </Popup>
      )}
    </Marker>
  );
}
