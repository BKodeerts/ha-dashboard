# Handoff: Home Assistant dashboard — home screen, ruimere layout (v5 / option 4a)

## Overview
This bundle covers a layout revision of the Home Assistant mobile dashboard home screen. Everything in v4 (entities, controls, behaviour, HA wiring) stays as it was; what changes is spacing, hierarchy and how the room grid fills the screen. The v4 screen packed all content into the top half and left dead space above the tab bar. The revision spreads the same content over the full screen height.

The chosen direction is **option 4a ("Adem")**. Two rejected alternatives (4b list rows, 4c bottom-weighted) are in the same file for context — do not implement those.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. The task is to recreate them in the target environment (this dashboard is intended to run as a Home Assistant Lovelace view / custom card) using its established patterns. `HA_INTEGRATION.md` in this folder describes the entity wiring and is unchanged from v4.

## Fidelity
**High fidelity.** Colors, type, spacing and radii below are final and exact. Option 4a is interactive (tab switching, room expansion, a preview toggle); 4b and 4c are static mockups.

## Screens / Views

Device frame in all mockups: 390 × 844, radius 44px, background `#f0eeea`, text `#111318`.

### 4a — Home tab

Vertical stack, `display:flex; flex-direction:column`, full height.

1. **Top row** — `padding:52px 24px 0`, flex, `align-items:flex-start`, `gap:12px`.
   - Left: date, IBM Plex Mono 11px, `letter-spacing:0.12em`, uppercase, `#a8a49c`. Copy: "Woensdag 18 augustus".
   - Right: two 36×36 circular buttons, `background:#e6e3dc`, icon 17px `#57544e`, `gap:8px`. First is the alarm control (mdi shield-home), second the person chip (mdi account). Both keep their v4 behaviour — the alarm button still opens the Weg/Nacht/Uit picker and shows the pulsing amber dot during exit delay.
2. **Weather block** — `padding:30px 24px 0`, flex, `align-items:flex-end`, `gap:16px`.
   - Left column: temperature 56px / weight 400 / `letter-spacing:-0.045em` / `line-height:1` ("18,0°"), under it the range and condition in IBM Plex Mono 11px, `0.08em`, uppercase, `#8a877f` ("23° / 17° · BEWOLKT").
   - Right: weather glyph, **96×96**, fill `#c9c5bc`, `margin:0 -6px -8px 0` so it optically aligns to the right edge and sits on the temperature baseline. The icon is decorative at this size — keep it low-contrast, it must not compete with the number.
3. **Section row** — `padding:38px 24px 0`, flex, `align-items:center`, `min-height:44px`.
   - Left: section label, IBM Plex Mono 11px, `0.12em`, uppercase, `#8a877f` ("Kamers" on home, "Nu" on the power tab).
   - Right, only when something is open: **open-windows chip**. Height 38px, `padding:0 13px`, `border-radius:19px`, transparent background, `box-shadow:inset 0 0 0 1px oklch(0.84 0.05 45)`, text `#4a4842` 14px/500. Window icon 17px in `oklch(0.66 0.15 45)`, chevron 15px in `#a8a49c`. Clickable — opens the list of open windows/doors. Deliberately quiet: outline only, colour carried by the icon alone. When nothing is open the row is just a section header, no gap left behind.
4. **Room grid** — `flex:1`, `padding:18px 24px 110px`, two equal columns, `gap:16px`.
   - Collapsed: `grid-auto-rows:1fr`, container height 100%, `overflow:hidden`. Five favourite rooms + one "4 meer" tile = 6 cells filling the full remaining height. No scrolling in the resting state — this is the point of the revision.
   - Room card: `border-radius:24px`, `background:#fbfaf7`, no border, `padding:20px 18px`, `justify-content:space-between`. 4px full-height tint bar pinned left (per-room colour, see tokens). Name 15px/500 `-0.015em` at top. Bottom row: temperature 28px/400 `-0.035em` with humidity under it in IBM Plex Mono 10px `#a8a49c`; right side holds the status glyphs (16px) with `gap:10px`, plus the AC setpoint as IBM Plex Mono 10px `#6e6b64` left of the snowflake when the room has AC.
   - Glyph colours: light on `oklch(0.74 0.14 80)`, AC on `oklch(0.68 0.13 250)`, window open `oklch(0.62 0.16 40)`, inactive `#b4afa5`. Colour alone signals state — no chips, no fills.
   - "4 meer" tile: dashed `1px #d8d4cc`, radius 24px, IBM Plex Mono 10px `0.08em` uppercase `#a8a49c`, chevron-down 14px.
   - Expanded (tap "4 meer"): the four remaining rooms (Dressing, Waskot, Badkamer, Toilet) render as identical cards; grid switches to `grid-auto-rows:132px`, container height `auto`, `overflow-y:auto`. The tile becomes "minder" with a chevron-up and stays a normal grid cell — it fills the empty slot in the last row rather than spanning full width. Expansion is a rare action; the resting state stays calm.
5. **Tab bar** — unchanged from v4. Absolutely positioned, `padding:0 16px 22px`, bar 64px, radius 22px, `background:#fbfaf7`, `border:1px solid #e2dfd8`, four equal 52px items with radius 16px. Active item `background:#111318`, icon `#f0eeea`; inactive icon `#8a877f`. Icons 24px.

### 4a — Stroom (power) tab

Same top row and weather block persist (they are treated as screen-level, not home-only). Section label becomes "Nu"; the windows chip is hidden here.

