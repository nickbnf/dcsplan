import React from 'react';

interface MeasureButtonProps {
  /** True while a measurement is in progress or pinned. */
  active: boolean;
  onToggle: () => void;
}

/** Map button for the Measure tool (map-measure), stacked under the Display button. */
export const MeasureButton: React.FC<MeasureButtonProps> = ({ active, onToggle }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label="Measure bearing / distance"
      title="Measure bearing / distance (M)"
      className={`absolute top-[62px] right-4 z-10 border rounded-lg p-2 shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-avio-primary focus:ring-offset-2 ${
        active
          ? 'bg-gray-700 border-gray-700 text-white hover:bg-gray-600'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Ruler laid diagonally, with graduation ticks */}
        <rect
          x="1.5"
          y="7"
          width="17"
          height="6"
          rx="1"
          transform="rotate(-45 10 10)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <g transform="rotate(-45 10 10)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="5" y1="7" x2="5" y2="9.5" />
          <line x1="8.5" y1="7" x2="8.5" y2="10.5" />
          <line x1="12" y1="7" x2="12" y2="9.5" />
          <line x1="15.5" y1="7" x2="15.5" y2="10.5" />
        </g>
      </svg>
    </button>
  );
};
