import type { FlightPlan, FlightPlanTurnPoint } from "../types/flightPlan";

// A bunch of functions to manipulate the flight plan
export const flightPlanUtils = {
    newFlightPlan: (): FlightPlan => {
        return { points: [], lines: [] };
    },
    addTurnPoint: (flightPlan: FlightPlan, lat: number, lon: number): FlightPlan => {
        return { ...flightPlan, points: [...flightPlan.points, { lat, lon }] };
    },
    addLine: (flightPlan: FlightPlan, start: FlightPlanTurnPoint, end: FlightPlanTurnPoint): FlightPlan => {
        return { ...flightPlan, lines: [...flightPlan.lines, { start, end }] };
    },
    moveTurnPoint: (flightPlan: FlightPlan, index: number, lat: number, lon: number): FlightPlan => {
        const newPoints = [...flightPlan.points];
        newPoints[index] = { lat, lon };
        return { ...flightPlan, points: newPoints };
    },
    deleteTurnPoint: (flightPlan: FlightPlan, index: number): FlightPlan => {
        return { ...flightPlan, points: flightPlan.points.filter((_, i) => i !== index) };
    },
    deleteLine: (flightPlan: FlightPlan, index: number): FlightPlan => {
        return { ...flightPlan, lines: flightPlan.lines.filter((_, i) => i !== index) };
    }
}