Body: `padding:18px 24px 110px`, flex column, `gap:22px`.
- Two stat cards side by side, `gap:16px`, radius 24px, `background:#fbfaf7`, `padding:20px 18px`, internal `gap:14px`. Each: label (mono 10px `0.1em` uppercase `#8a877f`) + state icon 16px on one row; value 36px/400 `-0.04em` with unit "W" in mono 11px `#8a877f`; a 6px progress bar, track `#eae7e0`, radius 3px. Zon = 1168 W, fill `oklch(0.72 0.13 60)` at 78%. Huis = 252 W, fill `oklch(0.68 0.13 250)` at 17%.
- Net chip: same outline pattern as the windows chip but neutral — height 44px, `padding:0 16px`, radius 22px, `box-shadow:inset 0 0 0 1px #dcd8d0`, text `#3b3934` 15px/500, bolt icon 17px in `oklch(0.66 0.13 150)`. Copy: "916 W naar het net".
- Consumer rows: name 16px/500 `-0.015em` left, value IBM Plex Mono 14px `#3b3934` right, `padding:14px 0`, `border-bottom:1px solid #e2dfd8`. Warmtepomp 104 W, Airco Clara 62 W, Wasmachine 0 W.
- Footer link pushed down with `margin-top:auto`: "Volledig energiedashboard" in mono 10px `0.08em` uppercase `#a8a49c` with a 14px chevron. Opens the full Lovelace energy dashboard.

### 4b / 4c — rejected
4b puts one room per full-width row with hairline separators and no card frames; 4c holds the top of the screen empty with a 64px temperature and anchors the room cards just above the tab bar. Both are in the file for reference only.

## Interactions & Behavior
- **Tab bar**: Home ↔ Stroom switch the body; the top row and weather block persist across both. Tabs 3 and 4 (netwerk, automatisering) are not part of this revision — keep v4 behaviour.
- **"4 meer" / "minder"**: toggles the four non-favourite rooms in place. Collapsed = no scroll; expanded = the grid scrolls with 132px rows.
- **Open-windows chip**: tap opens the list of open openings. Hidden entirely when the count is zero, and hidden on the power tab.
- **Room card**: tap opens the room (v4 behaviour); the glyphs in the card's right edge remain individually tappable with ~32px hit areas built from 8px padding around a 16px icon.
- No new animations. The v4 sheet (`sheetUp`, 0.28s `cubic-bezier(0.2,0.9,0.2,1)`), fade (`fadeIn` 0.18s) and alarm dot pulse are unchanged.

## State Management
- `tab`: `'home' | 'power'` — which body renders, which tab pill is dark, the section label, and whether the windows chip may show.
- `showOther`: boolean — room grid expansion; drives the extra cards, `grid-auto-rows` (`1fr` ↔ `132px`), container height (`100%` ↔ `auto`), `overflow-y` (`hidden` ↔ `auto`), and the tile's label/icon.
- `showWindows`: **preview-only** toggle in the mockup (the pill above the phone) so the with/without states can be compared. In production this is derived from the open-openings count, not a user setting.
- All entity data comes from Home Assistant as described in `HA_INTEGRATION.md`.

## Design Tokens
Colors
- Screen background `#f0eeea`; card `#fbfaf7`; hairline / border `#e2dfd8`; dashed border `#d8d4cc`; bar track `#eae7e0`; button fill `#e6e3dc`
- Text primary `#111318`; secondary `#4a4842` / `#3b3934`; muted `#8a877f`; faint `#a8a49c`; inactive glyph `#b4afa5`; decorative weather glyph `#c9c5bc`
- Active tab `#111318` on `#f0eeea`
- State: light on `oklch(0.74 0.14 80)`; AC / electric `oklch(0.68 0.13 250)`; alert / window open `oklch(0.62 0.16 40)`, chip outline `oklch(0.84 0.05 45)`, chip icon `oklch(0.66 0.15 45)`; solar `oklch(0.72 0.13 60)`; export green `oklch(0.66 0.13 150)`
- Room tints: Living `oklch(0.74 0.07 70)`, Bureau `oklch(0.74 0.07 55)`, Slaapkamer `oklch(0.62 0.10 300)`, Clara `oklch(0.72 0.11 350)`, Oliver `oklch(0.70 0.10 195)`, Dressing `oklch(0.76 0.06 95)`, Waskot `oklch(0.70 0.09 245)`, Badkamer `oklch(0.72 0.09 230)`, Toilet `oklch(0.74 0.08 215)`

Spacing — screen inset 24px (v4 used 20px); grid gap 16px; section row top 38px; weather block top 30px; grid top 18px; bottom padding 110px to clear the tab bar.

Typography — Space Grotesk 400/500/700 for UI, IBM Plex Mono 400/500 for labels, units and metadata. Scale: 56 / 36 / 28 / 17 / 16 / 15 / 14 (Grotesk) and 14 / 11 / 10 (Mono). Negative tracking on large numbers (`-0.045em` at 56px, `-0.04em` at 36px, `-0.035em` at 28px); mono labels are uppercase with `0.08em`–`0.12em`.

Radii — 44 phone, 24 card, 22 chip / tab bar, 19 small chip, 16 tab item, 3 progress bar. Tint bar 4px wide, full card height.

Shadows — none on cards (the revision drops v4's card borders and relies on the `#fbfaf7`-on-`#f0eeea` value step). Device shadow in the mockup only.

## Assets
Icons are Material Design Icons paths, inlined as SVG (weather-cloudy, shield-home, account, lightbulb, snowflake, radio, window-open, home, flash, wifi/network, tune, chevrons, check, star). No bitmap assets.

## Files
- `Home Ruimte Opties.dc.html` — the three layout options; **4a is the design to build**
- `Home Dashboard.dc.html` — the full v4 prototype (all tabs, sheets, settings) whose behaviour this revision inherits
- `support.js` — runtime for the two HTML files; not part of the design
- `HA_INTEGRATION.md` — entity mapping and Home Assistant wiring, unchanged from v4
