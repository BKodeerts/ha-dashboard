# Handoff: Home Assistant dashboard — adaptive layout + view pass (v8)

> **v8 = v7 + four Instellingen changes.** If v7 is already implemented, only do these:
> 1. **Settings moves into the tab bar** as the 4th tab (cog icon). The cog in the header is removed. See §1 Tab bar.
> 2. **"Wie ben jij" section removed.** The current user still comes from the HA account; the UI just doesn't show it.
> 3. **Thema and Kleuren rows removed from Overig.** The dashboard follows the HA theme. Overig = Weer · Opslag.
> 4. **Kioskmodus toggle** (new "Scherm" section) and a **tint picker popover** instead of cycling. See §4.

## Overview
A delta on top of the shipped **v5 "Adem"** implementation in `BKodeerts/ha-dashboard` (`main`). It does two things:

1. **One fluid shell for phone → desktop.** The dashboard measures its own width and adapts: room-grid columns, how sheets open, and which views split into two columns. It stays one layout, not a separate desktop version.
2. **A pass over every view.** The Auto tab is removed. Energie, Netwerk, Instellingen and the Weer sheet are reworked, and the self-consumption figure is split into two correctly named ratios computed from HA statistics.

Everything not mentioned here (header, tile anatomy, room sheet, HA wiring, theming) stays as in v5/v6.

## About the design files
The files in this bundle are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code. Recreate them in the existing codebase (React + TS, `src/ui/styles.css`, the `Icon` set in `src/ui/icons.ts`) using its patterns: the BEM-ish class names, CSS custom properties (`--page`, `--card`, `--accent-glyph`, `--warn-fg`…), and hooks like `useLongPress`. Do not ship the HTML.

`Dashboard Adaptief.dc.html` is the source of truth. Open `Home Dashboard.dc.html` to see it side by side at 1020 / 780 / 390 px (Turn 6) and each view on desktop and phone (Turn 7, ids `7a`–`7d`).

## Fidelity
**High fidelity.** Colours, type, radii and spacing are final and already match v5's tokens. The data shown (devices, people, weather, kWh) is example data; wire it to the real selectors.

---

## 1. Adaptive shell

### Width source
Measure the **dashboard's own root element** with a `ResizeObserver`, not `window.innerWidth`. The card lives inside HA's Lovelace layout, where the viewport is the wrong box. Until the first measurement arrives, render the **narrow** layout.

> In the prototype this took three tries: a template `ref` that never attached, then a retry that gave up and fell back to `window.innerWidth`. A real React `ref` on the card root plus a `ResizeObserver` in `useLayoutEffect` is all you need. Just don't fall back to the window.

### Breakpoints (container width `w`)
| | `< 700` | `700 – 999` | `≥ 1000` |
| --- | --- | --- | --- |
| Room-grid columns | 2 | 3 | 4 |
| Room sheet / weather sheet | bottom sheet | bottom sheet | centred modal |
| Tab bar shadow | none | none | `0 14px 30px -18px rgba(17,19,24,0.4)` |

Two-column views switch on at **`w ≥ 760`**: Energie, Netwerk, Instellingen. The Instellingen sort list also switches from arrows to drag at 760.

### Column
- Content column: `max-width: 820px; margin: 0 auto`, with a 16 px gutter inside. That means `box-sizing: border-box` on the column wrapper. Without it, `width:100%` + padding overflows by 32 px, which happened in the prototype.
- The header (three rows) follows the same 820 px column; its background stays full-bleed.

### Room grid
- Collapsed: tiles share the remaining height (`grid-auto-rows: minmax(128px, 1fr)`), capped at **160 px per row**. Implement the cap as `max-height: rows × 160 + (rows − 1) × 12` on the grid. Without the cap, tiles become 300 px+ slabs on a large screen; without the 128 px minimum, a short viewport clips the humidity line. The grid scrolls if it doesn't fit.
- Expanded ("N meer" → "minder"): fixed 132 px rows, the grid is the scroller.
- The "N meer" fold is a normal grid cell (`1px dashed #d8d4cc`, radius 24).

### Room tile changes (vs v6)
- **Glyph column is top-aligned**: the light bulb plus any window/AC glyphs sit in a vertical column, absolutely positioned `top:12px; right:12px`. It does not take part in the flex layout, so it can never push the tile taller or clip at the bottom edge. The name gets `padding-right:44px` so it ellipsizes before the column.
- **AC glyph has no setpoint text**: just the snowflake (cool) glyph in `--cool`. The "23°" next to it was removed as clutter.
- Name top, temperature (28 px) + humidity (mono 10 px) bottom, `justify-content: space-between`, padding `20px 18px`.

