# Handoff: Weer-popup (weather sheet)

## Overview
Redesign of the weather popup in the Home Assistant dashboard. Replaces the old sheet
(four-day strip, one static line of attributes) with a two-tab card:

- **Vandaag** — 24-hour graph: temperature line, dashed apparent-temperature line,
  precipitation bars (mm), a "now" marker, plus a 3x3 grid of the attributes the HA
  weather entity actually exposes.
- **Week** — seven daily rows with min/max range bars on one shared scale, plus
  precipitation probability and mm per day, and two summary chips.

Same component in two containers: bottom sheet on phone, centered dialog on tablet/desktop.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the
intended look and behavior, not production code to copy. The task is to **recreate them in
the target codebase** (this project ships as React + TypeScript: `BKodeerts/ha-dashboard`,
`src/components/sheets/WeatherSheet.tsx`) using its existing patterns: `Sheet`/`SheetClose`,
`Icon`, `src/ui/styles.css` class names, and the `ha/selectors` formatters
(`formatNumber`, `formatPlain`, `formatTemp`, `isNumber`). Do not port inline styles —
the prototype uses them because the design tool requires it; the app uses `styles.css`.

## Fidelity
**High-fidelity.** Colors, typography, spacing and chart geometry are final. Numbers shown are
sample data in KMI style; all of it must come from the real entity + `weather.get_forecasts`.

## Data source (HA 2026.8)
Current conditions from the `weather.*` entity state + attributes:
`temperature`, `apparent_temperature`, `dew_point`, `humidity`, `pressure`,
`wind_speed`, `wind_gust_speed`, `wind_bearing`, `cloud_coverage`, `uv_index`,
`visibility`, and the unit attributes (`temperature_unit`, `pressure_unit`,
`wind_speed_unit`, `visibility_unit`, `precipitation_unit`).

Forecasts are **not** attributes — call the service
`weather.get_forecasts` with `type: hourly` (Vandaag tab) and `type: daily` (Week tab),
gated on `supported_features` (`WeatherEntityFeature.FORECAST_HOURLY` = 2,
`FORECAST_DAILY` = 1, `FORECAST_TWICE_DAILY` = 4). If hourly is unsupported, hide the
Vandaag tab and open on Week. Forecast items carry: `datetime`, `condition`,
`temperature`, `templow`, `precipitation`, `precipitation_probability`,
`apparent_temperature`, `dew_point`, `humidity`, `wind_speed`, `wind_gust_speed`,
`wind_bearing`, `cloud_coverage`, `pressure`, `uv_index`, `is_daytime`.
Every field is optional — omit the metric tile / dashed line when `isNumber()` is false.

## Screens / Views

### 1. Sheet header (both tabs)
- Row, `align-items:center`, `gap:12px`.
- Icon tile 34x34, radius 11, `rgba(255,255,255,0.07)`, glyph 19px at `rgba(240,238,234,0.7)`,
  MDI condition icon (existing `weatherIcon(condition)` map).
- Title: entity friendly name, 19px / 500 / `-0.015em`, line-height 1.1.
  Sub-line 3px below: IBM Plex Mono 10px, `letter-spacing .07em`, `rgba(240,238,234,0.35)` —
  `"<entity_id> · bijgewerkt HH:MM"` (from `last_updated`).
- Close: 34x34 circle, `rgba(255,255,255,0.08)`, 15px glyph at `rgba(240,238,234,0.6)`.

### 2. Now block
- Row, `align-items:flex-end`, `gap:14px`.
- Big temperature: 56px / 400 / `-0.04em`, line-height 0.86, one decimal (`formatTemp(t,1)`).
- Middle column (`padding-bottom:5px`, gap 4): condition label 14px / 500 /
  `rgba(240,238,234,0.8)`; below it Mono 11px `rgba(240,238,234,0.4)`:
  `"voelt als 15,2° · 78 % rv"`.
- Right column, right-aligned: today's `hi° / lo°` 15px / 500; below it Mono 10px in
  `oklch(0.7 0.1 250)` with the next-rain note (`"regen vanaf 17 u"`) — derived from the first
  hourly entry with `precipitation > 0`; render nothing when the day is dry.

### 3. Tab switch
Container `rgba(255,255,255,0.05)`, radius 11, padding 4, gap 4; two equal buttons,
`padding:7px 0`, radius 8, Mono 10px `letter-spacing .12em` uppercase.
Selected: background `rgba(255,255,255,0.11)`, text `#f0eeea`. Idle: transparent,
`rgba(240,238,234,0.45)`. Labels "Vandaag" / "Week".

