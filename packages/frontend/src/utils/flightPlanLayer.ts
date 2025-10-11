import VectorSource from "ol/source/Vector";
import type { FlightPlan } from "../types/flightPlan";
import VectorLayer from "ol/layer/Vector";
import { Point, LineString } from "ol/geom";
import { Stroke, Style, Circle, Fill } from "ol/style";
import Feature from "ol/Feature";
import { transform } from "ol/proj";

// Create a vector layer from the flight plan
export const createFlightPlanLayer = (flightPlan: FlightPlan, projection: any) => {
    const source = new VectorSource();
    
    // Add point features for turn points
    flightPlan.points.forEach((point) => {
        const [x, y] = transform([point.lon, point.lat], 'EPSG:4326', projection.getCode());
        const feature = new Feature({
            geometry: new Point([x, y]),
            type: 'turnpoint'
        });
        source.addFeature(feature);
    });

    // Add line features for flight plan lines
    flightPlan.lines.forEach((line) => {
        const startCoord = transform([line.start.lon, line.start.lat], 'EPSG:4326', projection.getCode());
        const endCoord = transform([line.end.lon, line.end.lat], 'EPSG:4326', projection.getCode());
        
        const feature = new Feature({
            geometry: new LineString([startCoord, endCoord]),
            type: 'flightline'
        });
        source.addFeature(feature);
    });

    return new VectorLayer({
        source,
        style: (feature) => {
            const featureType = feature.get('type');
            
            if (featureType === 'turnpoint') {
                return new Style({
                    image: new Circle({
                        radius: 6,
                        fill: new Fill({ color: 'red' }),
                        stroke: new Stroke({ color: 'white', width: 2 })
                    })
                });
            } else if (featureType === 'flightline') {
                return new Style({
                    stroke: new Stroke({
                        color: 'blue',
                        width: 3,
                        lineDash: [5, 5]
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