import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ChangeTheatreDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  theatreName: string;
}

export const ChangeTheatreDialog: React.FC<ChangeTheatreDialogProps> = ({ 
  isOpen, 
  onOpenChange, 
  onConfirm,
  theatreName
}) => {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw] z-[101]">
          <Dialog.Title className="text-lg font-semibold mb-4">Change Theatre</Dialog.Title>
          
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              Changing the theatre to <strong>{theatreName}</strong> will reset your current flight plan. 
            </p>
            <p className="text-sm text-gray-600">
              Are you sure you want to continue? This action cannot be undone.
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
              className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              Change Theatre
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