### 4. Vandaag — chart
Legend row above the chart: Mono 8.5px `letter-spacing .1em` uppercase
`rgba(240,238,234,0.35)`, three items (gap 14): 14x2 bar in `oklch(0.78 0.13 60)`
"temperatuur"; 14px 2px dashed `rgba(240,238,234,0.45)` "voelt als"; 7x9 bar radius 2 in
`oklch(0.68 0.1 250)` "neerslag mm".

SVG `viewBox="0 0 350 138"`, `width:100%; height:auto` (so viewBox units scale; never a fixed
pixel height with a viewBox). Geometry in viewBox units:
- Plot x: `x0 = 30`, `x1 = 344`; `x(i) = x0 + i * (x1 - x0) / (n - 1)`, n = 24 hourly points.
- Temperature y band: top 8, bottom 88; domain rounded outward from the day's min/max
  (prototype: 13°–26°). `y(t) = 88 - (t - tMin) / (tMax - tMin) * 80`.
- Rain baseline y = 122, bars grow upward, max height 32 for the day's max mm
  (prototype scale 1.5 mm), width 10 centered on `x(i)`.
- Draw order: gridlines, rain bars, now-line, apparent line, temp area, temp line, now dot.
- Gridlines: two dashed horizontals at the two round temperatures (20°, 15°) + the rain
  baseline. `stroke rgba(240,238,234,0.09)`, width 1, `dasharray 2 4`.
- Rain bars: fill `oklch(0.68 0.1 250)`, opacity 0.85.
- Now line: vertical from y 8 to 122 at the current hour, `rgba(240,238,234,0.3)`, width 1.
- Apparent line: `rgba(240,238,234,0.4)`, width 1.5, `dasharray 3 3`, round caps.
- Temp area: same path closed to the baseline, fill `oklch(0.78 0.13 60)` opacity 0.1.
- Temp line: `oklch(0.78 0.13 60)`, width 2.25, round cap/join.
- Now dot: r 4, fill `oklch(0.78 0.13 60)`, stroke `#1b1e24` width 2.

Axis labels ("20°", "15°") are HTML absolutely positioned over the chart at
`top: y(t) / 138 * 100%` with `translateY(-50%)`, `left:0`, Mono 9px
`rgba(240,238,234,0.3)` — percentages, not px, so they track the scaling SVG.

Hour ticks: relative row, height 12; each label absolutely positioned at
`left: x(i) / 350 * 100%` with `translateX(-50%)`, Mono 9px `letter-spacing .08em`,
`rgba(240,238,234,0.3)`, every 3rd hour (8 labels), format `"07u"`.
Do not use `justify-content:space-between` — the ticks must sit on the data points.

### 5. Vandaag — metrics
`grid-template-columns:repeat(3,1fr)`, gap 8. Tile: radius 12,
`rgba(255,255,255,0.04)`, `padding:9px 10px`, gap 4. Key: Mono 8.5px
`letter-spacing .09em` uppercase `rgba(240,238,234,0.35)`. Value: 14px / 500 / `-0.02em`.
Order: voelt als, dauwpunt, vochtigheid, wind (speed + bearing), windstoten, druk,
uv-index (+ qualitative word), bewolking, zicht. Units from the entity's unit attributes;
comma decimal separator (nl-BE).

### 6. Week
Header row: Mono 8.5px `letter-spacing .09em` uppercase `rgba(240,238,234,0.3)`,
padding `0 2px 6px` — "dag", spacer 20px, the shared scale label (`"13° — 27°"`), and
"neerslag" right-aligned in 58px.
Day row: `padding:8px 2px`, `border-top:1px solid rgba(255,255,255,0.05)`, gap 10:
1. Day code, width 30, Mono 11px `letter-spacing .08em`; today `#f0eeea`, others
   `rgba(240,238,234,0.5)`. From `toLocaleDateString('nl-BE',{weekday:'short'})`, uppercased.
2. Condition icon 20px, `rgba(240,238,234,0.55)`.
3. `templow`, width 26, right-aligned, Mono 11px `rgba(240,238,234,0.4)`.
4. Range track: `flex:1`, height 6, radius 3, `rgba(255,255,255,0.07)`. Segment positioned
   `left:(lo-min)/(max-min)`, `width:(hi-lo)/(max-min)`, radius 3,
   `linear-gradient(90deg, oklch(0.62 0.11 250), oklch(0.78 0.13 60))`.
   min/max = week min − 1 / week max + 1, shared by all rows.
