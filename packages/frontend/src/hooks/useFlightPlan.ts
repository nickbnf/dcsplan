import { useState } from "react";

type FlightPlanTurnPoint = {
    lat: number;
    lon: number;
}

type FlightPlanLeg = {
    start: FlightPlanTurnPoint;
    end: FlightPlanTurnPoint;
}

export const useFlightPlan = (flightPlan: FlightPlanLeg[]) => {
    const [flightPlanLines, setFlightPlanLines] = useState<FlightPlanLeg[]>(flightPlan);

    const addTurnPoint = (turnPoint: FlightPlanTurnPoint) => {
        setFlightPlanLines([...flightPlanLines, { start: flightPlanLines[flightPlanLines.length - 1].end, end: turnPoint }]);
        console.log("Flight plan lines:", flightPlanLines);
    };

    return { flightPlanLines, addTurnPoint };
}