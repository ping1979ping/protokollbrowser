import { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { STATUS_MAP } from '../../types';
import { createSvgIcon } from '../../map-core';

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
