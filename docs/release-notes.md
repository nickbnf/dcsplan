# Release notes

## Leg geometry corrections (`fix-turn-inbound-bearing`)

These fixes change computed values on existing plans. Stored plan data is not modified.

- **Courses and headings now apply declination with the correct sign.** Declination is East-positive (`+6` = 6°E), and magnetic = true − declination. Previously the declination was added, so plans with a non-zero declination showed courses and headings off by twice the declination (for example 096° instead of 084° for a true course of 090° at 6°E).
- **Check your declination sign.** The Plan Parameters readout now shows the sign as well as the direction: `(+) 6.5°E`, `(−) 6.5°W`. If you entered a West value to compensate for the old behaviour, re-enter it as labelled. Saved declinations are not converted automatically.
- **Wind direction is true.** Waypoint winds are true directions (as in the DCS weather) and are now combined with the true course. Previously they were combined with the magnetic course, which rotated the wind by the declination. The sidebar labels the wind direction `°T`.
- **Turns join their legs smoothly.** Each turn now starts along the previous leg's ground track. Previously it started from the previous leg's magnetic, wind-corrected heading, leaving a corner at every turn point when declination or wind was set. Leg distances, ETE, and fuel after a turn change slightly.
- **Turns on regime-bound legs use the regime's TAS.** The turn radius and the heading's wind correction now use the bound regime's cruise TAS, the same value shown in the sidebar and used for ETE and fuel, instead of a stale stored TAS.
- **Heading wind correction uses TAS.** The wind correction angle is now `asin(crosswind / TAS)` (the standard wind triangle) instead of dividing by ground speed. The difference is usually under a degree.

Kneeboards and the in-app sidebar use the same corrected calculations.
