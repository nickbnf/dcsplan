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

interface TimeEditableFieldProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  className?: string;
}

const TimeEditableField: React.FC<TimeEditableFieldProps> = ({ 
  hour, 
  minute, 
  onChange, 
  className = ""
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);

  const handleSave = () => {
    const timeMatch = editValue.match(/^(\d{1,2}):(\d{1,2})$/);
    if (timeMatch) {
      const newHour = Math.min(23, Math.max(0, parseInt(timeMatch[1])));
      const newMinute = Math.min(59, Math.max(0, parseInt(timeMatch[2])));
      onChange(newHour, newMinute);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
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
    // Allow digits and colon, format as user types
    if (/^[\d:]*$/.test(inputValue)) {
      // Auto-format as user types
      let formatted = inputValue.replace(/[^\d]/g, '');
      if (formatted.length >= 3) {
        formatted = formatted.substring(0, 2) + ':' + formatted.substring(2, 4);
      }
      if (formatted.length <= 5) { // Max 5 chars for HH:MM
        setEditValue(formatted);
      }
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={handleInputChange}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-transparent border-b border-gray-400 focus:border-gray-600 outline-none text-sm w-12 ${className}`}
        autoFocus
        placeholder="HH:MM"
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded text-sm ${className}`}
    >
      {`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
    </span>
  );
};

const displayMinutes = (minutes: number) => {
  const wholeMins = Math.trunc(minutes)
  const seconds = Math.trunc((minutes-wholeMins) * 60)
  return wholeMins+"+"+seconds
}

const RouteCard: React.FC<{ flightPlan: FlightPlan, index: number, onFlightPlanUpdate: (flightPlan: FlightPlan) => void }> = ({ flightPlan, index, onFlightPlanUpdate }) => {
  const legData = flightPlanUtils.calculateLegData(flightPlan, index);
  return (
    <div className="ml-4 bg-gray-100 border border-gray-200 rounded p-3">
      <div className="space-y-2 text-xs">
        {/* Line 1: CRS, DIST, ETE */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">CRS</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.course.toFixed(0)}°</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">DIST</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.distance.toFixed(1)}nm</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">ETE</span>
            <span className="font-aero-mono text-gray-900 text-xs">{displayMinutes(legData.ete)}</span>
          </div>
        </div>

        {/* Line 2: Alt, TAS, FF */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Alt</span>
            <EditableField
              value={`${flightPlan.points[index].alt}'`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { alt: parseInt(alt[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={5}
              unit="'"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">TAS</span>
            <EditableField
              value={`${flightPlan.points[index].tas}K`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { tas: parseInt(alt[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={3}
              unit="K"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">FF</span>
            <EditableField
              value={`${flightPlan.points[index].fuelFlow}pph`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { fuelFlow: parseInt(alt[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={5}
              unit="pph"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">WND</span>
            <span>
            <EditableField
              value={`${flightPlan.points[index].windDir}°`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { windDir: parseInt(alt[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={3}
              unit="°"
            />
            /
            <EditableField
              value={`${flightPlan.points[index].windSpeed}K`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { windSpeed: parseInt(alt[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={2}
              unit="K"
            />
            </span>
          </div>
        </div>

        {/* Line 3: Leg Fuel, EFR */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Leg Fuel:</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.legFuel.toFixed(0)}lbs</span>
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
export const FlightPlanZone: React.FC<FlightPlanZoneProps> = ({ flightPlan, onFlightPlanUpdate }) => {
  const [planName, setPlanName] = useState("Flight Plan Alpha");

  const fligthPlanZoneContent = useMemo(() => {
    return (
    <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
      <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Flight Plan</h3>
      
      {/* Flight Plan Header */}
      <div className="space-y-3 mb-2">
        <div className="flex items-center space-x-1">
          <span className="text-xs font-aero-label text-gray-600">Name:</span>
          <EditableField
            value={planName}
            onChange={setPlanName}
            className="text-gray-900 font-aero-label"
          />
        </div>
      </div>
      <div className="space-y-3 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <span className="text-xs font-aero-label text-gray-600">Initial time:</span>
            <TimeEditableField
              hour={flightPlan.initTimeHour}
              minute={flightPlan.initTimeMin}
              onChange={(hour, minute) => {
                const updatedFlightPlan = { ...flightPlan, initTimeHour: hour, initTimeMin: minute };
                onFlightPlanUpdate(updatedFlightPlan);
              }}
              className="text-gray-900 font-aero-label"
            />
          </div>
          <div className="flex items-center space-x-1">
            <span className="text-xs font-aero-label text-gray-600">Initial FOB:</span>
            <EditableField
              value={`${flightPlan.initFob}`}
              onChange={(value: string) => {
                const fob = value.match(/\d+/);
                if (fob && fob[0]) {
                  const updatedFlightPlan = { ...flightPlan, initFob: parseInt(fob[0]) };
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="text-gray-900 font-aero-label"
              maxLength={5}
            />
          </div>
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
                <div className="flex items-center justify-between">
                  <span className="text-sm font-aero-label text-gray-900">
                    {index + 1}. <EditableField
                      value={`WP${index + 1}`}
                      onChange={() => {}}
                      className="font-aero-label text-gray-900"
                    />
                  </span>
                  <span className="text-xs font-aero-mono text-gray-500">
                    {waypoint.lat?.toFixed(4)}, {waypoint.lon?.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Route Card (indented) */}
              {index < flightPlan.points.length - 1 && (
                <RouteCard flightPlan={flightPlan} index={index} onFlightPlanUpdate={onFlightPlanUpdate} />
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