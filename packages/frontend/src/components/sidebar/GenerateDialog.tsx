import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FlightPlan } from '../../types/flightPlan';

interface GenerateDialogProps {
  flightPlan?: FlightPlan;
}

export const GenerateDialog: React.FC<GenerateDialogProps> = ({ flightPlan }) => {
  const [missionName, setMissionName] = useState("");
  const [aircraftType, setAircraftType] = useState("");
  const [includeApproachPlate, setIncludeApproachPlate] = useState(false);
  const [includeRadioFreqs, setIncludeRadioFreqs] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleGenerateKneeboard = async () => {
    if (!flightPlan) {
      setError("No flight plan available");
      return;
    }

    if (flightPlan.points.length < 2) {
      setError("Flight plan must have at least 2 waypoints");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/kneeboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(flightPlan),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }

      // Get the PNG blob
      const blob = await response.blob();
      
      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${missionName || 'flight_plan'}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setIsGenerating(false);
      setIsOpen(false);
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : 'Failed to generate kneeboard');
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button className="w-full px-4 py-2 mt-4 bg-avio-primary text-white rounded hover:bg-avio-primary-hover font-aero-label">
          Generate
        </button>
      </Dialog.Trigger>
      
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
          <Dialog.Title className="text-lg font-semibold mb-4">Generate Hardcopy Flight Plan</Dialog.Title>
          
          <div className="space-y-4">
            {/* Editable fields */}
            <div>
              <label className="block text-sm font-medium mb-1">Mission Name</label>
              <input
                type="text"
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-avio-accent"
                placeholder="Enter mission name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Aircraft Type</label>
              <input
                type="text"
                value={aircraftType}
                onChange={(e) => setAircraftType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-avio-accent"
                placeholder="e.g., F/A-18C, F-16C"
              />
            </div>
            
            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeApproachPlate}
                  onChange={(e) => setIncludeApproachPlate(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Include approach plate</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeRadioFreqs}
                  onChange={(e) => setIncludeRadioFreqs(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Include radio frequencies</span>
              </label>
            </div>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
              {error}
            </div>
          )}
          
          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close asChild>
              <button 
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                disabled={isGenerating}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button 
              className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleGenerateKneeboard}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate kneeboard'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

