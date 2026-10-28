# Spec: Map Georeference

## Purpose

Ties each map's tile image to the earth: a map declares its projection and the projected position and scale of its image, those values are fitted from recorded control points at preparation time, and every map view and the kneeboard place geographic positions on the image identically and within a checked accuracy.

This capability is tier-independent: maps are static application configuration and render the same way for anonymous and signed-in users.

## Requirements

### Requirement: Map georeference is expressed in projected coordinates
Every map SHALL declare its georeference as a CRS definition, the projected coordinates of the outer top-left corner of its image at native resolution, a single resolution in projected units per native pixel for both axes, and the native image size in pixels. A map SHALL NOT be georeferenced from geographic corner coordinates.

#### Scenario: Map config with a projected georeference
- **WHEN** a map config declares a CRS, an origin in projected metres, a resolution and the native image size
- **THEN** the map is offered by its theatre and renders in the planner, the Library page and the kneeboard

#### Scenario: Map config missing its georeference
- **WHEN** a map config lacks the CRS, the origin, the resolution or the native image size
- **THEN** the configuration check fails and names the map and the missing fields

---

### Requirement: One CRS definition shared by every map view
The CRS a map declares SHALL be the only definition of that map's projection. The planner map, the Library page map and the kneeboard SHALL all project positions with it, and any CRS that can be expressed as a proj definition SHALL be supported, including transverse Mercator, Mercator and Lambert conformal conic.

#### Scenario: Lambert conformal conic map on the kneeboard
- **WHEN** a map declares a Lambert conformal conic CRS and a kneeboard is generated with it
- **THEN** the leg and overview pages are rendered with that map's imagery and no unsupported-projection error occurs

#### Scenario: Same pixel in every view
- **WHEN** the same geographic position is placed on a map in the planner, on the Library page and on a kneeboard page
- **THEN** all three place it on the same pixel of the map image, to within 0.5 pixel at the zoom level displayed

---

### Requirement: Every zoom level follows the native georeference
The tile grid at each zoom level SHALL share the map's origin and SHALL use the native resolution scaled by the ratio of the native image width to that level's width in pixels. A geographic position SHALL fall on the same image feature at every zoom level.

#### Scenario: Position stable across zoom levels
- **WHEN** a waypoint placed over a feature of the map image is viewed at each available zoom level
- **THEN** it stays over the same feature, to within one pixel of that zoom level

---

### Requirement: Map extent and bounds are computed from the georeference
A map's projected extent, its centre and its geographic bounds SHALL be computed from its georeference and native image size wherever they are needed. The geographic bounds SHALL be the smallest latitude/longitude box enclosing the whole image. The map config SHALL NOT store them.

#### Scenario: Bounds enclose the image
- **WHEN** a map view computes the geographic bounds of a map whose image straddles its projection's central meridian
- **THEN** every point of the image outline, projected back to latitude/longitude, lies within the bounds, and the northernmost bound is taken where the top edge crosses the central meridian, not at a corner

#### Scenario: Extent matches the image
- **WHEN** a map view opens a map
- **THEN** the projected extent it uses is exactly the image's outer edges, from `origin_x`, `origin_y`, `resolution` and the native image size

---

### Requirement: Control points record where the georeference comes from
A map config SHALL record its control points, each with a position in native image pixels, a latitude, a longitude and an optional label. Pixel positions SHALL be measured from the top-left corner of the image, so the centre of the top-left pixel is at (0.5, 0.5). Control points SHALL be kept in the map config after fitting.

#### Scenario: Control points survive a refit
- **WHEN** a map's georeference is fitted from its control points
- **THEN** the map config still lists the same control points with their positions and labels

---

### Requirement: Control point coordinates accept the DCS notation
A control point's latitude and longitude SHALL each be given either in decimal degrees or as degrees and decimal minutes with a hemisphere letter, as DCS shows them, and SHALL be kept in the map config in the form entered.

#### Scenario: Control point entered in degrees and decimal minutes
- **WHEN** a control point's latitude is given as `N 41°55.678'` and its longitude as `E 041°51.234'`
- **THEN** it is fitted and checked at latitude 41 + 55.678/60 and longitude 41 + 51.234/60 degrees, and the map config keeps the strings as entered

