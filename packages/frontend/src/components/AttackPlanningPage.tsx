import React, { useState, useCallback } from 'react';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { calculateAttackProfile } from '../utils/attackPlanningUtils';
import type { AttackPlanningParams, AttackPlanningResults } from '../types/flightPlan';
import AttackDiagram from './AttackDiagram';

const DEFAULT_PARAMS: AttackPlanningParams = {
  attackType: 'oblique_popup',
  angleOff: 30,
  climbTas: 300,
  climbAngle: 20,
  diveAngle: 45,
  apexAltitude: 8000,
  dropAltitude: 3000,
  targetAltitude: 100,
  windDir: 0,
  windSpeed: 20,
  rollInG: 3,
};

const NumericField: React.FC<{
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}> = ({ label, value, unit, onChange }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs font-aero-label text-gray-600 w-32">{label}</span>
    <div className="flex items-center space-x-1">
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
      />
      <span className="text-xs font-aero-label text-gray-500 w-8">{unit}</span>
    </div>
  </div>
);

const ResultRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-xs font-aero-label text-gray-600">{label}</span>
    <span className="text-xs font-aero-mono text-gray-900">{value}</span>
  </div>
);

const formatLatLon = (lat: number, lon: number): string => {
  const latDeg = Math.trunc(lat);
  const latMin = Math.abs((lat - latDeg) * 60);
  const lonDeg = Math.trunc(lon);
  const lonMin = Math.abs((lon - lonDeg) * 60);
  return `${latDeg}°${latMin.toFixed(2)}' / ${lonDeg}°${lonMin.toFixed(2)}'`;
};

const formatTime = (seconds: number): string => {
  const m = Math.trunc(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const ResultsPanel: React.FC<{ results: AttackPlanningResults }> = ({ results }) => (
  <div className="p-4 bg-white rounded shadow min-w-[300px]">
    <h3 className="text-sm font-aero-label text-gray-900 mb-3 uppercase">Attack Profile</h3>
    <div className="space-y-1">
      <ResultRow label="Climb Heading" value={`${results.climbHeading.toFixed(0)}°`} />
      <ResultRow label="Run-in Heading" value={`${results.runInHeading.toFixed(0)}°`} />
      <ResultRow label="Run-in Distance" value={`${results.runInDistance.toFixed(2)} nm`} />
      <ResultRow label="Climb Distance" value={`${results.climbDistance.toFixed(2)} nm`} />
      <ResultRow label="Climb Time" value={formatTime(results.climbTime)} />
      <div className="border-t border-gray-200 my-2" />
      <ResultRow label="PUP" value={formatLatLon(results.pupLat, results.pupLon)} />
      <ResultRow label="ECT" value={formatLatLon(results.ectLat, results.ectLon)} />
      <ResultRow label="Roll-in" value={formatLatLon(results.rollInLat, results.rollInLon)} />
      <ResultRow label="EoRI" value={formatLatLon(results.endOfRollInLat, results.endOfRollInLon)} />
    </div>
  </div>
);

const AttackPlanningPage: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const [params, setParams] = useState<AttackPlanningParams>(
    flightPlan.attackPlanning?.params ?? DEFAULT_PARAMS
  );

  const hasIp = flightPlan.points.some(p => p.waypointType === 'ip');
  const hasTgt = flightPlan.points.some(p => p.waypointType === 'tgt');
  const canCalculate = hasIp && hasTgt;
  const results = flightPlan.attackPlanning?.results;

  const handleCalculate = useCallback(() => {
    const newResults = calculateAttackProfile(flightPlan, params);
    if (newResults) {
      onFlightPlanUpdate({
        ...flightPlan,
        attackPlanning: { params, results: newResults },
      });
    }
  }, [flightPlan, params, onFlightPlanUpdate]);

  const set = <K extends keyof AttackPlanningParams>(key: K, val: AttackPlanningParams[K]) =>
    setParams(p => ({ ...p, [key]: val }));

  return (
    <div className="flex flex-1 w-full overflow-hidden">
      {/* Left panel: form */}
      <div className="w-[400px] shrink-0 h-full bg-gray-50 border-r border-gray-300 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-aero-label text-gray-900">Attack Planning</h2>
        </div>

        <div className="p-4 space-y-3 flex-1">
          {/* Attack type */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Attack type</span>
            <select
              value={params.attackType}
              onChange={e => set('attackType', e.target.value as 'oblique_popup')}
              className="text-sm font-aero-label border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
            >
              <option value="oblique_popup">Oblique pop-up</option>
            </select>
          </div>

          {/* Angle off */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Angle off</span>
            <select
              value={params.angleOff}
              onChange={e => set('angleOff', parseInt(e.target.value) as 30 | 45 | 60)}
              className="text-sm font-aero-label border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
            >
              <option value={30}>30°</option>
              <option value={45}>45°</option>
              <option value={60}>60°</option>
            </select>
          </div>

          <NumericField label="Climb TAS" value={params.climbTas} unit="kts" onChange={v => set('climbTas', v)} />
          <NumericField label="Climb angle" value={params.climbAngle} unit="°" onChange={v => set('climbAngle', v)} />
          <NumericField label="Dive angle" value={params.diveAngle} unit="°" onChange={v => set('diveAngle', v)} />
          <NumericField label="Apex altitude" value={params.apexAltitude} unit="ft" onChange={v => set('apexAltitude', v)} />
          <NumericField label="Drop altitude" value={params.dropAltitude} unit="ft" onChange={v => set('dropAltitude', v)} />
          <NumericField label="Target altitude" value={params.targetAltitude} unit="ft" onChange={v => set('targetAltitude', v)} />
          <NumericField label="Roll-in g" value={params.rollInG} unit="g" onChange={v => set('rollInG', v)} />

          {/* Wind */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-aero-label text-gray-600 w-32">Wind</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                value={params.windDir}
                onChange={e => set('windDir', parseFloat(e.target.value) || 0)}
                className="w-14 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
              />
              <span className="text-xs font-aero-label text-gray-500">°/</span>
              <input
                type="number"
                value={params.windSpeed}
                onChange={e => set('windSpeed', parseFloat(e.target.value) || 0)}
                className="w-14 text-right text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white focus:outline-none focus:border-gray-500"
              />
              <span className="text-xs font-aero-label text-gray-500 w-8">kts</span>
            </div>
          </div>
        </div>

        {/* Calculate button pinned to bottom */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          {!canCalculate && (
            <p className="text-xs font-aero-label text-gray-500">
              {!hasIp && !hasTgt
                ? 'Add IP and TGT waypoints to enable calculation.'
                : !hasIp
                ? 'Add an IP waypoint to enable calculation.'
                : 'Add a TGT waypoint to enable calculation.'}
            </p>
          )}
          <button
            onClick={handleCalculate}
            disabled={!canCalculate}
            className="w-full py-2 font-aero-label text-sm bg-avio-primary text-white rounded hover:bg-avio-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Calculate
          </button>
        </div>
      </div>

      {/* Right panel: diagram + compact results */}
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-gray-100 gap-4 p-4 overflow-auto">
        {results ? (
          <>
            <AttackDiagram
              results={results}
              ip={flightPlan.points.find(p => p.waypointType === 'ip')!}
              tgt={flightPlan.points.find(p => p.waypointType === 'tgt')!}
            />
            <ResultsPanel results={results} />
          </>
        ) : (
          <p className="font-aero-label text-gray-500">Press Calculate to compute attack profile.</p>
        )}
      </div>
    </div>
  );
};

export default AttackPlanningPage;
