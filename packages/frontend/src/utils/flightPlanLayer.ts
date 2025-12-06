import VectorSource from "ol/source/Vector";
import type { FlightPlan } from "../types/flightPlan";
import VectorLayer from "ol/layer/Vector";
import { Point, LineString } from "ol/geom";
import { Stroke, Style, Circle, Fill, Text } from "ol/style";
import Feature from "ol/Feature";
import { transform } from "ol/proj";
import { calculateAllLegData, generateArcPoints } from "./legCalculations";

// Create a vector layer from the flight plan
// excludeWaypointIndex is the index of the waypoint to exclude (i.e. because it is being dragged)
export const createFlightPlanLayer = (flightPlan: FlightPlan, projection: any, excludedWaypointIndex?: number) => {
    const source = new VectorSource();
    
    // Add point features for turn points
    flightPlan.points.forEach((point, index) => {
        if (excludedWaypointIndex === undefined || index !== excludedWaypointIndex) {
            const [x, y] = transform([point.lon, point.lat], 'EPSG:4326', projection.getCode());
            const feature = new Feature({
                geometry: new Point([x, y]),
                type: 'turnpoint',
                waypointIndex: index,
                waypointName: point.name || `WP${index + 1}`
            });
            source.addFeature(feature);
        }
    });

    // Calculate all leg data once (sequential calculation)
    const legData = calculateAllLegData(flightPlan);

    // Add line features for every pair of points in the flight plan
    // Skip lines that involve the excluded waypoint
    if (Array.isArray(flightPlan.points) && flightPlan.points.length > 1) {
        for (let i = 0; i < flightPlan.points.length - 1; i++) {
            // Skip this line if it involves the excluded waypoint
            if (excludedWaypointIndex !== undefined && 
                (i === excludedWaypointIndex || i + 1 === excludedWaypointIndex)) {
                continue;
            }
            
            const leg = legData[i];
            if (!leg) {
                // Fallback to straight line if leg data is missing
                const start = flightPlan.points[i];
                const end = flightPlan.points[i + 1];
                const startCoord = transform([start.lon, start.lat], 'EPSG:4326', projection.getCode());
                const endCoord = transform([end.lon, end.lat], 'EPSG:4326', projection.getCode());

                const feature = new Feature({
                    geometry: new LineString([startCoord, endCoord]),
                    type: 'flightline',
                    startIndex: i,
                    endIndex: i + 1
                });
                source.addFeature(feature);
                continue;
            }

            // Build coordinates array: arc from origin to straightening point, then line to destination
            const coordinates: number[][] = [];

            // Generate arc points if this is not the first leg and we have a valid turn center
            if (i > 0 && leg.turnCenterLat !== 0 && leg.turnCenterLon !== 0) {
                // Generate arc points from origin to straightening point
                const arcPoints = generateArcPoints(
                    leg.turnCenterLat,
                    leg.turnCenterLon,
                    leg.turnRadiusM,
                    leg.originLat,
                    leg.originLon,
                    leg.straighteningLat,
                    leg.straighteningLon,
                    leg.turnDirection,
                    30
                );

                // Transform arc points to map projection and add to coordinates
                // The arc points already include both origin and straightening point
                arcPoints.forEach(([lat, lon]) => {
                    const [x, y] = transform([lon, lat], 'EPSG:4326', projection.getCode());
                    coordinates.push([x, y]);
                });
            } else {
                // First leg or no turn: start with origin point, then add straightening point
                const [ox, oy] = transform([leg.originLon, leg.originLat], 'EPSG:4326', projection.getCode());
                coordinates.push([ox, oy]);
                const [sx, sy] = transform([leg.straighteningLon, leg.straighteningLat], 'EPSG:4326', projection.getCode());
                coordinates.push([sx, sy]);
            }

            // Add destination point
            const [dx, dy] = transform([leg.destinationLon, leg.destinationLat], 'EPSG:4326', projection.getCode());
            coordinates.push([dx, dy]);

            const feature = new Feature({
                geometry: new LineString(coordinates),
                type: 'flightline',
                startIndex: i,
                endIndex: i + 1
            });
            source.addFeature(feature);
        }
    }

    return new VectorLayer({
        source,
        style: (feature, _resolution) => {
            const featureType = feature.get('type');
            
            if (featureType === 'turnpoint') {
                const waypointIndex = feature.get('waypointIndex');
                const waypointName = feature.get('waypointName') || `WP${waypointIndex !== undefined ? waypointIndex + 1 : ''}`;
                const turnpointNumber = (waypointIndex !== undefined ? waypointIndex + 1 : '').toString();
                const labelText = `${turnpointNumber}. ${waypointName}`;
                
                return [
                    // Outer circle
                    new Style({
                        image: new Circle({
                            radius: 12,
                            stroke: new Stroke({ color: '#0066CC', width: 2 })
                        })
                    }),
                    // Center dot
                    new Style({
                        image: new Circle({
                            radius: 1,
                            fill: new Fill({ color: '#0066CC' })
                        })
                    }),
                    // Turnpoint number and name label
                    new Style({
                        text: new Text({
                            text: labelText,
                            offsetX: 20, // Position to the right of the turnpoint
                            offsetY: 0,
                            textAlign: 'left', // Left-align the text
                            textBaseline: 'middle', // Vertically center the text
                            fill: new Fill({ color: '#0066CC' }),
                            stroke: new Stroke({ 
                                color: '#ffffff', 
                                width: 3 
                            }),
                            font: 'bold 14px sans-serif'
                        })
                    })
                ];
            } else if (featureType === 'flightline') {
                // Draw the arc+line geometry as-is (no shortening)
                return new Style({
                    stroke: new Stroke({
                        color: '#0066CC',
                        width: 2
                    })
                });
            }
            
            return new Style({
                stroke: new Stroke({
                    color: 'red',
                    width: 2
                })
            });
        }
    });
}