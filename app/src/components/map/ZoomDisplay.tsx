import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function ZoomDisplay() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handler = () => setZoom(Math.round(map.getZoom()));
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map]);

  return (
    <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'none' }}>
      <div className="leaflet-control" style={{ pointerEvents: 'auto', marginBottom: 10, marginRight: 10 }}>
        <div className="bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded shadow text-[10px] font-mono text-gray-600">
          Z{zoom}
        </div>
      </div>
    </div>
  );
}