### Sheets on desktop (`w ≥ 1000`)
- Scrim `rgba(17,19,24,0.28)`, content centred with 32 px padding. Enter animation `scale(0.97) → 1` + fade, 160 ms ease.
- Room sheet `max-width: 460px`. Weather sheet `max-width: 680px` (see §5).
- Below 1000: unchanged bottom sheet (`translateY(101%) → 0`, 280 ms `cubic-bezier(0.2,0.9,0.2,1)`), 8 px side inset, sits above the tab bar.

### Tab bar
- **Four tabs**: Home · Energie · Netwerk · Instellingen (`mdiCog`, no tone, no dot). **Auto is removed** (§6).
- The header cog button is **removed**; the alarm button and the person chip keep their places.
- Instellingen stays reachable in kiosk mode, since the tab bar is part of the card, not HA chrome. That's how you switch kiosk mode off again.
- Unchanged look (dark `#111318` bar, light active pill, 64 px tall, 22 px radius), `max-width` reduced from 420 → **340 px**, still bottom-centred at every width.

---

## 2. Energie (`7a`)

### Layout
- `w ≥ 760`: grid `minmax(0,1.5fr) minmax(0,1fr)`, gap 12, `align-items:start`. Left column: *Zon · nu* card, then the device-trend card. Right column: the device list.
- `< 760`: one column, in that order. The list lands directly under the trend chart it explains.
- Chart height: 168 px at `≥ 1000`, 116 px below. Trend chart: 76 px / 56 px.

### Two ratios instead of "64% eigen verbruik"
The old single bar is replaced by a 2-column row under the chart, separated by `border-top:1px solid #ece9e3`, padding `14px 0 16px`, gap 16:

| Number | Key (mono 10, uppercase, `#57544e`) | Sub (mono 10, `#8a877f`) | Bar fill / track |
| --- | --- | --- | --- |
| **64%** (20 px, weight 400, −0.03em) | `uit zon` | `van je verbruik · vandaag` | `oklch(0.72 0.13 60)` / `oklch(0.68 0.13 250 / 0.18)` (grid blue) |
| **58%** | `zelf gebruikt` | `van je zonnestroom · vandaag` | `oklch(0.72 0.13 60)` / `oklch(0.70 0.12 150 / 0.22)` (export green) |

Bar: 5 px tall, radius 3.

**Why:** the old label said "eigen verbruik", but `selfConsumptionRatio` actually computes *self-sufficiency* (`Σ min(solar, consumption) ÷ Σ consumption`), and from estimated power buckets. Both ratios are now computed exactly from HA's own long-term statistics:

1. `energy/get_prefs` → `energy_sources`: for `type: "grid"` take every `flow_from[].stat_energy_from` (import) and `flow_to[].stat_energy_to` (export); for `type: "solar"` take `stat_energy_from`.
2. `recorder/statistics_during_period` with `start_time` = today 00:00 local, `period: "day"`, `types: ["change"]`, `statistic_ids` = those ids.
3. Sum `change` per role → `solar`, `import`, `export` (kWh). There can be several meters/inverters.
4. `uit zon = 1 − import ÷ (solar + import − export)`; `zelf gebruikt = (solar − export) ÷ solar`.
5. If `solar` is 0 or a meter is missing, hide the number (don't show 0%).

Refresh every 5 min like `fetchDayBuckets`. These match HA's own Energy dashboard gauges exactly. `selfConsumptionRatio` can be deleted; `deriveConsumptionSeries` is still needed for the consumption line in the chart.

Example in the design: solar 14.2 · import 4.6 · export 6.0 kWh → consumption 12.8 → 64% / 58%.

### Device list = legend
- The separate legend row in the trend card is **removed**. The trend card header becomes: left `Vandaag per apparaat` (mono 10, uppercase, `#8a877f`); right a hint (mono 10) that reads `tik een apparaat` in `#a8a49c`, or `<naam> · piek 3,4 kW` in the selected device's colour.
- "Apparaten nu" rows: 48 px min-height, padding `0 10px`, radius 14. Each row has a 10 px dot in the device colour (`deviceColor(i)`, same as its trend line), the name (14 px), and the live value (`mono 13`, `N W`). The rows have no separators.
- `overige (niet gemeten)` gets a hollow dot (`inset 0 0 0 1.5px #b4afa5`), text `#57544e`, and isn't tappable; it has no line.
- **Tap a device → highlight.** That line: `stroke-width 2.2`, opacity 1, drawn last (on top). Other lines: opacity 0.14. The row gets `background:#eae7e0`; the other rows' text goes to `#a8a49c` / `#b4afa5`. Tap again to clear. With nothing selected, lines keep today's `1.4` / `0.75`. Long-press still opens more-info (`useLongPress`).
- State: `selectedDevice: entityId | null`, local to `EnergyView`.

---

## 3. Netwerk (`7b`)

- Title `Stille apparaten` (22 px / 500) + sub (mono 11, uppercase, `#8a877f`): `N apparaten stil`.
- **Grouped by area**: one card per area, ordered by that area's oldest silence. Card: `#fbfaf7`, radius 24, padding `14px 16px 4px 20px`, with a **4 px left spine in the area's tint**, like the room tiles. Header: area name (15/500) + count (mono 10, `#a8a49c`, `1 apparaat` / `N apparaten`).
- Rows: 52 px min, `border-top:1px solid #ece9e3`. Name (14 px, ellipsis). Meta line (mono 10): battery glyph (12 px) + `batterij N%`, or `netstroom` without a glyph. Right-hand badge: 26 px tall, radius 13, mono 11. Silences ≥ 48 h show as `N d`, shorter ones as `N u`.
- **Amber rules** (`--warn-fg` text, `oklch(0.72 0.14 60 / 0.2)` bg):
  - badge amber when silent **> 48 h** (unchanged);
  - meta line amber when **battery < 15%**, even if the device is still under 48 h. A flat battery is usually *why* a device goes silent, so it gets flagged before that happens.
- `w ≥ 760`: two columns via **CSS multi-column** (`column-count: 2; column-gap: 12px`; cards `break-inside: avoid; margin-bottom: 12px`), not a grid. A grid leaves a gap next to a short card when its row-mate is taller.
- Footer (mono 10, `#a8a49c`): `amber = meer dan 48 u stil, of batterij onder 15%`.

---

## 4. Instellingen (4th tab — screenshots `8a`, `8b`)

- `w ≥ 760`: two columns `1fr 1fr`, gap 24. **Left**: Wie volg je bovenaan · Scherm · Overig · reset. **Right**: Kamers sorteren.
- `< 760`: one column in that order.
- Section labels: mono 11, uppercase, 0.1em, `#8a877f`. Notes: mono 10, `#a8a49c`.
- **"Tints per kamer" is removed as a separate section.** The tint swatch sits in each sort row: an 18 px circle in a 40×44 hit area.
- **Tint picker (new in v8, replaces cycling).** Tapping the swatch opens a popover anchored under it (`position:absolute; top:42px; right:-4px; z-index:6`): `#fbfaf7`, radius 18, padding 10, shadow `0 10px 30px rgba(17,19,24,0.16), 0 0 0 1px #ece9e3`. Content: a 4-column grid of the 8 `TINT_CYCLE` colours, 32 px cells (22 px dot), gap 6. The current tint gets `inset 0 0 0 1.5px #111318`; the open swatch in the row gets a ring `0 0 0 3px #fbfaf7, 0 0 0 4.5px #111318`.
  - Pick → writes `areaTint` and closes. Tap the swatch again → closes.
  - **Tapping anywhere outside closes it**: a capture-phase `pointerdown` listener on `document` while open, ignoring events inside the picker wrapper. Switching tabs also closes it.
  - Only one picker open at a time (`tintPicker: areaId | null`, local to `SettingsView`).
  - Footer note: `tik de stip om een tint te kiezen · ster = op home`.
- Sort row (52 px, radius 16, `#fbfaf7`): [grip, desktop only] · name (14/500) + `area.id` (mono 10) · tint swatch · star (`--accent-glyph` when favourite, `#c7c3ba` otherwise) · [▲▼ 36×44, phone only; disabled = `#d8d4cc`].
- The list is split under two labels: favourites first, then `Niet op home`. Moving stays **within a group** (same rule as v5's `canMove`). Toggling the star moves the room across.
- **Desktop (`≥ 760`) drag to reorder**: the row is `draggable`, with a 16 px 6-dot grip (`#b4afa5`, `cursor:grab`). The row reorders live on `dragover`, only over rows of the same group. While dragging, the dragged row is `#eae7e0` at opacity 0.55. Persist on drop/dragend via `updateConfig({ roomOrder })`. Keep the arrows on phone: HTML5 drag doesn't work on touch, and the arrows are the accessible path.
- Header hint (desktop only): `sleep om te sorteren`.
- "Wie volg je": radio rows 52 px. The dot is a 16 px ring, `inset 0 0 0 1.5px #c7c3ba` off / `5px #111318` on; the selected row gets `#fbfaf7`. Same radio-not-checkbox rule as v5.
- **Scherm (new)**: one `#fbfaf7` row (radius 18, 56 px): `Kioskmodus` (14/500) + `input_boolean.kiosk_mode` (mono 10), switch on the right: 44×26 track, `#d6d2ca` off / `#111318` on, 20 px `#fbfaf7` knob at `left:3px` / `21px`, 160 ms transition. Whole row is the hit area. Note below (mono 10): off `verbergt HA-balk en zijmenu op dit scherm`, on `HA-balk en zijmenu verborgen · deze tab blijft bereikbaar`.
  - Wiring: read state from `hass.states['input_boolean.kiosk_mode']`; toggle with `input_boolean.toggle`. Make the entity id configurable (`config.kioskEntity`, default `input_boolean.kiosk_mode`); hide the section if the entity doesn't exist.
  - The dashboard doesn't hide HA chrome itself. The kiosk-mode plugin (HACS) does, via YAML:
    ```yaml
    kiosk_mode:
      entity_settings:
        - entity:
            input_boolean.kiosk_mode: 'on'
          hide_header: true
          hide_sidebar: true
    ```
  - The boolean is global, so it affects every screen. `?disable_km` in the URL is the escape hatch.
- **"Wie ben jij" is removed** (v8). Keep resolving the current user from `hass.user` for anything that needs it.
- "Overig" rows: Weer · Opslag in one `#fbfaf7` card (radius 18), 54 px rows, 1 px `#ece9e3` separators, chevron-right `#b4afa5`. Panels expand as in v5.

---

## 5. Weer sheet on desktop (`7d`)

- `w ≥ 1000`: centred modal **max-width 680 px**. Body under the tabs is a grid `minmax(0,1.35fr) minmax(0,1fr)`, gap 16: **chart left, metrics right**.
- `< 1000`: unchanged bottom sheet, chart above metrics.
- Metrics: 2-column grid, gap 6. Each metric is a small card (`#fbfaf7`, radius 14, padding `10px 12px`): key mono 10 uppercase `#8a877f`, value 14 px.
- Tabs `Komende 24u` / `Week`: segmented on `#eae7e0`, 4 px inset, 36 px options, radius 12, active option `#fbfaf7`.
- Chart geometry, week view and data are unchanged from `WeatherSheet.tsx`. Only the container width and the side-by-side arrangement are new.

---

## 6. Auto tab — removed
`CarView` only rendered a title and one line. Delete the tab, its `TabBar` entry and the `config.car` settings UI. The laadpaal is already an Energie load. Keep `config.car` readable for now if other code uses it.

---

## Design tokens used (all existing in v5)
- Surfaces: page `#f0eeea`, card `#fbfaf7`, sheet `#f6f4f0`, control `#eae7e0` / `#e6e3dc`, divider `#ece9e3`, border `#e2dfd8`, dashed `#d8d4cc`
- Ink: `#111318`, `#3b3934`, `#57544e`, `#6e6b64`, `#8a877f`, `#a8a49c`, idle glyph `#b4afa5`
- Accent: solar/amber `oklch(0.72 0.13 60)`, accent glyph `oklch(0.58 0.14 60)`, warn fg `oklch(0.45 0.11 60)`, warn bg `oklch(0.72 0.14 60 / 0.2)`, cool `oklch(0.52 0.12 250)`, export green `oklch(0.44 0.11 150)`
- Type: Space Grotesk (UI), IBM Plex Mono (labels, numbers-with-units)
- Radii: tile / card 24, sheet 28, list row 16, metric / device row 14, pill 18–22
- Grid gap 12, gutter 16, column max 820

## Files
- `Dashboard Adaptief.dc.html`: the adaptive shell with all views; **source of truth**. Props `tab` (`home|energie|netwerk|meer`), `sheet` (`none|kamer|weer`), `dev` (preselected device) open it in a given state.
- `Home Dashboard.dc.html`: the canvas. Turn 7 = every view at 1020 + 390 px; Turn 6 = the shell at 1020 / 780 / 390; Turn 5 = the two explored desktop directions (5b chosen).
- `support.js`: runtime needed to open the `.dc.html` files in a browser.
- `screenshots/8a-instellingen-desktop.png`, `8b-tintkiezer-desktop.png`: v8 Instellingen (Scherm section, 4-tab bar, open tint picker). Other views: open `Dashboard Adaptief.dc.html` at any width.
- See also `../design_handoff_ha_energy_tab/README.md` (Energie tab origin, updated with the statistics section).

## Repo files this touches
`src/app/App.tsx` (width measurement, breakpoints) · `src/components/RoomGrid.tsx`, `RoomTile.tsx` · `src/components/TabBar.tsx` (4th tab) · `src/components/Header.tsx` (remove cog) · `src/components/Sheet.tsx` (modal mode) · `src/components/views/EnergyView.tsx` · `src/ha/energyChart.ts` (drop `selfConsumptionRatio`) · new `src/ha/energyStats.ts` (statistics fetch) · `src/components/views/NetworkView.tsx` · `src/components/views/SettingsView.tsx` · `src/components/sheets/WeatherSheet.tsx` · remove `src/components/views/CarView.tsx` · `src/ui/styles.css`
