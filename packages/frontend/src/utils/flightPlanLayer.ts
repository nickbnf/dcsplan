import VectorSource from "ol/source/Vector";
import type { FlightPlan } from "../types/flightPlan";
import VectorLayer from "ol/layer/Vector";
import { Point, LineString } from "ol/geom";
import { Stroke, Style, Circle, Fill, Text } from "ol/style";
import Feature from "ol/Feature";
import { transform } from "ol/proj";

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

    // Add line features for every pair of points in the flight plan
    // Skip lines that involve the excluded waypoint
    if (Array.isArray(flightPlan.points) && flightPlan.points.length > 1) {
        for (let i = 0; i < flightPlan.points.length - 1; i++) {
            // Skip this line if it involves the excluded waypoint
            if (excludedWaypointIndex !== undefined && 
                (i === excludedWaypointIndex || i + 1 === excludedWaypointIndex)) {
                continue;
            }
            
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
        }
    }

    return new VectorLayer({
        source,
        style: (feature, resolution) => {
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
                // Shorten the line so it stops at the circle edge (radius 12 pixels)
                const geometry = feature.getGeometry();
                if (geometry instanceof LineString && resolution) {
                    // Convert 12 pixels to map units
                    const circleRadiusInMapUnits = 12 * resolution;
                    
                    const coordinates = geometry.getCoordinates();
                    if (coordinates.length >= 2) {
                        const [startX, startY] = coordinates[0];
                        const [endX, endY] = coordinates[coordinates.length - 1];
                        
                        // Calculate direction vector
                        const dx = endX - startX;
                        const dy = endY - startY;
                        const length = Math.sqrt(dx * dx + dy * dy);
                        
                        if (length > 0) {
                            // Normalize direction vector
                            const dxNorm = dx / length;
                            const dyNorm = dy / length;
                            
                            // Shorten from both ends by circle radius
                            const shortenedStartX = startX + dxNorm * circleRadiusInMapUnits;
                            const shortenedStartY = startY + dyNorm * circleRadiusInMapUnits;
                            const shortenedEndX = endX - dxNorm * circleRadiusInMapUnits;
                            const shortenedEndY = endY - dyNorm * circleRadiusInMapUnits;
                            
                            // Only shorten if the shortened line would still have positive length
                            if (length > 2 * circleRadiusInMapUnits) {
                                return new Style({
                                    geometry: new LineString([[shortenedStartX, shortenedStartY], [shortenedEndX, shortenedEndY]]),
                                    stroke: new Stroke({
                                        color: '#0066CC',
                                        width: 2
                                    })
                                });
                            }
                        }
                    }
                }
                
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