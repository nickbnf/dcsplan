import React, { useState, useMemo } from 'react';
import * as Separator from '@radix-ui/react-separator';
import type { FlightPlan } from '../../types/flightPlan';
import { flightPlanUtils } from '../../utils/flightPlanUtils';
import { GenerateDialog } from './GenerateDialog';
import { DeleteWaypointDialog } from './DeleteWaypointDialog';

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
  numericOnly?: boolean; // If true, only allows numbers; if false, allows any text
}

const EditableField: React.FC<EditableFieldProps> = ({ 
  value, 
  onChange, 
  placeholder = "Click to edit",
  className = "",
  maxLength,
  unit = "",
  numericOnly = true
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
    if (numericOnly) {
      // Only allow numbers and decimal point
      if (/^\d*\.?\d*$/.test(inputValue)) {
        if (!maxLength || inputValue.length <= maxLength) {
          setEditValue(inputValue);
        }
      }
    } else {
      // Allow any text
      if (!maxLength || inputValue.length <= maxLength) {
        setEditValue(inputValue);
      }
    }
  };

  if (isEditing) {
    const inputWidth = numericOnly 
      ? (maxLength === 3 ? 'w-8' : maxLength === 5 ? 'w-12' : 'w-8')
      : 'w-32';
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
  timeSec: number;
  onChange: (hour: number, minute: number, seconds: number) => void;
  className?: string;
}

const secondsToTimeString = (timeSec: number) => {
  const hour = Math.trunc(timeSec / 3600);
  const minute = Math.trunc((timeSec % 3600) / 60);
  const seconds = timeSec % 60;
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;
}

export const TimeEditableField: React.FC<TimeEditableFieldProps> = ({ 
  timeSec, 
  onChange, 
  className = ""
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(() => {
    return secondsToTimeString(timeSec);
  });
  const [prevLength, setPrevLength] = useState(8);

  const handleSave = () => {
    // Try different patterns for partial entry support
    let newHour = 0;
    let newMinute = 0;
    let newSeconds = 0;
    
    // Full format: HH:MM:SS
    const fullMatch = editValue.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
    if (fullMatch) {
      newHour = parseInt(fullMatch[1]);
      newMinute = parseInt(fullMatch[2]);
      newSeconds = parseInt(fullMatch[3]);
    }
    // Partial format: HH:MM
    else {
      const partialMatch = editValue.match(/^(\d{1,2}):(\d{1,2})$/);
      if (partialMatch) {
        newHour = parseInt(partialMatch[1]);
        newMinute = parseInt(partialMatch[2]);
        newSeconds = 0;
      }
      // Just digits: HH
      else {
        const digitsOnly = editValue.replace(/[^\d]/g, '');
        if (digitsOnly.length > 0) {
          newHour = parseInt(digitsOnly);
          newMinute = 0;
          newSeconds = 0;
        } else {
          // If format is invalid, restore to original
          setEditValue(secondsToTimeString(timeSec));
          setIsEditing(false);
          return;
        }
      }
    }
    
    // Clamp values to valid ranges
    newHour = Math.min(23, Math.max(0, newHour));
    newMinute = Math.min(59, Math.max(0, newMinute));
    newSeconds = Math.min(59, Math.max(0, newSeconds));
    
    onChange(newHour, newMinute, newSeconds);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(() => {
      return secondsToTimeString(timeSec);
    });
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
    const isDeleting = inputValue.length < prevLength;
    
    // Allow digits and colons
    if (/^[\d:]*$/.test(inputValue)) {
      // If deleting, allow natural backspace through all characters
      if (isDeleting) {
        setEditValue(inputValue);
        setPrevLength(inputValue.length);
        return;
      }
      
      // If typing, auto-format by inserting colons at appropriate positions
      const digitsOnly = inputValue.replace(/[^\d]/g, '');
      
      // Only format if we have digits and user is adding characters
      if (digitsOnly.length > 0 && inputValue.length >= prevLength) {
        let formatted = '';
        if (digitsOnly.length <= 2) {
          formatted = digitsOnly;
        } else if (digitsOnly.length <= 4) {
          formatted = digitsOnly.substring(0, 2) + ':' + digitsOnly.substring(2);
        } else {
          formatted = digitsOnly.substring(0, 2) + ':' + digitsOnly.substring(2, 4) + ':' + digitsOnly.substring(4, 6);
        }
        if (formatted.length <= 8) {
          setEditValue(formatted);
          setPrevLength(formatted.length);
        }
      } else {
        setEditValue(inputValue);
        setPrevLength(inputValue.length);
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
        className={`bg-transparent border-b border-gray-400 focus:border-gray-600 outline-none text-sm w-20 ${className}`}
        autoFocus
        placeholder="HH or HH:MM or HH:MM:SS"
      />
    );
  }

  return (
    <span
      onClick={() => {
        const timeStr = secondsToTimeString(timeSec);
        setEditValue(timeStr);
        setPrevLength(timeStr.length);
        setIsEditing(true);
      }}
      className={`cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded text-sm ${className}`}
    >
      {secondsToTimeString(timeSec)}
    </span>
  );
};

const displaySecondsInMinutes = (totalSeconds: number) => {
  const minutes = Math.trunc(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes+"+"+seconds
}

const WaypointCard: React.FC<{ flightPlan: FlightPlan, index: number, onFlightPlanUpdate: (flightPlan: FlightPlan) => void }> = ({ flightPlan, index, onFlightPlanUpdate }) => {
  const waypoint = flightPlan.points[index];
  
  // Calculate ETA and EFR for this waypoint
  let eta = flightPlan.initTimeSec;
  let efr = flightPlan.initFob;
  if (index > 0) {
    const prevLegData = flightPlanUtils.calculateLegData(flightPlan, index - 1);
    eta = prevLegData.eta;
    efr = prevLegData.efr;
  }

  const handleDelete = () => {
    const updatedFlightPlan = flightPlanUtils.deleteTurnPoint(flightPlan, index);
    onFlightPlanUpdate(updatedFlightPlan);
  };

  const lat_deg = Math.trunc(waypoint.lat ?? 0);
  const lat_minutes = ((waypoint.lat ?? 0) - lat_deg) * 60;
  const lon_deg = Math.trunc(waypoint.lon ?? 0);
  const lon_minutes = ((waypoint.lon ?? 0) - lon_deg) * 60;

  return (
    <div className="group bg-white border border-gray-200 rounded p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-aero-label text-gray-900">
          {index + 1}. <EditableField
            value={waypoint.name || `WP${index + 1}`}
            onChange={(value: string) => {
              const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index, { name: value });
              onFlightPlanUpdate(updatedFlightPlan);
            }}
            className="font-aero-label text-gray-900"
            numericOnly={false}
            maxLength={20}
          />
        </span>
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-end text-right">
            <span className="text-xs font-aero-mono text-gray-500">
              {lat_deg}°{lat_minutes.toFixed(2)}', {lon_deg}°{lon_minutes.toFixed(2)}'
            </span>
            <div className="flex items-center space-x-3 mt-1">
              <div className="flex items-center space-x-1">
                <span className="font-aero-label text-gray-600 text-xs">ETA</span>
                <span className="font-aero-mono text-gray-900 text-xs">{secondsToTimeString(eta)}</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="font-aero-label text-gray-600 text-xs">EFR</span>
                <span className="font-aero-mono text-gray-900 text-xs">{efr.toFixed(0)}lbs</span>
              </div>
            </div>
          </div>
          <div className="-mr-2">
            <DeleteWaypointDialog 
              waypointNumber={index + 1}
              onConfirm={handleDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const RouteCard: React.FC<{ 
  flightPlan: FlightPlan, 
  index: number, 
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void
}> = ({ flightPlan, index, onFlightPlanUpdate }) => {
  const legData = flightPlanUtils.calculateLegData(flightPlan, index);
  
  const handleInsertClick = () => {
    const updatedFlightPlan = flightPlanUtils.insertTurnPointAtMidpoint(flightPlan, index);
    onFlightPlanUpdate(updatedFlightPlan);
  };

  return (
    <div className="group ml-4 bg-gray-100 border border-gray-200 rounded p-3">
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
            <span className="font-aero-mono text-gray-900 text-xs">{displaySecondsInMinutes(legData.ete)}</span>
          </div>
        </div>

        {/* Line 2: Alt, TAS, FF */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Alt</span>
            <EditableField
              value={`${flightPlan.points[index+1].alt}'`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index+1, { alt: parseInt(alt[0]) });
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
              value={`${flightPlan.points[index+1].tas}K`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index+1, { tas: parseInt(alt[0]) });
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
              value={`${flightPlan.points[index+1].fuelFlow}pph`}
              onChange={(value: string) => {
                const alt = value.match(/\d+/);
                if (alt && alt[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index+1, { fuelFlow: parseInt(alt[0]) });
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
              value={`${flightPlan.points[index+1].windDir}°`}
              onChange={(value: string) => {
                const windDir = value.match(/\d+/);
                if (windDir && windDir[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index+1, { windDir: parseInt(windDir[0]) });
                  onFlightPlanUpdate(updatedFlightPlan);
                }
              }}
              className="font-aero-mono text-gray-900 text-xs"
              maxLength={3}
              unit="°"
            />
            /
            <EditableField
              value={`${flightPlan.points[index+1].windSpeed}K`}
              onChange={(value: string) => {
                const windSpeed = value.match(/\d+/);
                if (windSpeed && windSpeed[0]) {
                  const updatedFlightPlan = flightPlanUtils.updateTurnPoint(flightPlan, index+1, { windSpeed: parseInt(windSpeed[0]) });
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

        {/* Line 3: HDG, Leg Fuel, Insert button */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">HDG</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.heading.toFixed(0)}°</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="font-aero-label text-gray-600 text-xs">Leg Fuel</span>
            <span className="font-aero-mono text-gray-900 text-xs">{legData.legFuel.toFixed(0)}lbs</span>
          </div>
          <button
            onClick={handleInsertClick}
            className="opacity-40 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
            title="Insert waypoint at midpoint"
          >
            + Insert
          </button>
        </div>
      </div>
    </div>
  );
}

export const FlightPlanZone: React.FC<FlightPlanZoneProps> = ({ 
  flightPlan, 
  onFlightPlanUpdate
}) => {
  const [planName, setPlanName] = useState("Flight Plan Alpha");

  const fligthPlanZoneContent = useMemo(() => {
    return (
    <div className="flex-1 p-4 bg-gray-50 flex flex-col">
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto mb-4">
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
                timeSec={flightPlan.initTimeSec}
                onChange={(hour, minute, seconds) => {
                  const timeSec = hour * 3600 + minute * 60 + seconds;
                  const updatedFlightPlan = { ...flightPlan, initTimeSec: timeSec };
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
            flightPlan.points.map((_waypoint, index) => (
              <React.Fragment key={index}>
                {/* Waypoint Card */}
                <WaypointCard flightPlan={flightPlan} index={index} onFlightPlanUpdate={onFlightPlanUpdate} />

                {/* Route Card (indented) */}
                {index < flightPlan.points.length - 1 && (
                  <RouteCard 
                    flightPlan={flightPlan} 
                    index={index} 
                    onFlightPlanUpdate={onFlightPlanUpdate}
                  />
                )}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
      
      {/* Generate button at the bottom */}
      <GenerateDialog flightPlan={flightPlan} />
    </div>
  );
}, [flightPlan, planName]);

return fligthPlanZoneContent
};