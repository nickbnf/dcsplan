import VectorSource from "ol/source/Vector";
import type { FlightPlan } from "../types/flightPlan";
import VectorLayer from "ol/layer/Vector";
import { Point, LineString } from "ol/geom";
import { Stroke, Style, Circle, Fill, Text, RegularShape } from "ol/style";
import Feature from "ol/Feature";
import { transform } from "ol/proj";
import { calculateAllLegDrawData, generateArcPoints } from "./legCalculations";

// Create a vector layer from the flight plan
// excludeWaypointIndex is the index of the waypoint to exclude (i.e. because it is being dragged)
export const createFlightPlanLayer = (flightPlan: FlightPlan, projection: any, navigationMode: string, excludedWaypointIndex?: number) => {
    const source = new VectorSource();
    
    // Add point features for turn points
    flightPlan.points.forEach((point, index) => {
        if (excludedWaypointIndex === undefined || index !== excludedWaypointIndex) {
            const [x, y] = transform([point.lon, point.lat], 'EPSG:4326', projection.getCode());
            const feature = new Feature({
                geometry: new Point([x, y]),
                type: 'turnpoint',
                waypointIndex: index,
                waypointName: point.name || `WP${index + 1}`,
                waypointType: point.waypointType || 'normal'
            });
            source.addFeature(feature);
        }
    });

    // Calculate all leg data once (sequential calculation)
    const legDrawData = calculateAllLegDrawData(flightPlan, projection, navigationMode);

    // Add line features for every pair of points in the flight plan
    // Skip lines that involve the excluded waypoint
    if (Array.isArray(flightPlan.points) && flightPlan.points.length > 1) {
        for (let i = 0; i < flightPlan.points.length - 1; i++) {
            // Skip this line if it involves the excluded waypoint
            if (excludedWaypointIndex !== undefined && 
                (i === excludedWaypointIndex || i + 1 === excludedWaypointIndex)) {
                continue;
            }
            
            const leg = legDrawData[i];

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
                    projection,
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
                const wpType = feature.get('waypointType') || 'normal';
                const turnpointNumber = (waypointIndex !== undefined ? waypointIndex + 1 : '').toString();
                const labelText = `${turnpointNumber}. ${waypointName}`;

                const styles = [];

                // Shape depends on waypoint type
                if (wpType === 'ip') {
                    // Square
                    styles.push(new Style({
                        image: new RegularShape({
                            points: 4,
                            radius: 14,
                            angle: Math.PI / 4,
                            stroke: new Stroke({ color: '#0066CC', width: 2 })
                        })
                    }));
                } else if (wpType === 'tgt') {
                    // Triangle
                    styles.push(new Style({
                        image: new RegularShape({
                            points: 3,
                            radius: 14,
                            stroke: new Stroke({ color: '#0066CC', width: 2 })
                        })
                    }));
                } else {
                    // Normal and Push: circle
                    styles.push(new Style({
                        image: new Circle({
                            radius: 12,
                            stroke: new Stroke({ color: '#0066CC', width: 2 })
                        })
                    }));
                }

                // Center dot (all types)
                styles.push(new Style({
                    image: new Circle({
                        radius: 1,
                        fill: new Fill({ color: '#0066CC' })
                    })
                }));

                // Turnpoint number and name label
                styles.push(new Style({
                    text: new Text({
                        text: labelText,
                        offsetX: 20,
                        offsetY: 0,
                        textAlign: 'left',
                        textBaseline: 'middle',
                        fill: new Fill({ color: '#0066CC' }),
                        stroke: new Stroke({
                            color: '#ffffff',
                            width: 3
                        }),
                        font: 'bold 14px sans-serif'
                    })
                }));

                // Push: additional "PUSH" label below the symbol
                if (wpType === 'push') {
                    styles.push(new Style({
                        text: new Text({
                            text: 'PUSH',
                            offsetX: 0,
                            offsetY: 24,
                            textAlign: 'center',
                            textBaseline: 'top',
                            fill: new Fill({ color: '#0066CC' }),
                            stroke: new Stroke({
                                color: '#ffffff',
                                width: 3
                            }),
                            font: 'bold 12px sans-serif'
                        })
                    }));
                }

                return styles;
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