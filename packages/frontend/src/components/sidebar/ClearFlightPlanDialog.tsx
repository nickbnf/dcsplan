import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ClearFlightPlanDialogProps {
  onConfirm: () => void;
}

export const ClearFlightPlanDialog: React.FC<ClearFlightPlanDialogProps> = ({ onConfirm }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    onConfirm();
    setIsOpen(false);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-700 text-gray-700 transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Clear
        </button>
      </Dialog.Trigger>
      
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
          <Dialog.Title className="text-lg font-semibold mb-4">Clear Flight Plan</Dialog.Title>
          
          <div className="mb-6">
            <p className="text-sm text-gray-600">
              Are you sure you want to clear the flight plan? This action cannot be undone.
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button 
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button 
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              onClick={handleConfirm}
            >
              Clear
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
