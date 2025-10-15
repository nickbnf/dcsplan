import VectorSource from "ol/source/Vector";
import type { FlightPlan } from "../types/flightPlan";
import VectorLayer from "ol/layer/Vector";
import { Point, LineString } from "ol/geom";
import { Stroke, Style, Circle, Fill } from "ol/style";
import Feature from "ol/Feature";
import { transform } from "ol/proj";

// Create a vector layer from the flight plan
export const createFlightPlanLayer = (flightPlan: FlightPlan, projection: any, excludedWaypointIndex?: number) => {
    const source = new VectorSource();
    
    console.log('createFlightPlanLayer: excludedWaypointIndex', excludedWaypointIndex);

    // Add point features for turn points
    flightPlan.points.forEach((point, index) => {
        const [x, y] = transform([point.lon, point.lat], 'EPSG:4326', projection.getCode());
        const feature = new Feature({
            geometry: new Point([x, y]),
            type: 'turnpoint',
            waypointIndex: index
        });
        source.addFeature(feature);
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
                type: 'flightline'
            });
            source.addFeature(feature);
        }
    }

    return new VectorLayer({
        source,
        style: (feature) => {
            const featureType = feature.get('type');
            
            if (featureType === 'turnpoint') {
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
                    })
                ];
            } else if (featureType === 'flightline') {
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