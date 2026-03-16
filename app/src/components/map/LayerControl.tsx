import { useState } from 'react';
import { LAYERS } from './mapUtils';
import type { LayerDef } from './mapUtils';

interface Props {
  activeLayer: string;
  opacity: number;
  onLayerChange: (layer: LayerDef) => void;
  onOpacityChange: (opacity: number) => void;
}

export default function LayerControl({ activeLayer, opacity, onLayerChange, onOpacityChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'none' }}>
      <div className="leaflet-control" style={{ pointerEvents: 'auto', marginTop: 10, marginRight: 10 }}>
        <button
          onClick={() => setOpen(!open)}
          className="bg-white shadow rounded-lg w-8 h-8 flex items-center justify-center text-gray-600 hover:text-ping-blue text-sm font-bold"
          title="Kartenebenen"
        >
          ☰
        </button>

        {open && (
          <div className="mt-1 bg-white rounded-lg shadow-lg p-2.5 w-48 space-y-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase">Basiskarte</p>
            {LAYERS.map(layer => (
              <button
                key={layer.id}
                onClick={() => onLayerChange(layer)}
                className={`block w-full text-left px-2 py-1.5 rounded text-xs transition ${
                  activeLayer === layer.id
                    ? 'bg-ping-blue-light text-ping-blue font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {layer.name}
              </button>
            ))}

            <div className="pt-1 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 font-medium uppercase mb-1">Transparenz</p>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={opacity}
                  onChange={(e) => onOpacityChange(Number(e.target.value))}
                  className="flex-1 h-1 accent-ping-blue"
                />
                <span className="text-[10px] text-gray-500 w-7 text-right">{opacity}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
