import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TheatreMetadata } from '../../hooks/useTheatres';

interface TitleZoneProps {
  currentTheatreId: string;
  availableTheatres: TheatreMetadata[];
  isLoadingTheatres: boolean;
  onTheatreChange: (theatreId: string) => void;
}

export const TitleZone: React.FC<TitleZoneProps> = ({
  currentTheatreId,
  availableTheatres,
  isLoadingTheatres,
  onTheatreChange,
}) => {
  const currentTheatre = availableTheatres.find(t => t.id === currentTheatreId);
  const theatreDisplayName = currentTheatre ? currentTheatre.name : "Select Theatre";

  return (
    <div className="p-4 bg-gray-50">
      {/* Map Name with Dropdown */}
      <div className="space-y-1 text-sm text-gray-600">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex justify-between items-center w-full cursor-pointer hover:bg-gray-200 rounded px-2 py-1 -mx-2 transition-colors group outline-none"
              disabled={isLoadingTheatres}
            >
              <span className="font-aero-label">
                {isLoadingTheatres ? 'Loading...' : `${theatreDisplayName} Theatre`}
              </span>
              {!isLoadingTheatres && (
                <span className="text-[10px] text-gray-400 group-hover:text-gray-600 ml-2 transition-colors">
                  ▼
                </span>
              )}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-white rounded-md p-1 shadow-lg border border-gray-200 min-w-[200px] z-50 animate-in fade-in zoom-in duration-75"
              sideOffset={5}
              align="start"
            >
              {availableTheatres.map((theatre) => (
                <DropdownMenu.Item
                  key={theatre.id}
                  className={`
                    flex items-center px-3 py-2 text-sm font-aero-label outline-none cursor-pointer rounded transition-colors
                    ${theatre.id === currentTheatreId
                      ? 'bg-avio-panel text-avio-primary font-semibold'
                      : 'text-gray-700 hover:bg-gray-100'}
                  `}
                  onSelect={() => onTheatreChange(theatre.id)}
                >
                  {theatre.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  );
};