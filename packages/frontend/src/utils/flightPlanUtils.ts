import { getLength } from "ol/sphere";
import type { FlightPlan, LegData } from "../types/flightPlan";
import { LineString } from "ol/geom";

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
        const course = 152;
        const line = new LineString([[flightPlan.points[indexWptFrom].lon, flightPlan.points[indexWptFrom].lat], [flightPlan.points[indexWptFrom + 1].lon, flightPlan.points[indexWptFrom + 1].lat]]);
        const lengthMeters = getLength(line, {projection: 'EPSG:4326' })

        console.log("Distance:", lengthMeters);

        return {course: course, distance: lengthMeters / 1852};
    }
}
