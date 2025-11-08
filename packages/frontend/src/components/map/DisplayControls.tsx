import React from 'react';
import * as Switch from '@radix-ui/react-switch';

interface DisplayControlsProps {
  gridEnabled: boolean;
  measureEnabled: boolean;
  onGridChange: (enabled: boolean) => void;
  onMeasureChange: (enabled: boolean) => void;
}

export const DisplayControls: React.FC<DisplayControlsProps> = ({
  gridEnabled,
  measureEnabled,
  onGridChange,
  onMeasureChange,
}) => {
  return (
    <div className="p-4">
      <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Display</h3>
      <div className="space-y-3">
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

