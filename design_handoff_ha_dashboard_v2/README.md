# Handoff: HA Dashboard — v2 home screen

## Overview
v2 of the Home Assistant phone dashboard (`BKodeerts/ha-dashboard`). v1 shipped and was rejected on
UX grounds; this package specifies the corrected home screen, room card, tab structure, network view
and settings panel. It replaces the v1 handoff for everything it covers; `HA_INTEGRATION.md` (the
WebSocket/area-registry/service-call layer) is unchanged and still authoritative.

Target: phone, one hand, portrait, 390 × 844. Colour scheme follows Home Assistant's light/dark
setting; this prototype shows the light scheme.

## About the design files
`Home Dashboard.dc.html` is a **design reference written in HTML** — an interactive prototype of the
intended look and behaviour, not production code. Recreate it in the existing React + TypeScript +
Vite app using that codebase's components and patterns (`src/components/*`, `src/ha/*`,
`src/ui/styles.css`). Do not port the prototype's inline styles or its mock state; wire the real
selectors that already exist.

The file also contains two earlier turns of exploration below the v2 section — **only the top section
(badge `3b`) is the specification**. Everything below it is historical.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and hit targets are final. Match them.

## What changed from the shipped version

| v1 (rejected) | v2 |
| --- | --- |
| 5 tabs; `Stroom` opened a modal instead of a view | 4 tabs, each a real view: Home, Energie, Netwerk, Auto |
| Bottom bar could be covered by a sheet | Bar always visible and tappable; sheets stop 96px above the bottom, and switching tab dismisses any sheet |
| Room card contained large Lovelace temp + humidity graphs | One reading line + a single 24 h temperature sparkline, no embeds |
| Lights on/off only | Per-lamp brightness in the room card, with non-dimmable lamps handled explicitly |
| 30px icon buttons nested in a tappable card | One 34px light chip; every other target ≥ 44px |
| State written as text ("AC uit", "radio uit") | Coloured state icons, read at a glance |
| Favourites/others fold | All rooms in one scroll, favourites first, order user-defined |
| Settings hidden behind a text link | Gear button next to "Kamers" |

## Screens / views

### 1. Home (tab `home`)
Purpose: see whether the house is safe and closed, and control lights without navigating.

Layout, top to bottom, in a 390 × 844 column:
1. **Weather block** — centred, `padding: 52px 20px 0`. Row of cloud icon (26px, `#57544e`) + gap
   10px + temperature `16.0°` at 30px/400, `letter-spacing:-0.03em`. Under it, 11px IBM Plex Mono
   uppercase `#8a877f`, `letter-spacing:0.06em`: `bewolkt · 23° / 17°`. Whole block taps to the
   weather sheet.
2. **Status pills** — `padding: 18px 20px 0`, flex wrap, gap 8px. Each pill height 46px, radius 23px,
   `padding: 0 16px`, icon 18px + label 14px/500. Three pills: alarm, openings, presence.
   - Attention state (alarm disarmed, anything open): bg `oklch(0.72 0.13 60 / 0.22)`, fg
     `oklch(0.45 0.11 60)`.
   - Presence home: bg `oklch(0.68 0.13 250 / 0.18)`, fg `oklch(0.42 0.12 250)`.
   - Calm: bg `#e6e3dc`, fg `#57544e`.
   - Labels: `Alarm uit` / `Alarm thuis` / `Alarm afwezig`; `Living raam 2` for one opening, `3 open`
     from two upward, `Alles dicht` when none; `Bart weg` / `Leen thuis` (the person shown is the one
     the user did *not* pick as themselves in settings).
3. **Section head** — `padding: 20px 14px 8px 20px`, `Kamers` in 11px mono uppercase `#8a877f`
   (`letter-spacing:0.1em`), and a 44px round gear button on the right (icon 19px, `#a8a49c`;
   hover bg `#e6e3dc`, fg `#57544e`) opening the settings view.
4. **Room grid** — scrollable, `padding: 0 20px 16px`, 2 columns, gap 10px. All nine rooms, favourites
   first, user order within each group.
5. **Tab bar** — see below.

