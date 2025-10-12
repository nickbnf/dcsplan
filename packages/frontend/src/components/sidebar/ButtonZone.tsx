import React, { useState } from 'react';
import * as Toggle from '@radix-ui/react-toggle';
import * as Switch from '@radix-ui/react-switch';
import * as Separator from '@radix-ui/react-separator';

interface ButtonZoneProps {
  onModeChange?: (mode: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const ButtonZone: React.FC<ButtonZoneProps> = ({
  onModeChange,
  onUndo,
  onRedo
}) => {
  const [activeMode, setActiveMode] = useState<string>('pan');
  const [gridEnabled, setGridEnabled] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);

  const handleModeChange = (mode: string) => {
    setActiveMode(mode);
    onModeChange?.(mode);
  };

  return (
    <div className="p-4 bg-white">
      {/* Mode Controls */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Drawing Mode</h3>
        <div className="flex space-x-2">
          <Toggle.Root
            pressed={activeMode === 'pan'}
            onPressedChange={() => handleModeChange('pan')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Pan
          </Toggle.Root>
          <Toggle.Root
            pressed={activeMode === 'draw'}
            onPressedChange={() => handleModeChange('draw')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Draw
          </Toggle.Root>
          <Toggle.Root
            pressed={activeMode === 'edit'}
            onPressedChange={() => handleModeChange('edit')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Edit
          </Toggle.Root>
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Toggle Controls */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Display Options</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600">Grid</label>
            <Switch.Root
              checked={gridEnabled}
              onCheckedChange={setGridEnabled}
              className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
            </Switch.Root>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-600">Measure</label>
            <Switch.Root
              checked={measureEnabled}
              onCheckedChange={setMeasureEnabled}
              className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
            </Switch.Root>
          </div>
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Action Buttons */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Actions</h3>
        <div className="flex space-x-2">
          <button
            onClick={onUndo}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            Undo
          </button>
          <button
            onClick={onRedo}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          >
            Redo
          </button>
          <button className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};