5. `temperature`, width 34, 15px / 500 / `-0.02em`.
6. Precipitation, width 58, right-aligned, Mono 10px: `"70 % · 2,6 mm"`, or `"—"` when dry.
   Colour `oklch(0.72 0.1 250)` at probability >= 60 %, else `rgba(240,238,234,0.35)`.

Below the rows (margin-top 12), two chips in a row (gap 8), same tile styling as the metric
tiles but value 13px / 500 / `rgba(240,238,234,0.85)`: "natste dag", "warmste dag" —
computed from the daily forecast.

### 7. Footer
Mono 9.5px `letter-spacing .08em` uppercase `rgba(240,238,234,0.22)`, centered:
`"forecast_hourly · 24 uur"` / `"forecast_daily · 7 dagen"` per tab.

### 8. Containers
- **Phone**: bottom sheet, full width, `border-radius:32px 32px 44px 44px`,
  `padding:20px 20px 30px`, background `#1b1e24`, text `#f0eeea`, column gap 16.
  Scrim `rgba(10,11,14,0.55)` + `backdrop-filter:blur(3px)`; tap scrim or close to dismiss.
  Enter: `translateY(101%) -> 0` over 0.28s `cubic-bezier(0.2,0.9,0.2,1)`; scrim fades in
  0.18s ease.
- **Tablet/desktop**: same card centered, width 420, radius 28,
  `box-shadow:0 40px 80px -20px rgba(10,11,14,0.6)`, scrim `rgba(10,11,14,0.5)` + blur 3px.
  Only the container changes.

## Interactions & Behavior
- Opened from the temperature in the dashboard header (and from Meer > Weer).
- Tab switch is local state; no refetch if forecasts are already subscribed.
- Close: close button, scrim tap, Escape. Focus trap + `aria-labelledby` as in the
  existing `Sheet`.
- Sheet height is content-driven; both tabs land within ~20px of each other, so the sheet
  does not visibly jump. Keep it that way if you add rows.
- No hover states on the sheet itself (touch-first); the two tabs and the close button use
  the existing pressed-state pattern.
- Chart is static — no tooltip, no pan. Reading is via the axis labels and the now marker.

## State Management
- `view: 'dag' | 'week'` (local; default 'dag', or 'week' when hourly is unsupported).
- `open` for the sheet, owned by the dashboard as today.
- Forecast subscriptions: hourly (24 items from the current hour) and daily (7 items);
  refresh on entity update. Cache per entity so tab switching costs nothing.
- Empty/error: if a forecast call fails, keep the now block + metrics and replace the graph or
  rows with the existing empty-state line rather than an empty axis.

## Design Tokens
- Sheet background `#1b1e24`; text `#f0eeea`.
- Text alphas on dark: 0.85 / 0.8 / 0.55 / 0.45 / 0.4 / 0.35 / 0.3 / 0.22.
- Surfaces: `rgba(255,255,255,0.04)` tiles, `0.05` tab track, `0.07` icon tile /
  range track, `0.08` close button, `0.11` active tab.
- Warm accent (temperature): `oklch(0.78 0.13 60)`.
- Cool accent (rain): `oklch(0.68 0.1 250)`; text variants `oklch(0.7 0.1 250)`,
  `oklch(0.72 0.1 250)`; range gradient start `oklch(0.62 0.11 250)`.
- Scrim `rgba(10,11,14,0.55)` (phone) / `rgba(10,11,14,0.5)` (desktop), blur 3px.
- Radii: 3, 8, 11, 12, 20, 28, 32/44 (sheet top/bottom).
- Spacing: 4, 8, 10, 12, 14, 16, 20 (sheet gap 16, tile padding 9-11).
- Type: Space Grotesk 400/500 for values and labels; IBM Plex Mono 400/500 for keys,
  units and axis text. Sizes: 56 / 19 / 15 / 14 / 13 (Grotesk), 11 / 10 / 9.5 / 9 / 8.5 (Mono).
- Numbers: nl-BE, comma decimal; temperature one decimal in the now block, integers elsewhere.

## Assets
No images. Icons are MDI paths already in `src/ui/icons.ts`
(`weather-cloudy`, `weather-partly-cloudy`, `weather-pouring`, `weather-sunny`, close).
Fonts are the two the dashboard already loads.

## Files
- `Weer Sheet.dc.html` — the popup itself (both tabs, chart geometry in the logic class).
- `Weer Popup In Context.dc.html` — 4a phone bottom sheet, 4b desktop dialog.
- `Home Dashboard.dc.html` — turn 3 dashboard; 3b opens the sheet from the header temperature.
- `support.js` — runtime for the HTML prototypes; not part of the design.
Open the `.dc.html` files in a browser to interact with them.