**Room tile.** Radius 20px, bg `#fbfaf7`, border `1px solid #e2dfd8`, `overflow:hidden`,
`position:relative`.
- **Tint spine**: absolutely positioned, `left:0; top:0; bottom:0; width:5px`, the room's accent.
- **Tap area** (opens the room card): `padding: 13px 13px 11px 18px`, column, gap 4px.
  - Room name 15px/500, `letter-spacing:-0.015em`.
  - Reading row: temperature 24px/400 `letter-spacing:-0.035em` + humidity 10px mono `#8a877f`.
  - **Chip row**, gap 5px, `margin-top:2px`:
    - **Light chip** (tappable, toggles the room's lights, must not open the card): height 34px,
      `padding: 0 10px`, radius 10px, bulb icon 16px + 10px mono label. On: bg
      `oklch(0.72 0.13 60 / 0.5)`, fg `#241a00`, label = brightness (`62%`) or `aan` for
      non-dimmable rooms. Off: bg `#eae7e0`, fg `#57544e`, label `uit`.
    - **State chips** (read-only, no tap): height 26px, min-width 26px, `padding: 0 6px`, radius 8px,
      icon 15px, optional 10px mono note. Inactive is always rendered in the same slot so positions
      never move: bg `#e4e1da`, fg `#7d7a72`.
      - AC — colour by hvac mode, note = setpoint (`25°`), no note for fan:
        cool bg `oklch(0.68 0.13 250 / 0.18)` fg `oklch(0.42 0.12 250)`;
        heat `oklch(0.68 0.13 35 / 0.2)` / `oklch(0.45 0.13 35)`;
        dry `oklch(0.70 0.12 95 / 0.2)` / `oklch(0.44 0.11 95)`;
        fan_only `oklch(0.70 0.12 185 / 0.2)` / `oklch(0.42 0.09 185)`.
      - Radio — amber when playing: bg `oklch(0.72 0.13 60 / 0.22)`, fg `oklch(0.45 0.11 60)`.
      - Window — amber when an opening in that room is open.

### 2. Room card (sheet over Home)
Purpose: everything the tile can't hold. **No Lovelace embeds.**

Scrim `rgba(17,19,24,0.28)` over the whole phone at `z-index:1`; the tab-bar block sits at
`z-index:2` above it and stays tappable. Panel: `left:8px; right:8px; bottom:96px`, radius 28px, bg
`#f6f4f0`, border `1px solid #e2dfd8`, `padding: 18px 18px 20px`, gap 14px,
`max-height: calc(100% - 104px)`, `overflow-y:auto`,
`box-shadow: 0 -18px 44px -22px rgba(17,19,24,0.3)`. Enters with
`sheetUp 0.28s cubic-bezier(0.2,0.9,0.2,1)`; scrim `fadeIn 0.18s ease`. Dismiss: scrim tap, close
button, Escape, or switching tab.

Contents in order:
1. **Header** — 5 × 40px tint bar (radius 3px), room name 20px/500, second line 11px mono uppercase
   `#8a877f` = `24.2° · 61.9%`. 44px round close button (bg `#e6e3dc`, fg `#57544e`).
2. **24 h temperature line** — card bg `#fbfaf7`, border `1px solid #e2dfd8`, radius 16px,
   `padding: 12px 14px`. SVG `viewBox="0 0 100 24"`, `preserveAspectRatio="none"`, height 44px,
   polyline in the room tint, `stroke-width:1.6`, `vector-effect:non-scaling-stroke`, round joins.
   Series normalised so its min/max fill the box; the last point is the live reading. Right column,
   10px mono: high (`#57544e`), low, `24 u` (both `#a8a49c`). Source:
   `history/history_during_period`, ~28 points, cached 5 min.
3. **Per-lamp rows** — one per light, height 54px, radius 16px, bg `#eae7e0`.
   Dimmable: drag horizontally to set brightness (fill `oklch(0.72 0.13 60 / 0.55)`, width = %,
   `transition: width 0.09s linear`), tap toggles; cursor `ew-resize`; label = `62%` or `uit`.
   Non-dimmable: tap only, cursor `pointer`, fill is 0 or 100%, label `aan` / `uit`.
   Each row: name 15px/500, capability tag 10px mono uppercase `#57544e` (`dimbaar` / `aan/uit`),
   then the value in 11px mono.
4. **Climate row** — bg `#fbfaf7`, border, radius 16px. Mode button height 44px, `padding: 0 14px`,
   radius 12px, icon 16px + 11px mono uppercase label (`Cool` / `Heat` / `Dry` / `Fan` / `Uit`), bg =
   the mode colour at full chroma (`oklch(0.68 0.13 250)`, `oklch(0.68 0.13 35)`,
   `oklch(0.70 0.12 95)`, `oklch(0.70 0.12 185)`) with `#fff` text, or `#eae7e0` / `#6e6b64` when off.
   Then `−` / setpoint / `+`: 44px squares, radius 12px, bg `#eae7e0`, ±0.5 °C, clamped 16–30.
5. **Media row** (only if the area has a media player) — station name 15px/500, state line 10px mono
   `Speelt · media_player.living_radio`, then prev / play-pause / next (44px, play button 52 × 44px,
   accent when playing) and a preset row of equal-width 38px buttons, active preset `#111318` on
   `#f0eeea`.

### 3. Energie (tab)
Header row `Nu` (11px mono uppercase) with `+916 W NAAR NET` on the right. Two columns: solar and
house consumption, each a 24px value + `W ZON` / `W HUIS` unit and a 6px progress bar (radius 3px,
track `#e2dfd8`, fill `oklch(0.72 0.13 60)` and `oklch(0.68 0.13 250)`, scaled against 2000 W). Below,
top loads as mono rows (name uppercase `#8a877f`, value `#3b3934`). At the bottom, the embedded
Lovelace energy dashboard — this is the one place Lovelace cards belong.

### 4. Netwerk (tab)
**Not a Lovelace page.** A list of entities that have not reported in over 24 hours — dead batteries,
dropped Zigbee nodes, offline devices. Title `Stille apparaten`, subtitle
`4 apparaten · geen update in 24 u`. Rows: bg `#fbfaf7`, border, radius 16px, `padding: 12px 14px`;
name 15px/500; second line 10px mono uppercase `#a8a49c` = `area · entity_id · batterij 4%`; right
badge height 30px, radius 9px with the silence duration (`6 dagen`, `31 uur`). Sorted oldest first.
Past 48 h the badge turns amber (`oklch(0.72 0.13 60 / 0.2)` / `oklch(0.45 0.11 60)`); under that it
is `#eae7e0` / `#7d7a72`. Footer note: `gesorteerd op laatste update · amber = meer dan 48 u stil`.

Implementation: from the entity subscription, compare `last_updated` to now; exclude entities whose
device is disabled. Battery level comes from the matching `sensor.*_battery` in the same device.

### 5. Auto (tab)
Title, subtitle (`kona electric · 78% · 312 km`) and the Lovelace car cards embedded below.

### 6. Settings (gear, `meer`)
Three sections:
1. **Wie ben jij** — two equal 48px buttons, radius 14px, name 15px/500 over the entity id in 9px
   mono. Selected: bg `#111318`, fg `#f0eeea`; unselected `#eae7e0` / `#57544e`. Note underneath:
   `de pil bovenaan toont de ánder`. Persists as `me` in the client config; the presence pill then
   tracks the other `person.*` entity.
2. **Kamers sorteren** — one row per area: name 15px/500 + `area_id` in 9px mono, then a 44px star
   (favourite: bg `oklch(0.72 0.13 60 / 0.28)`, fg `oklch(0.45 0.11 60)`; otherwise `#eae7e0` /
   `#a8a49c`) and 44px up / down buttons (bg `#eae7e0`, fg `#57544e`, `opacity:0.25` at the ends).
   Writes `roomOrder` and `favouriteAreas`.
3. **Overig** — 60px rows: `Weer` (opens the weather sheet), `Thema`, `Tints per kamer`.

### Tab bar
`padding: 0 16px 22px`, `position:relative; z-index:2`. Inner bar height 64px, radius 22px, bg
`#fbfaf7`, border `1px solid #e2dfd8`, `padding: 0 6px`, gap 4px. Four items, `flex:1`, height 52px,
radius 16px, **icon only** at 24px, label in `aria-label`.
- Active: bg `#e6e3dc`, fg `#111318`. Inactive: transparent, `#9b978f`.
- **Energie** reflects grid flow regardless of selection: solar icon in `oklch(0.44 0.11 150)` when
  exporting, plug icon in `oklch(0.42 0.12 250)` when importing; label
  `Energie · injectie` / `Energie · afname`.
- **Netwerk** warns when any device is stale: icon `oklch(0.45 0.11 60)` plus a 9px dot
  (`oklch(0.62 0.16 40)`, 2px `#fbfaf7` ring) at `top:11px`, offset right of the icon.

## Interactions & behaviour
- Tap tile body → room card. Tap light chip → toggle that room's lights, and **stop propagation** so
  the card does not open.
- Drag a per-lamp row → brightness; a pointer that never moved more than 6px is a tap and toggles.
  Set the drag state *before* calling `setPointerCapture`, and wrap the capture in try/catch —
  a failed capture must not kill the tap.
- Switching tab or opening the gear closes any open sheet.
- Escape and scrim tap close the sheet; focus moves into the panel on open.
- Optimistic updates: apply locally, let `state_changed` confirm.
- Non-dimmable lamps: no drag anywhere in the UI; a room with no dimmable lamp shows `aan` instead of
  a percentage.

## State
`sheet` (room id or null), `tab` (`home` | `energie` | `netwerk` | `auto` | `meer`), per-room light
on/brightness, climate mode + setpoint, media station/volume/playing, `me` (person id), plus
`favouriteAreas` / `roomOrder` / `areaTint` in the stored config.

## Design tokens
- Surfaces: page `#f0eeea`, card `#fbfaf7`, sheet `#f6f4f0`, control `#eae7e0`, control alt `#e6e3dc`,
  inactive chip `#e4e1da`, border `#e2dfd8`, divider `#d8d4cc`.
- Text: primary `#111318`, secondary `#57544e`, muted `#8a877f`, faint `#a8a49c`, on-accent `#241a00`.
- Accent (lights): `oklch(0.72 0.13 60)`; fills at `/0.5`, `/0.28`, `/0.2`.
- Climate: cool `oklch(0.68 0.13 250)`, heat `oklch(0.68 0.13 35)`, dry `oklch(0.70 0.12 95)`,
  fan `oklch(0.70 0.12 185)`. Alert dot `oklch(0.62 0.16 40)`.
- Room tints — personal rooms distinct, wet rooms cool, dry rooms warm:
  Living `oklch(0.74 0.07 70)`, Bureau `oklch(0.74 0.07 55)`, Dressing `oklch(0.76 0.06 95)`,
  Slaapkamer `oklch(0.62 0.10 300)`, Clara `oklch(0.72 0.11 350)`, Oliver `oklch(0.70 0.10 195)`,
  Badkamer `oklch(0.72 0.09 230)`, Waskot `oklch(0.70 0.09 245)`, Toilet `oklch(0.74 0.08 215)`.
- Type: Space Grotesk 400/500 for UI, IBM Plex Mono 400/500 for labels, ids and values. Mono labels
  are uppercase with `letter-spacing` 0.05–0.1em. Sizes used: 30, 24, 22, 20, 15, 14, 11, 10, 9px.
- Radii: 28 sheet, 20 tile, 23 pill, 16 row, 14 button, 12 square control, 10 chip, 8 state chip.
- Spacing: 20px screen gutter, 10px grid gap, 8px row gap, 4–6px inside controls.
- Hit targets: 44px minimum, except the 34px light chip and 26px read-only state chips (not tappable).
- Motion: `sheetUp 0.28s cubic-bezier(0.2,0.9,0.2,1)`, `fadeIn 0.18s ease`, brightness fill
  `width 0.09s linear`.

## Assets
No images. All icons are Material Design Icons paths (already in `src/ui/icons.ts`); the gear, star,
chevron and lan icons used here are from the same set. Fonts: Space Grotesk and IBM Plex Mono, both
already bundled in `src/ui/fonts.css`.

## Files
- `Home Dashboard.dc.html` — the prototype. Top section, badge `3b`, is the v2 spec; the sections
  below it are earlier explorations and should be ignored.
- `support.js` — runtime required to open the prototype in a browser. Not part of the design.
- `HA_INTEGRATION.md` — WebSocket, area registry, entity selection, service calls, sparkline history
  and what stays Lovelace. Unchanged and still correct, except that the room-detail history card is
  now a plain polyline instead of a `history-graph` embed.
