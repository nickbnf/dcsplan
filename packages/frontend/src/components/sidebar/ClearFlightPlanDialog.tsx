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
        <button className="px-3 py-2 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
          Clear Flightplan
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
