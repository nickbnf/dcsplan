import React, { useState, useMemo } from 'react';
import * as Separator from '@radix-ui/react-separator';
import type { FlightPlan } from '../../types/flightPlan';
import { flightPlanUtils } from '../../utils/flightPlanUtils';

interface FlightPlanZoneProps {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
}

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  unit?: string;
}

const EditableField: React.FC<EditableFieldProps> = ({ 
  value, 
  onChange, 
  placeholder = "Click to edit",
  className = "",
  maxLength,
  unit = ""
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.replace(unit, '').trim());

  const handleSave = () => {
    const newValue = unit ? `${editValue} ${unit}` : editValue;
    onChange(newValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value.replace(unit, '').trim());
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Only allow numbers and decimal point
    if (/^\d*\.?\d*$/.test(inputValue)) {
      if (!maxLength || inputValue.length <= maxLength) {
        setEditValue(inputValue);
      }
    }
  };

  if (isEditing) {
    const inputWidth = maxLength === 3 ? 'w-8' : maxLength === 5 ? 'w-12' : 'w-8';
    return (
      <div className="flex items-center">
        <input
          type="text"
          value={editValue}
          onChange={handleInputChange}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`bg-transparent border-b border-gray-400 focus:border-gray-600 outline-none text-sm ${inputWidth} ${className}`}
          autoFocus
          maxLength={maxLength}
        />
        {unit && <span className="ml-1 text-sm">{unit}</span>}
      </div>
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded text-sm ${className}`}
    >
      {value || placeholder}
    </span>
  );
};

const RouteCard: React.FC<{ flightPlan: FlightPlan, index: number }> = ({ flightPlan, index }) => {
  console.log("RouteCard", flightPlan, index);
  const legData = flightPlanUtils.calculateLegData(flightPlan, index);
  return (
    <div className="ml-4 bg-gray-100 border border-gray-200 rounded p-3">
      <div className="space-y-2 text-xs">
        {/* Line 1: CRS, DIST, ETE */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">CRS:</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.course.toFixed(0)}°</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">DIST:</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.distance.toFixed(1)} nm</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">ETE:</span>
            <span className="font-aero-mono text-gray-900 text-xs">0:08</span>
          </div>
        </div>

        {/* Line 2: Alt, TAS */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Alt:</span>
            <EditableField
              value={`${flightPlan.points[index].alt}'`}
              onChange={() => { }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={5}
              unit="'"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">TAS:</span>
            <EditableField
              value={`${flightPlan.points[index].tas}K`}
              onChange={() => { }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={3}
              unit="K"
            />
          </div>
        </div>

        {/* Line 3: Leg Fuel, EFR */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Leg Fuel:</span>
            <span className="font-aero-mono text-gray-900 text-xs">2.1 gal</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">EFR:</span>
            <span className="font-aero-mono text-gray-900 text-xs">15.2 gal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Minimalistic Card-Based Design with Inline Editable Fields
export const FlightPlanZone: React.FC<FlightPlanZoneProps> = ({ flightPlan }) => {
  const [planName, setPlanName] = useState("Flight Plan Alpha");

  const fligthPlanZoneContent = useMemo(() => {
    return (
    <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
      <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Flight Plan</h3>
      
      {/* Flight Plan Header */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-aero-label text-gray-600">Name:</span>
          <EditableField
            value={planName}
            onChange={setPlanName}
            className="text-gray-900 font-aero-label"
          />
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Flight Plan Entries */}
      <div className="space-y-2">
        {flightPlan.points.length === 0 ? (
          <div className="text-sm text-gray-500 italic">No waypoints added yet</div>
        ) : (
          flightPlan.points.map((waypoint, index) => (
            <React.Fragment key={index}>
              {/* Waypoint Card */}
              <div className="bg-white border border-gray-200 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-aero-label text-gray-900">
                    {index + 1}. <EditableField
                      value={`WP${index + 1}`}
                      onChange={() => {}}
                      className="font-aero-label text-gray-900"
                    />
                  </span>
                  <span className="text-xs font-aero-mono text-gray-500">
                    {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Route Card (indented) */}
              {index < flightPlan.points.length - 1 && (
                <RouteCard flightPlan={flightPlan} index={index} />
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}, [flightPlan, planName]);

return fligthPlanZoneContent
};