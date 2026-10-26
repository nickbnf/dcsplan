import React from 'react';
import * as Switch from '@radix-ui/react-switch';
import { useSelectedMap } from '../../hooks/useSelectedMap';
import { setMapChoice } from '../../utils/mapChoice';

interface DisplayControlsProps {
  /** Theatre whose maps are offered; the map selector shows only when it has several. */
  theatreId: string;
  gridEnabled: boolean;
  measureEnabled: boolean;
  onGridChange: (enabled: boolean) => void;
  onMeasureChange: (enabled: boolean) => void;
}

export const DisplayControls: React.FC<DisplayControlsProps> = ({
  theatreId,
  gridEnabled,
  measureEnabled,
  onGridChange,
  onMeasureChange,
}) => {
  const { theatre, mapId } = useSelectedMap(theatreId);
  const showMapSelector = theatre !== undefined && mapId !== null && theatre.maps.length > 1;

  return (
    <div className="p-4">
      <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Display</h3>
      <div className="space-y-3">
        {showMapSelector && (
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="display-map-select" className="text-sm font-aero-label text-gray-600">Map</label>
            <select
              id="display-map-select"
              value={mapId}
              onChange={(e) => setMapChoice(theatre.id, e.target.value)}
              className="min-w-0 flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-avio-primary focus:border-transparent"
            >
              {theatre.maps.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center justify-between">
          <label className="text-sm font-aero-label text-gray-600">Geographic Grid</label>
          <Switch.Root
            checked={gridEnabled}
            onCheckedChange={onGridChange}
            className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
          >
            <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-aero-label text-gray-600">Measure</label>
          <Switch.Root
            checked={measureEnabled}
            onCheckedChange={onMeasureChange}
            className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
          >
            <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
        </div>
      </div>
    </div>
  );
};

