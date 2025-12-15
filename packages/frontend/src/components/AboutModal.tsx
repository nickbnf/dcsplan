import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link } from 'react-router-dom';
import * as Separator from '@radix-ui/react-separator';
import { AboutContent } from './AboutContent';

const FIRST_VISIT_KEY = 'dcsplan_first_visit';

export const AboutModal: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Check if this is the first visit
    const hasVisited = localStorage.getItem(FIRST_VISIT_KEY);
    if (!hasVisited) {
      setOpen(true);
      // Mark as visited
      localStorage.setItem(FIRST_VISIT_KEY, 'true');
    }
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg border border-gray-200 w-[90vw] max-w-3xl max-h-[90vh] overflow-y-auto z-50">
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-2xl font-aero-label text-gray-900">
                Welcome to DCSPlan
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </Dialog.Close>
            </div>

            <Separator.Root className="my-4 bg-gray-300 h-px" />

            <div className="space-y-6">
              <AboutContent 
                showGettingStarted={false}
                showFooter={false}
                separatorClassName="my-4 bg-gray-300 h-px"
              />

              <Separator.Root className="my-4 bg-gray-300 h-px" />

              <div className="flex items-center justify-between pt-2">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded font-aero-label text-sm transition-colors">
                    Get Started
                  </button>
                </Dialog.Close>
                <Link
                  to="/about"
                  onClick={() => setOpen(false)}
                  className="text-sm text-gray-600 hover:text-gray-900 underline font-aero-label"
                >
                  Read more →
                </Link>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
