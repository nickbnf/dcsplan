import React, { useState } from 'react';
import * as Separator from '@radix-ui/react-separator';

interface FlightPlanZoneProps {
  flightPlan?: any;
  onFlightPlanUpdate?: (flightPlan: any) => void;
}

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const EditableField: React.FC<EditableFieldProps> = ({ 
  value, 
  onChange, 
  placeholder = "Click to edit",
  className = ""
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`bg-transparent border-b border-gray-400 focus:border-gray-600 outline-none text-sm ${className}`}
        autoFocus
      />
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

export const FlightPlanZone: React.FC<FlightPlanZoneProps> = ({
  onFlightPlanUpdate
}) => {
  const [planName, setPlanName] = useState("Flight Plan Alpha");
  const [aircraft, setAircraft] = useState("F-16C");
  const [departure, setDeparture] = useState("Runway 09");
  const [arrival, setArrival] = useState("Runway 27");

  // Mock flight plan data - replace with actual flight plan data
  const mockWaypoints = [
    { id: 1, name: "WP1", lat: 40.7128, lon: -74.0060, altitude: 5000, speed: 250 },
    { id: 2, name: "WP2", lat: 40.7589, lon: -73.9851, altitude: 8000, speed: 300 },
    { id: 3, name: "WP3", lat: 40.6892, lon: -74.0445, altitude: 6000, speed: 280 },
  ];

  // Use the callback to notify parent of changes
  const handlePlanUpdate = (updatedPlan: any) => {
    onFlightPlanUpdate?.(updatedPlan);
  };

  return (
    <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Flight Plan</h3>
      
      {/* Flight Plan Header */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Name:</span>
          <EditableField
            value={planName}
            onChange={setPlanName}
            className="text-gray-900 font-medium"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Aircraft:</span>
          <EditableField
            value={aircraft}
            onChange={setAircraft}
            className="text-gray-900"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Departure:</span>
          <EditableField
            value={departure}
            onChange={setDeparture}
            className="text-gray-900"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Arrival:</span>
          <EditableField
            value={arrival}
            onChange={setArrival}
            className="text-gray-900"
          />
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Waypoints */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Waypoints</h4>
        {mockWaypoints.map((waypoint, index) => (
          <div key={waypoint.id} className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900">
                {index + 1}. {waypoint.name}
              </span>
              <span className="text-xs text-gray-500">
                {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Altitude:</span>
                <EditableField
                  value={`${waypoint.altitude} ft`}
                  onChange={(value) => {
                    const numValue = parseInt(value.replace(/\D/g, ''));
                    if (!isNaN(numValue)) {
                      // Update waypoint altitude
                      console.log(`Update waypoint ${waypoint.id} altitude to ${numValue}`);
                      handlePlanUpdate({ ...waypoint, altitude: numValue });
                    }
                  }}
                  className="text-gray-900"
                />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Speed:</span>
                <EditableField
                  value={`${waypoint.speed} kts`}
                  onChange={(value) => {
                    const numValue = parseInt(value.replace(/\D/g, ''));
                    if (!isNaN(numValue)) {
                      // Update waypoint speed
                      console.log(`Update waypoint ${waypoint.id} speed to ${numValue}`);
                      handlePlanUpdate({ ...waypoint, speed: numValue });
                    }
                  }}
                  className="text-gray-900"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Waypoint Button */}
      <button className="w-full mt-4 px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
        + Add Waypoint
      </button>
    </div>
  );
};