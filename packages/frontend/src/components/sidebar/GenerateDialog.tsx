import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FlightPlan } from '../../types/flightPlan';
import { getApiUrl } from '../../config/api';

interface GenerateDialogProps {
  flightPlan?: FlightPlan;
}

export const GenerateDialog: React.FC<GenerateDialogProps> = ({ flightPlan }) => {
  const [output, setOutput] = useState<'zip' | number>('zip');
  const [includeFuelCalculations, setIncludeFuelCalculations] = useState(false);
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
      // Build query parameters
      const params = new URLSearchParams();
      params.append('output', output.toString());
      if (includeFuelCalculations) {
        params.append('include_fuel', 'true');
      }

      const response = await fetch(`${getApiUrl('kneeboard')}?${params.toString()}`, {
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

      // Get the blob (PNG or ZIP)
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      
      if (output === 'zip') {
        // For ZIP files, download to disk
        const a = document.createElement('a');
        a.href = url;
        a.download = 'flight_plan.zip';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // For PNG files, open in a new browser tab
        window.open(url, '_blank');
        // Revoke the URL after a delay to allow the new tab to load the image
        // The browser will keep the blob URL valid as long as the tab is open
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      }
      
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
            {/* Radio buttons */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="outputType"
                  value="zip"
                  checked={output === 'zip'}
                  onChange={() => setOutput('zip')}
                  className="mr-2"
                />
                <span className="text-sm">Full Kneeboard (ZIP)</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="radio"
                  name="outputType"
                  value="png"
                  checked={output !== 'zip'}
                  onChange={() => setOutput(1 as number)}
                  className="mr-2"
                />
                <span className="text-sm">Single Leg (PNG)</span>
              </label>
            </div>
            
            {/* Leg number field (only shown when Single Leg is selected) */}
            {output !== 'zip' && flightPlan && (
              <div>
                <label className="block text-sm font-medium mb-1">Leg #</label>
                <input
                  type="number"
                  min="1"
                  max={flightPlan.points.length > 0 ? flightPlan.points.length - 1 : 1}
                  value={output}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1;
                    const maxLegs = flightPlan && flightPlan.points.length > 0 ? flightPlan.points.length - 1 : 1;
                    //setLegNumber(Math.min(Math.max(1, value), maxLegs));
                    setOutput(Math.min(Math.max(1, value), maxLegs));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-avio-accent"
                  placeholder="Enter leg number"
                />
              </div>
            )}
            
            {/* Checkbox */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeFuelCalculations}
                  onChange={(e) => setIncludeFuelCalculations(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">Include fuel calculations</span>
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
              {isGenerating ? 'Generating...' : `Generate ${output === 'zip' ? 'ZIP' : 'PNG'}`}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