#### Scenario: Ambiguous control point coordinate
- **WHEN** a control point's latitude is a string without a hemisphere letter, with a longitude hemisphere letter, or with 60 or more minutes
- **THEN** the fitting tool and the configuration check reject it and name the control point

---

### Requirement: Shipped maps carry enough control points
Every map offered by a theatre SHALL list at least three control points, spread so that they do not all lie on a single straight line in the image.

#### Scenario: Too few control points
- **WHEN** a map offered by a theatre lists fewer than three control points
- **THEN** the configuration check fails and names the map

#### Scenario: Collinear control points
- **WHEN** all of a map's control points lie on one straight line in the image
- **THEN** the configuration check fails and names the map

---

### Requirement: Shipped maps meet the alignment tolerance
For every map offered by a theatre, each control point projected with the map's declared georeference SHALL land within the map's alignment tolerance of its recorded pixel position. The alignment tolerance SHALL be 2 native pixels unless the map config sets a larger one, which is meant for an image drawn from real-world data while its control points are DCS positions.

#### Scenario: Map within tolerance
- **WHEN** the configuration check runs on a map without its own tolerance whose control points all land within 2 native pixels of their recorded positions
- **THEN** the check passes for that map

#### Scenario: Map with its own tolerance
- **WHEN** a map config sets an alignment tolerance of 12 native pixels and its control points all land within 12 native pixels of their recorded positions
- **THEN** the configuration check and the fitting tool accept that map

#### Scenario: Hand-edited origin
- **WHEN** a map's origin is edited by hand so that a control point lands 3 native pixels from its recorded position
- **THEN** the configuration check fails and names the map, the control point and its error in pixels

---

### Requirement: Georeference is fitted from control points at preparation time
The map preparation tooling SHALL compute a map's origin and resolution from its CRS and control points by least squares, and SHALL write them into the map config, keeping every other field. The running service SHALL NOT fit or modify a georeference.

#### Scenario: Fitting a map
- **WHEN** the maintainer runs the fitting tool on a map with a CRS and at least three control points
- **THEN** the map config is updated with the fitted origin and resolution, and all other fields are unchanged

#### Scenario: Fitting without enough points
- **WHEN** the fitting tool is run on a map with fewer than three control points, or with collinear points
- **THEN** the tool exits with an error and leaves the map config unchanged

---

### Requirement: Fitting reports its accuracy
The fitting tool SHALL report each control point's error in native pixels, the RMS error, and how much a fit allowing rotation and separate horizontal and vertical scales would reduce the RMS error, together with the rotation and scale ratio that fit implies.

#### Scenario: Residual report
- **WHEN** the fitting tool completes
- **THEN** it prints each control point's label and error in pixels, the RMS error, and the rotation-and-scale diagnostic

#### Scenario: Image does not fit the declared CRS
- **WHEN** a map's control points do not fit a north-up, square-pixel image in its declared CRS
- **THEN** the report shows a large RMS error that the rotation-and-scale fit reduces markedly, and states the implied rotation and scale ratio

---

### Requirement: Fitting refuses to write an out-of-tolerance result
The fitting tool SHALL NOT update the map config when any control point's error exceeds the alignment tolerance, unless the maintainer explicitly overrides it. A dry run SHALL report the fit without writing.

#### Scenario: Out-of-tolerance fit
- **WHEN** the fitted georeference leaves a control point 5 native pixels from its recorded position and no override is given
- **THEN** the tool reports the fit, exits with an error and leaves the map config unchanged

#### Scenario: Dry run
- **WHEN** the fitting tool is run in dry-run mode
- **THEN** it prints the fit and its report and leaves the map config unchanged

---

### Requirement: Tiling and georeferencing are independent
Generating tiles SHALL NOT change a map's georeference or control points, and refitting a georeference SHALL NOT require regenerating tiles. Tile generation SHALL record the native image size and SHALL list the georeference fields still missing from the map config.

#### Scenario: Re-tiling keeps the georeference
- **WHEN** tiles are regenerated for a map with a different maximum zoom
- **THEN** the map's CRS, origin, resolution and control points are unchanged and the map still meets the alignment tolerance

#### Scenario: New map after tiling
- **WHEN** tiles are generated for a map that has no georeference yet
- **THEN** the native image size is written to the map config and the tool lists the CRS, origin, resolution and control points as still to be provided
