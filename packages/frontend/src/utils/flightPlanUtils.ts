import type { FlightPlan, FlightPlanPointChange, LegData } from "../types/flightPlan";

const defaultTas = 400;
const defaultAlt = 3000;
const defaultFuelFlow = 6000;
const defaultWindSpeed = 0;
const defaultWindDir = 0;

// A bunch of functions to manipulate the flight plan
export const flightPlanUtils = {
    newFlightPlan: (): FlightPlan => {
        return { points: [], declination: 0, initTimeSec: 12 * 3600, initFob: 12000 };
    },
    addTurnPoint: (flightPlan: FlightPlan, lat: number, lon: number): FlightPlan => {
        const tas = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].tas : defaultTas;
        const alt = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].alt : defaultAlt;
        const fuelFlow = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].fuelFlow : defaultFuelFlow;
        const windSpeed = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].windSpeed : defaultWindSpeed;
        const windDir = flightPlan.points.length > 1 ? flightPlan.points[flightPlan.points.length - 2].windDir : defaultWindDir;

        const newPoints = [...flightPlan.points, { lat, lon, tas, alt, fuelFlow, windSpeed, windDir }];
        if (newPoints.length > 1) {
            newPoints[newPoints.length - 2] = { ...newPoints[newPoints.length - 2], tas, alt, fuelFlow, windSpeed, windDir };
        }

        return { ...flightPlan, points: newPoints };
    },
    moveTurnPoint: (flightPlan: FlightPlan, index: number, lat: number, lon: number): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { lat, lon, tas: newPoints[index].tas, alt: newPoints[index].alt,
            fuelFlow: newPoints[index].fuelFlow, windSpeed: newPoints[index].windSpeed, windDir: newPoints[index].windDir };

        return { ...flightPlan, points: newPoints };
    },
    updateTurnPoint: (flightPlan: FlightPlan, index: number, pointChange: FlightPlanPointChange): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { ...newPoints[index], ...pointChange };
        
        console.log("updateTurnPoint", index, newPoints[index]);

        return { ...flightPlan, points: newPoints };
    },
    deleteTurnPoint: (flightPlan: FlightPlan, index: number): FlightPlan => {
        return { ...flightPlan, points: flightPlan.points.filter((_, i) => i !== index) };
    },
    calculateLegData: (flightPlan: FlightPlan, indexWptFrom: number): LegData => {
        // Course calculation using simple geographic coordinates
        const originWpt = flightPlan.points[indexWptFrom];
        const destinationWpt = flightPlan.points[indexWptFrom + 1];
        
        // Convert to radians
        const lat1 = originWpt.lat * Math.PI / 180;
        const lon1 = originWpt.lon * Math.PI / 180;
        const lat2 = destinationWpt.lat * Math.PI / 180;
        const lon2 = destinationWpt.lon * Math.PI / 180;
        
        // Calculate bearing using the formula for initial bearing
        const dLon = lon2 - lon1;
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        const course = (bearing + flightPlan.declination + 360) % 360; // Normalize to 0-360

        // Distance calculation using Haversine formula
        const R = 6371000; // Earth's radius in meters
        const dLat = lat2 - lat1;
        const dLonRad = lon2 - lon1;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLonRad/2) * Math.sin(dLonRad/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const lengthMeters = R * c;

        // Wind calculations
        const windAngleRad = ((((originWpt.windDir + 180) % 360) - course + 360) % 360) * (Math.PI / 180)
        const tailComponent = originWpt.windSpeed * Math.cos(windAngleRad)
        const crossComponent = originWpt.windSpeed * Math.sin(windAngleRad)
        console.log("tailComponent", tailComponent, "crossComponent", crossComponent, "originWpt.windSpeed", originWpt.windSpeed)

        const groundSpeed = originWpt.tas + tailComponent
        const ete = Math.round(lengthMeters / 1852 / (groundSpeed / 3600))

        const legFuel = ete * (originWpt.fuelFlow / 3600)

        let heading = course - Math.asin(crossComponent / groundSpeed) * 180 / Math.PI;
        if (heading < 0) {
            heading += 360;
        }

        // ETA and EFR: need the previous turn point if it exists
        let initTimeSec = flightPlan.initTimeSec;
        let initEfr = flightPlan.initFob;
        if (indexWptFrom > 0) {
            const prevData = flightPlanUtils.calculateLegData(flightPlan, indexWptFrom - 1);
            initTimeSec = prevData.eta;
            initEfr = prevData.efr;
        }
        const eta = initTimeSec + ete;
        const efr = initEfr - legFuel;

        return {course: course, distance: lengthMeters / 1852, ete, legFuel, heading, eta, efr};
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
    }
}
