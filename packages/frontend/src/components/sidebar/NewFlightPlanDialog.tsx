import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { TheatreMetadata } from '../../hooks/useTheatres';
import type { FlightPlan } from '../../types/flightPlan';
import { flightPlanUtils } from '../../utils/flightPlanUtils';

interface NewFlightPlanDialogProps {
  currentPlan: FlightPlan;
  theatres: TheatreMetadata[];
  onCreatePlan: (plan: FlightPlan) => void;
}

type Tier = 'anonymous' | 'signed-in';
function getCurrentTier(): Tier { return 'anonymous'; }

export const NewFlightPlanDialog: React.FC<NewFlightPlanDialogProps> = ({
  currentPlan,
  theatres,
  onCreatePlan,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTheatre, setSelectedTheatre] = useState(currentPlan.theatre);
  const [showConfirm, setShowConfirm] = useState(false);

  const needsConfirmation = getCurrentTier() === 'anonymous' && currentPlan.points.length > 0;

  const handleOpen = (open: boolean) => {
    if (open) {
      setSelectedTheatre(currentPlan.theatre);
      setShowConfirm(false);
    }
    setIsOpen(open);
  };

  const handleCreate = () => {
    if (getCurrentTier() === 'signed-in') {
      throw new Error('Signed-in plan creation is not yet available');
    }
    const newPlan = flightPlanUtils.newFlightPlan(selectedTheatre);
    onCreatePlan(newPlan);
    setIsOpen(false);
  };

  const handleProceed = () => {
    if (needsConfirmation && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    handleCreate();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-avio-panel hover:border-avio-primary hover:text-avio-primary text-gray-700 transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw] z-[101]">
          <Dialog.Title className="text-lg font-semibold mb-4">
            {showConfirm ? 'Replace current flight plan?' : 'New Flight Plan'}
          </Dialog.Title>

          {showConfirm ? (
            <div className="mb-6">
              <p className="text-sm text-gray-600">
                Your current flight plan will be replaced. This cannot be undone.
              </p>
            </div>
          ) : (
            <div className="mb-6">
              <label className="block text-sm font-aero-label text-gray-600 mb-2">Theatre</label>
              <select
                value={selectedTheatre}
                onChange={(e) => setSelectedTheatre(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avio-primary focus:border-transparent"
              >
                {theatres.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
            </Dialog.Close>
            <button
              className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover"
              onClick={handleProceed}
            >
              {showConfirm ? 'Replace' : 'Create'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
