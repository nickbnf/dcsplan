import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FlightPlan } from '../../types/flightPlan';
import { getApiUrl } from '../../config/api';

interface ImportFlightPlanDialogProps {
  onImport: (flightPlan: FlightPlan) => void;
}

/**
 * Parses Pydantic validation errors into user-friendly messages
 */
function parseValidationError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error.detail) {
    // FastAPI validation error format
    if (Array.isArray(error.detail)) {
      // Pydantic validation errors
      const messages = error.detail.map((err: any) => {
        const field = err.loc ? err.loc.join('.') : 'field';
        const msg = err.msg || 'Invalid value';
        return `${field}: ${msg}`;
      });
      return messages.join('\n');
    } else if (typeof error.detail === 'string') {
      return error.detail;
    }
  }

  if (error.message) {
    return error.message;
  }

  return 'An unknown error occurred while importing the flight plan.';
}

export const ImportFlightPlanDialog: React.FC<ImportFlightPlanDialogProps> = ({ onImport }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileSelected, setFileSelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileSelected(true);
      setError(null);
      // Open confirmation dialog
      setIsOpen(true);
    }
  };

  const handleTriggerClick = () => {
    fileInputRef.current?.click();
  };

  const handleConfirm = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('No file selected');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      // Read file content
      const text = await file.text();
      
      // Parse JSON
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        throw new Error('Invalid JSON format. Please check the file and try again.');
      }

      // Validate basic structure
      if (!jsonData.version || !jsonData.flightPlan) {
        throw new Error('Invalid flight plan format. Missing version or flightPlan field.');
      }

      // POST to backend for validation
      const response = await fetch(getApiUrl('flightplan/import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(parseValidationError(errorData));
      }

      // Get validated flight plan
      const data = await response.json();
      const importedFlightPlan: FlightPlan = data.flightPlan;

      // Update parent component
      onImport(importedFlightPlan);
      
      // Close dialog and reset
      setIsOpen(false);
      setFileSelected(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import flight plan');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    setFileSelected(false);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      <Dialog.Root open={isOpen} onOpenChange={(open) => {
        if (!open) {
          handleCancel();
        } else {
          setIsOpen(open);
        }
      }}>
        <Dialog.Trigger asChild>
          <button
            onClick={handleTriggerClick}
            className="opacity-40 hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-700"
            title="Upload flight plan"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
        </Dialog.Trigger>
        
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
            <Dialog.Title className="text-lg font-semibold mb-4">Import Flight Plan</Dialog.Title>
            
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                This will replace your current flight plan. Are you sure you want to continue?
              </p>
              {fileSelected && fileInputRef.current?.files?.[0] && (
                <p className="text-xs text-gray-500">
                  File: {fileInputRef.current.files[0].name}
                </p>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600 whitespace-pre-wrap">
                {error}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button 
                  className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isImporting}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button 
                className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConfirm}
                disabled={isImporting || !fileSelected}
              >
                {isImporting ? 'Importing...' : 'Import'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
