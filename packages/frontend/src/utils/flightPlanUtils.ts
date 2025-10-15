import type { FlightPlan, LegData } from "../types/flightPlan";

const defaultTas = 400;
const defaultAlt = 3000;

// A bunch of functions to manipulate the flight plan
export const flightPlanUtils = {
    newFlightPlan: (): FlightPlan => {
        return { points: [] };
    },
    addTurnPoint: (flightPlan: FlightPlan, lat: number, lon: number): FlightPlan => {
        const tas = flightPlan.points.length > 0 ? flightPlan.points[flightPlan.points.length - 1].tas : defaultTas;
        const alt = flightPlan.points.length > 0 ? flightPlan.points[flightPlan.points.length - 1].alt : defaultAlt;

        return { ...flightPlan, points: [...flightPlan.points, { lat, lon, tas, alt }] };
    },
    moveTurnPoint: (flightPlan: FlightPlan, index: number, lat: number, lon: number): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { lat, lon, tas: newPoints[index].tas, alt: newPoints[index].alt };

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
        const course = (bearing + 360) % 360; // Normalize to 0-360

        // Distance calculation using Haversine formula
        const R = 6371000; // Earth's radius in meters
        const dLat = lat2 - lat1;
        const dLonRad = lon2 - lon1;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLonRad/2) * Math.sin(dLonRad/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const lengthMeters = R * c;

        console.log("Distance:", lengthMeters);

        return {course: course, distance: lengthMeters / 1852}; // Convert to nautical miles
    }
}
