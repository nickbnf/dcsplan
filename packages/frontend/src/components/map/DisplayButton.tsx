import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { DisplayControls } from './DisplayControls';

interface DisplayButtonProps {
  gridEnabled: boolean;
  measureEnabled: boolean;
  onGridChange: (enabled: boolean) => void;
  onMeasureChange: (enabled: boolean) => void;
}

export const DisplayButton: React.FC<DisplayButtonProps> = ({
  gridEnabled,
  measureEnabled,
  onGridChange,
  onMeasureChange,
}) => {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="absolute top-4 right-4 z-10 bg-white border border-gray-300 rounded-lg p-2 shadow-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-avio-primary focus:ring-offset-2"
          aria-label="Display options"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-gray-700"
          >
            {/* Top slider */}
            <line
              x1="3"
              y1="6"
              x2="17"
              y2="6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              cx="7"
              cy="6"
              r="2"
              fill="currentColor"
            />
            {/* Middle slider */}
            <line
              x1="3"
              y1="10"
              x2="17"
              y2="10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              cx="13"
              cy="10"
              r="2"
              fill="currentColor"
            />
            {/* Bottom slider */}
            <line
              x1="3"
              y1="14"
              x2="17"
              y2="14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle
              cx="10"
              cy="14"
              r="2"
              fill="currentColor"
            />
          </svg>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="bg-white rounded-lg shadow-lg border border-gray-200 w-64 z-50 focus:outline-none"
          sideOffset={8}
          align="end"
        >
          <DisplayControls
            gridEnabled={gridEnabled}
            measureEnabled={measureEnabled}
            onGridChange={onGridChange}
            onMeasureChange={onMeasureChange}
          />
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

