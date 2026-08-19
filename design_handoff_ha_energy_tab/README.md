# Handoff: Home Assistant dashboard — Energy tab (solar + consumption)

## Overview
Redesign of the "Energie" tab in the Home dashboard app. Shows live solar production vs. home
consumption vs. grid flow, a today-view chart of solar generation and household consumption,
a self-consumption ratio, per-device consumption trend lines, and a live wattage list of
currently-drawing devices.

## About the design files
The files in this bundle are **design references built in HTML** — prototypes showing intended
look, layout, and behavior. They are not production code to copy directly. The task is to
recreate this design in the target codebase's existing environment (e.g. the Home Assistant
frontend / Lovelace custom card stack, or whatever app framework this dashboard actually runs
on) using its established patterns, components, and data bindings — not by embedding this HTML.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and layout are final-intent. Data shown (kWh,
W, device names) is illustrative placeholder data — wire it to real Home Assistant entities per
the Data Source section below.

## Screen: Energie tab
Third tab in the app's bottom tab bar (Home / Energie / Netwerk / Auto), within
`Home Dashboard.dc.html`. Scrollable column, `padding: 20px 20px 102px` (bottom padding clears
the tab bar), `gap: 16px` between the three stacked cards.

### 1. Solar / now card
Card: background `#fbfaf7`, border `1px solid #e2dfd8`, border-radius `20px`, padding
`16px 16px 4px`.

- **Header row** (flex, space-between):
  - Left: label "Zon · nu" (IBM Plex Mono, 10px, uppercase, letter-spacing 0.08em, color
    `#8a877f`) above the live solar wattage, 28px, weight 400, letter-spacing -0.03em, unit
    "W" in 11px mono `#a8a49c`.
  - Right, right-aligned, two lines: "`{home_w}` W huis" and "`{net_w}` W `{naar net|van net}`"
    (11px mono; the net line's number is colored green `oklch(0.44 0.11 150)` when exporting,
    blue `oklch(0.42 0.12 250)` when importing; labels in `#a8a49c`).
- **Today chart** (SVG, viewBox `0 0 280 92`, `preserveAspectRatio="none"`, rendered height
  112px): solar production as a filled area (`oklch(0.72 0.13 60 / 0.16)` fill) + line
  (`oklch(0.62 0.14 60)`, 1.6px stroke) over 24 hourly samples; household consumption as a
  thinner line (`#b4afa5`, 1.3px) on the same axes. A dashed vertical "now" marker
  (`#c7c3ba`, 1px, dash 2,3) plus a solid dot (`oklch(0.58 0.14 60)`, r=2.6) mark the current
  time on the solar curve.
  - Hour axis labels below the chart: 00u / 06u / 12u / 18u / 24u, 9px mono, `#b4afa5`.
- **Self-consumption bar**: thin track (`oklch(0.68 0.13 250 / 0.16)`, height 5px, radius 3px)
  filled with solar color to the self-consumption %, plus a trailing label
  "`{pct}`% eigen verbruik" (10px mono, `#6e6b64`).

### 2. Device trend card
Card: same background/border/radius as above, padding `16px`, `gap: 12px`.

- **Legend row**: one dot (8px circle) + label per device, wrapped flex row, 14px gap. Device
  colors: boiler `oklch(0.68 0.14 30)`, wasmachine `oklch(0.66 0.12 200)`, droogkast
  `oklch(0.74 0.07 90)`, laadpaal `oklch(0.62 0.11 300)`.
- **Trend chart**: SVG, viewBox `0 0 280 44`, rendered height 50px — one line per device
  (1.4px stroke, matching legend color), each independently normalized to its own daily max
  (small-multiples style, not a shared y-axis).

### 3. "Apparaten nu" (devices now) list
No card background — a plain list under an uppercase section label (11px mono, `#8a877f`).
Each row: `padding: 12px 2px`, `border-top: 1px solid #e2dfd8` (i.e. dividers between rows,
none above the first). Row content: a 18px outline "power" glyph (stroke `oklch(0.60 0.11 250)`,
1.6px), device name (14px, `#111318`, flex:1), live wattage right-aligned (13px mono,
`#3b3934`, e.g. "1.180 W"). Sorted descending by current wattage.

## Interactions & behavior
- Purely presentational in this prototype — no taps wired. In production, tapping a device row
  should plausibly open that device's detail/history (matching the pattern used by room cards
  elsewhere in this app).
- All numbers format with `nl-BE` locale (comma decimal separator, period thousands separator).
- Flow direction (import vs. export) drives both the arrow direction and color between the solar
  → home → grid nodes conceptually; in this final version that's expressed via the "naar net" /
  "van net" label and color on the top-right stat, not a separate flow diagram.

## Data source (Home Assistant)
Intended to be backed by the Home Assistant **Energy dashboard** config, i.e. the same
`energy/get_prefs` sources: solar production sensor(s), grid import/export sensors, and any
individual device sensors set up under "Individual devices" in that config. Concretely:
- Solar now (W) + today curve → solar production sensor, 5-min/hourly statistics for the curve.
- Home now (W) + today total → total home consumption (or computed from grid + solar).
- Grid import/export (W now, kWh today) → grid consumption/return sensors.
- Self-consumption % → `(solar_today − exported_today) / consumption_today`.
- Device trend lines + "apparaten nu" list → the individual device power/energy sensors
  configured in the Energy dashboard's device list. This prototype hardcodes 4 devices
  (boiler, wasmachine, droogkast, laadpaal) — in production, drive this list from however many
  devices are actually configured, not a fixed 4.
- No battery storage in this iteration (per product decision — home has no battery).
- No cost (€) — energy units only, per product decision.

## Design tokens
- Card background: `#fbfaf7`. Card border: `#e2dfd8`, 1px. Card radius: `20px`.
- Track/background fill (bars): `#e2dfd8`.
- Solar accent: `oklch(0.72 0.13 60)` (fills/bars), `oklch(0.62 0.14 60)` / `oklch(0.58 0.14 60)`
  (line/dot).
- Grid export (surplus) accent: `oklch(0.44 0.11 150)`. Grid import accent: `oklch(0.42 0.12 250)`.
- Consumption line: `#b4afa5`. Muted labels: `#8a877f` / `#a8a49c` / `#b4afa5` / `#6e6b64`.
- Primary text: `#111318` / `#3b3934`.
- Typography: system default sans for values/labels; **IBM Plex Mono** for all-caps section
  labels, units, and numeric readouts (10–11px, letter-spacing 0.04–0.1em).
- Spacing: 16px between cards, 12–16px card padding, 8–14px internal gaps.

## Assets
No image assets. One inline SVG "power" glyph on the devices-now rows (see markup). No icon
font/library dependency beyond what's already used elsewhere in the app (Material-style path
data for other tabs).

## Files
- `Home Dashboard.dc.html` — full app; the Energie tab template lives in the `v2Energie`
  conditional block; supporting chart-data/logic (`ENERGY_SERIES`, `seriesLinePath`,
  `seriesAreaPath`, `energyFlow`, `chart`, `deviceLegend`, `energyDevicesNow` computations) is
  in the component's `renderVals()`.
