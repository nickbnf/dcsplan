import type { FlightPlan, FlightPlanPointChange, LegData, VersionedFlightPlan, PerformanceFileV1 } from "../types/flightPlan";

/** Returns the effective exit time for a Push waypoint, clamped to be >= ETA. */
export const getEffectiveExitTime = (exitTimeSec: number | undefined, eta: number): number =>
  Math.max(exitTimeSec ?? eta, eta);
import { FLIGHT_PLAN_VERSION, PERFORMANCE_FILE_VERSION, defaultAircraft } from "../types/flightPlan";
import { calculateAllLegData } from "./legCalculations";

export const slugifyPlanName = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const generateRegimeId = (): string => crypto.randomUUID().slice(0, 8);

const defaultTas = 400;
const defaultAlt = 3000;
const defaultFuelFlow = 6000;
const defaultWindSpeed = 0;
const defaultWindDir = 0;

// A bunch of functions to manipulate the flight plan
export const flightPlanUtils = {
    newFlightPlan: (theatre: string = "syria_old"): FlightPlan => {
        return { theatre, points: [], aircraft: defaultAircraft(), declination: 0, bankAngle: 45, initTimeSec: 12 * 3600, initFob: 12000, name: "Flight Plan One" };
    },
    addTurnPoint: (flightPlan: FlightPlan, lat: number, lon: number): FlightPlan => {
        const tas = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].tas : defaultTas;
        const alt = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].alt : defaultAlt;
        const fuelFlow = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].fuelFlow : defaultFuelFlow;
        const windSpeed = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].windSpeed : defaultWindSpeed;
        const windDir = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].windDir : defaultWindDir;
        const newIndex = flightPlan.points.length;
        const name = `WP${newIndex + 1}`;

        const newPoints = [...flightPlan.points, { lat, lon, tas, alt, fuelFlow, windSpeed, windDir, name }];
        if (newPoints.length > 1) {
            newPoints[newPoints.length - 2] = { ...newPoints[newPoints.length - 2], tas, alt, fuelFlow, windSpeed, windDir };
        }

        return { ...flightPlan, points: newPoints };
    },
    moveTurnPoint: (flightPlan: FlightPlan, index: number, lat: number, lon: number): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { ...newPoints[index], lat, lon };

        return { ...flightPlan, points: newPoints };
    },
    updateTurnPoint: (flightPlan: FlightPlan, index: number, pointChange: FlightPlanPointChange): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { ...newPoints[index], ...pointChange };

        // Clear Push-specific fields when changing type away from Push
        if (pointChange.waypointType !== undefined && pointChange.waypointType !== 'push') {
            delete newPoints[index].exitTimeSec;
            delete newPoints[index].hack;
        }

        return { ...flightPlan, points: newPoints };
    },
    deleteTurnPoint: (flightPlan: FlightPlan, index: number): FlightPlan => {
        return { ...flightPlan, points: flightPlan.points.filter((_, i) => i !== index) };
    },
    insertTurnPointAtPosition: (flightPlan: FlightPlan, index: number, lat: number, lon: number, alt: number, regimeId?: string): FlightPlan => {
        // Insert a waypoint with explicit position after waypoint[index]
        if (index < 0 || index >= flightPlan.points.length - 1) return flightPlan;
        const originWpt = flightPlan.points[index];
        const newIndex = index + 1;
        const newPoint: any = {
            lat, lon,
            tas: originWpt.tas,
            alt,
            fuelFlow: originWpt.fuelFlow,
            windSpeed: originWpt.windSpeed,
            windDir: originWpt.windDir,
            name: `WP${newIndex + 1}`,
        };
        if (regimeId !== undefined) newPoint.regimeId = regimeId;
        const newPoints = [...flightPlan.points];
        newPoints.splice(index + 1, 0, newPoint);
        return { ...flightPlan, points: newPoints };
    },
    insertTurnPointAtMidpoint: (flightPlan: FlightPlan, index: number): FlightPlan => {
        // Insert a waypoint at the midpoint of the leg between waypoint[index] and waypoint[index + 1]
        // The new waypoint inherits all properties from the starting waypoint of the leg
        if (index < 0 || index >= flightPlan.points.length - 1) {
            // Invalid index or no next waypoint
            return flightPlan;
        }

        const originWpt = flightPlan.points[index];
        const destinationWpt = flightPlan.points[index + 1];

        // Calculate midpoint (simple average for small distances)
        const lat = (originWpt.lat + destinationWpt.lat) / 2;
        const lon = (originWpt.lon + destinationWpt.lon) / 2;

        // Inherit all properties from the origin waypoint
        const newIndex = index + 1;
        const newPoint = {
            lat,
            lon,
            tas: originWpt.tas,
            alt: originWpt.alt,
            fuelFlow: originWpt.fuelFlow,
            windSpeed: originWpt.windSpeed,
            windDir: originWpt.windDir,
            name: `WP${newIndex + 1}`
        };

        const newPoints = [...flightPlan.points];
        newPoints.splice(index + 1, 0, newPoint);

        return { ...flightPlan, points: newPoints };
    },
    calculateAllLegData: (flightPlan: FlightPlan, projection: any, navigationMode: string): LegData[] => {
        return calculateAllLegData(flightPlan, projection, navigationMode);
    },
    prevWptPosition: (flightPlan: FlightPlan, index: number): (null | [number, number]) => {
        if (index === 0) {
            return null;
        }
        return [flightPlan.points[index - 1].lon, flightPlan.points[index - 1].lat];
    },
    nextWptPosition: (flightPlan: FlightPlan, index: number): (null | [number, number]) => {
        if (index === flightPlan.points.length - 1) {
            return null;
        }
        return [flightPlan.points[index + 1].lon, flightPlan.points[index + 1].lat];
    },
    updateDeclination: (flightPlan: FlightPlan, declination: number): FlightPlan => {
        return { ...flightPlan, declination }
    },
    updateTheatre: (flightPlan: FlightPlan, theatre: string): FlightPlan => {
        return { ...flightPlan, theatre }
    },
    updateBankAngle: (flightPlan: FlightPlan, bankAngle: number): FlightPlan => {
        return { ...flightPlan, bankAngle }
    },
    downloadFlightPlan: (flightPlan: FlightPlan): void => {
        const exportData: VersionedFlightPlan = {
            version: FLIGHT_PLAN_VERSION,
            flightPlan: flightPlan
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        let filename = 'flightplan.json';
        if (flightPlan.name) {
            const sanitized = slugifyPlanName(flightPlan.name);
            if (sanitized) filename = `${sanitized}.json`;
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    downloadAircraft: (flightPlan: FlightPlan): void => {
        const aircraftCopy = JSON.parse(JSON.stringify(flightPlan.aircraft));
        const envelope: PerformanceFileV1 = {
            version: PERFORMANCE_FILE_VERSION,
            aircraft: aircraftCopy,
        };
        const jsonString = JSON.stringify(envelope, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const slug = flightPlan.aircraft.model ? slugifyPlanName(flightPlan.aircraft.model) : '';
        const filename = slug ? `${slug}.perf.json` : 'performance.json';

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
}
