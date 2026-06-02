import React, { useState, useRef, useEffect } from 'react';
import type { PictogramType } from '../../types/flightPlan';
import { getAllPictograms, getPictogramDef } from '../../utils/pictogramCatalog';

interface TypeStampedAddToggleProps {
  isActive: boolean;
  selectedType: PictogramType;
  onToggle: () => void;
  onTypeChange: (type: PictogramType) => void;
  label?: string; // e.g. "Add Object" or "Add Marker"
}

export const TypeStampedAddToggle: React.FC<TypeStampedAddToggleProps> = ({
  isActive,
  selectedType,
  onToggle,
  onTypeChange,
  label = 'Add',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const def = getPictogramDef(selectedType);
  const allTypes = getAllPictograms();

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const handleDropdownSelect = (e: React.MouseEvent, type: PictogramType) => {
    e.stopPropagation();
    onTypeChange(type);
    setDropdownOpen(false);
  };

  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropdownOpen(prev => !prev);
  };

  // Group by category
  const categories = ['threat', 'landmark', 'friendly', 'reference'] as const;
  const categoryLabels: Record<string, string> = {
    threat: 'Threats',
    landmark: 'Landmarks',
    friendly: 'Friendly',
    reference: 'Reference',
  };

  return (
    <div className="relative inline-flex" ref={dropdownRef}>
      {/* Main toggle */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-l border transition-colors ${
          isActive
            ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-700'
            : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
        }`}
      >
        <span>{label}:</span>
        <span className="font-aero-label">{def.label}</span>
      </button>

      {/* Dropdown arrow */}
      <button
        onClick={handleDropdownToggle}
        className={`flex items-center px-2 py-2 text-xs font-medium rounded-r border-t border-b border-r transition-colors ${
          isActive
            ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-700'
            : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
        }`}
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
      >
        ▾
      </button>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-md shadow-lg min-w-[160px]">
          {categories.map(cat => {
            const items = allTypes.filter(t => t.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="px-3 py-1 text-xs font-aero-label text-gray-400 uppercase tracking-wide">
                  {categoryLabels[cat]}
                </div>
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={(e) => handleDropdownSelect(e, item.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-aero-label hover:bg-gray-50 ${
                      item.id === selectedType ? 'text-blue-600 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
