# Release notes

## Runway departures (`runway-departure`)

Plans without a runway compute and draw exactly as before.

- **Departure runway on the first waypoint.** The first waypoint card has a new "Rwy" field next to "Field alt". Enter the runway number (`09`, `27`): its magnetic heading is converted to true with the plan's declination. Leave it empty for the previous behaviour.
- **The first leg flies the departure.** With a runway set, leg 1 runs straight down the runway heading, turns at the plan's bank angle towards WP1 (the shorter way), then flies straight to WP1. The map, the sidebar, and the kneeboard leg and overview maps draw this path, and leg 1's distance, time, and fuel follow it.
- **Accelerating turns.** If the aircraft is still accelerating to climb speed during the turn, the turn widens as the speed builds up, and it tightens or widens again at top of climb.
- **Take-off and wind.** Take-off time and fuel from the performance profile are still counted as entered. The take-off now accelerates along a curve that reaches climb speed exactly at the profile's take-off distance. Wind is applied along the actual track: down the runway, through the turn, then on course to WP1.
- **Straight-out distance on the profile.** The Performance page has a new "Straight out" field (NM, default 2) on the General performance line: the distance from brake release before turning on course. Performance files without it import with 2 NM.
- **Unreachable WP1.** If WP1 is closer than the straight-out distance, or inside the departure turn, leg 1 shows `⚠ Fix` and is computed as if no runway were set.

## Leg geometry corrections (`fix-turn-inbound-bearing`)

These fixes change computed values on existing plans. Stored plan data is not modified.

- **Courses and headings now apply declination with the correct sign.** Declination is East-positive (`+6` = 6°E), and magnetic = true − declination. Previously the declination was added, so plans with a non-zero declination showed courses and headings off by twice the declination (for example 096° instead of 084° for a true course of 090° at 6°E).
- **Check your declination sign.** The Plan Parameters readout now shows the sign as well as the direction: `(+) 6.5°E`, `(−) 6.5°W`. If you entered a West value to compensate for the old behaviour, re-enter it as labelled. Saved declinations are not converted automatically.
- **Wind direction is true.** Waypoint winds are true directions (as in the DCS weather) and are now combined with the true course. Previously they were combined with the magnetic course, which rotated the wind by the declination. The sidebar labels the wind direction `°T`.
- **Turns join their legs smoothly.** Each turn now starts along the previous leg's ground track. Previously it started from the previous leg's magnetic, wind-corrected heading, leaving a corner at every turn point when declination or wind was set. Leg distances, ETE, and fuel after a turn change slightly.
- **Turns on regime-bound legs use the regime's TAS.** The turn radius and the heading's wind correction now use the bound regime's cruise TAS, the same value shown in the sidebar and used for ETE and fuel, instead of a stale stored TAS.
- **Heading wind correction uses TAS.** The wind correction angle is now `asin(crosswind / TAS)` (the standard wind triangle) instead of dividing by ground speed. The difference is usually under a degree.

Kneeboards and the in-app sidebar use the same corrected calculations.
