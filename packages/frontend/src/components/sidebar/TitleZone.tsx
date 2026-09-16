import React from 'react';
import type { TheatreMetadata } from '../../hooks/useTheatres';

interface TitleZoneProps {
  currentTheatreId: string;
  availableTheatres: TheatreMetadata[];
  isLoadingTheatres: boolean;
}

export const TitleZone: React.FC<TitleZoneProps> = ({
  currentTheatreId,
  availableTheatres,
  isLoadingTheatres,
}) => {
  const currentTheatre = availableTheatres.find(t => t.id === currentTheatreId);
  const theatreDisplayName = currentTheatre ? currentTheatre.name : currentTheatreId;

  return (
    <div className="p-4 bg-gray-50">
      <div className="space-y-1 text-sm text-gray-600">
        <div className="px-2 py-1 -mx-2">
          <span className="font-aero-label">
            {isLoadingTheatres ? 'Loading...' : `${theatreDisplayName} Theatre`}
          </span>
        </div>
      </div>
    </div>
  );
};
