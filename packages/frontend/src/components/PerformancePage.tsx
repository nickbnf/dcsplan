import React from 'react';

const PerformancePage: React.FC = () => {
  return (
    <div className="flex flex-1 w-full overflow-hidden">
      <div className="w-[400px] shrink-0 h-full bg-gray-50 border-r border-gray-300 flex flex-col">
        <div className="p-4">
          <h2 className="text-lg font-aero-label text-gray-900">Performance</h2>
        </div>
      </div>
      <div className="flex-1 h-full flex items-center justify-center bg-gray-100">
        <p className="font-aero-label text-gray-500">Performance screen — coming soon</p>
      </div>
    </div>
  );
};

export default PerformancePage;
