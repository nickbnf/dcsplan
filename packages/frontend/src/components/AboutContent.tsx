import React from 'react';
import * as Separator from '@radix-ui/react-separator';

interface AboutContentProps {
  showGettingStarted?: boolean;
  showFooter?: boolean;
  separatorClassName?: string;
}

export const AboutContent: React.FC<AboutContentProps> = ({
  showGettingStarted = true,
  showFooter = true,
  separatorClassName = "my-6 bg-gray-300 h-px"
}) => {
  return (
    <>
      <div>
        <h2 className="text-xl font-aero-label text-gray-900 mb-3">
          What is DCSPlan?
        </h2>
        <p className="text-gray-700 leading-relaxed">
          DCSPlan is a web application designed to help plan missions for combat flight simulators, 
          particularly Digital Combat Simulator (DCS). It allows creating flight plans on
          DCS's maps and generates detailed kneeboards to help with mission following and navigation,
          even in aircraft with limited onboard systems such as 60s era jets.
        </p>
      </div>

      <Separator.Root className={separatorClassName} />

      <div>
        <h2 className="text-xl font-aero-label text-gray-900 mb-3">
          Why DCSPlan?
        </h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          One of the basic skills for real-world combat pilots is the ability to navigate and execute a mission
          relying only on their eyes, the clock, the map and basic instruments.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          And before the mid-60s, it was pretty much the only reliable method.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          However, it relies on very detailed planning, and a map accurately reflecting the terrain
          the pilot will see.
        </p>
        <p className="text-gray-700 leading-relaxed mb-4">
          DCSPlan aims to provide the map and help with the planning. Allowing you the rewarding experience
          of flying a mission the old-fashioned way!
        </p>
      </div>

      <Separator.Root className={separatorClassName} />

      <div>
        <h2 className="text-xl font-aero-label text-gray-900 mb-3">
          Key Features
        </h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong className="font-aero-label">DCS Maps:</strong> Visual references in DCS maps
            can be different from the reality, making using real VFR maps difficult. DCSPlan provides
            maps exported directly from DCS's mission editor for accuracy.
          </li>
          <li>
            <strong className="font-aero-label">Kneeboard Generation:</strong> Generate detailed 
            kneeboards with navigation data, map extracts, and flight information for each leg of your mission.
          </li>
          {/*
          <li>
            <strong className="font-aero-label">Mission Import:</strong> Import flight plans from 
            DCS mission files to quickly get started with existing missions.
          </li>
          */}
          <li>
            <strong className="font-aero-label">Detailed Calculations:</strong> Automatic calculation 
            of headings, distances, wind, estimated times, fuel consumption, etc.
          </li>
          <li>
            <strong className="font-aero-label">Turn calculation:</strong> Unlike most planners,
            especially those designed for civilian aviation, DCSPlan accept you are flying fast and
            calculate and draw turns with the correct radius based on your speed and bank angle.
          </li>
        </ul>
      </div>

      {showGettingStarted && (
        <>
          <Separator.Root className={separatorClassName} />

          <div>
            <h2 className="text-xl font-aero-label text-gray-900 mb-3">
              Getting Started
            </h2>
            <p className="text-gray-700 leading-relaxed">
              To begin planning your mission, simply start drawing waypoints on the map. You can edit waypoint 
              details, adjust flight parameters, and generate a kneeboard when you're ready. The application 
              automatically saves your work, so you can return to your flight plan at any time.
            </p>
          </div>
        </>
      )}

      {showFooter && (
        <>
          <Separator.Root className={separatorClassName} />

          <footer className="text-sm text-gray-600 text-center">
            <p>
              DCSPlan is available online at{' '}
              <a
                href="https://dcsplan.bonnefon.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-900 hover:underline"
              >
                dcsplan.bonnefon.org
              </a>
            </p>
          </footer>
        </>
      )}
    </>
  );
};
