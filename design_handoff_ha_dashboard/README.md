# Handoff: Home Assistant custom dashboard — direction 2a

## Overview
A custom mobile-first Home Assistant frontend that replaces a Lovelace dashboard built from many
custom/HACS cards. It answers four questions at a glance — is the alarm set, is anything open, is
Leen home, what are the favourite rooms doing — and puts the common controls (lights, AC, radio) one
tap from the home screen. Heavy data views (energy, history graphs, camera, map, forecast) stay
Lovelace cards embedded in the shell rather than being rebuilt.

Design language: dark, dense, typographic. Icons everywhere, no word-labelled buttons.

## About the Design Files
`Home Dashboard.dc.html` in this bundle is a **design reference created in HTML** — a prototype that
shows the intended look and behaviour with mock state. It is not production code to copy. The task is
to **recreate the design in the target codebase's environment** using its established patterns; if no
frontend exists yet, React + Vite + TypeScript with `home-assistant-js-websocket` is the recommended
starting point (see `HA_INTEGRATION.md`).

The file contains three directions in two turns. **Only direction `2a` (the top section, dark phone,
titled "Dense — cards with device badges, trend, energy") is the approved design.** Turn 1 (`1a`,
`1b`) is earlier exploration kept for reference — do not implement it.

## Fidelity
**High fidelity.** Colours, typography, spacing, radii, animation timings and interaction states are
final and listed below. Recreate pixel-for-pixel at 390 × 844 logical px, then let it grow
responsively (see Responsive behaviour).

---

## Screens / Views

### 1. Home
**Purpose:** the default screen. Status at a glance, favourite rooms with direct controls, entry
points to the deeper views.

**Layout** — a 390 × 844 column (`display:flex; flex-direction:column`), `overflow:hidden`,
`border-radius:44px` in the prototype only (the real app is full-bleed; drop the radius and use safe
area insets). Vertical order:

1. Header — `padding:50px 22px 0`, `flex:0 0 auto`
2. Status pills — `padding:16px 22px 0`, `flex:0 0 auto`
3. "Kamers" section header — `padding:18px 22px 8px`, `flex:0 0 auto`
4. Scroll area — `flex:1 1 auto; overflow-y:auto; padding:0 22px 14px`
5. Tab bar — `flex:0 0 auto; padding:0 18px 26px`
6. Overlays (bottom sheets), absolutely positioned over everything

#### Header
Two columns, `display:flex; justify-content:space-between; align-items:flex-start`.

Left:
- Clock — `font-size:32px; font-weight:500; letter-spacing:-0.03em; line-height:1`. Content `21:14`
- Date — IBM Plex Mono `11px`, `letter-spacing:0.08em`, `color:rgba(240,238,234,0.4)`,
  `margin-top:6px`. Content `ZO 17 AUG`

Right (tappable → weather sheet, `cursor:pointer; text-align:right`):
- Row `display:flex; align-items:center; gap:7px; justify-content:flex-end;
  color:rgba(240,238,234,0.75)` — weather icon `22 × 22`, then temperature
  `font-size:26px; font-weight:400; letter-spacing:-0.03em; color:#f0eeea`. Content `16.0°`
- Meta line — IBM Plex Mono `11px`, `color:rgba(240,238,234,0.32)`, `margin-top:4px`.
  Content `23° / 17° · 1015 hPa · 10 KM/H SW`

#### Status pills
`display:flex; gap:7px; flex-wrap:wrap`. Each pill: `height:36px; padding:0 14px;
border-radius:18px; display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500;
letter-spacing:-0.01em; cursor:pointer`, with a `17 × 17` leading icon.

| Pill | Content | Attention state (bg / fg) | Calm state (bg / fg) |
| --- | --- | --- | --- |
| Alarm | `Alarm uit` / `Alarm thuis` / `Alarm afwezig` | disarmed: `oklch(0.32 0.05 60)` / `oklch(0.72 0.13 60)` | armed: `rgba(255,255,255,0.07)` / `rgba(240,238,234,0.55)` |
| Openings | 1 open: `Living raam 2`; more: `3 open` | `oklch(0.32 0.05 60)` / `oklch(0.72 0.13 60)` | hidden entirely when nothing is open |
| Presence | `Leen weg` / `Leen thuis` | home: `oklch(0.34 0.05 250)` / `oklch(0.68 0.13 250)` | away: `rgba(255,255,255,0.07)` / `rgba(240,238,234,0.55)` |

Icons: shield-off / shield-home, window-open-variant, account-arrow-right.
Alarm pill cycles off → home → away on tap (in production: open an arm/disarm sheet with code entry).
Openings pill opens the openings sheet. Presence pill opens the person's map sheet.

**The openings pill must scale to 13 simultaneous openings**: one open shows `Room name`, two or more
collapse to `N open` so the pill row never grows past one line.

#### "Kamers" section header
`display:flex; align-items:baseline; justify-content:space-between`.
- Left: IBM Plex Mono `11px`, `letter-spacing:0.1em`, uppercase, `color:rgba(240,238,234,0.4)` — `Kamers`
- Right: IBM Plex Mono `10px`, `letter-spacing:0.06em`, uppercase, `color:rgba(240,238,234,0.28)` — `5 favoriet · 9 totaal`

#### Room grid
`display:grid; grid-template-columns:1fr 1fr; gap:8px`. Favourites first; the last cell of that grid
is the "other rooms" toggle card. When expanded, a second identical grid follows with
`margin-top:10px` holding the non-favourite rooms.

**Room card** — `position:relative; overflow:hidden; border-radius:20px;
background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.07);
padding:12px 12px 12px 14px; display:flex; gap:10px; align-items:flex-start; cursor:pointer`.
Hover: `background:rgba(255,255,255,0.085)`. Tap anywhere (except an icon button) opens the room sheet.

- Accent edge — `position:absolute; left:0; top:0; bottom:0; width:3px; opacity:0.75`, colour = the
  room's tint (table below)
- Text column — `flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:8px`
  - Room name — `font-size:15px; font-weight:500; letter-spacing:-0.015em`
  - Reading row — `display:flex; align-items:baseline; gap:5px`: temperature
    `font-size:27px; font-weight:400; letter-spacing:-0.035em; line-height:1` (rounded, e.g. `24°`),
    humidity IBM Plex Mono `10px`, `color:rgba(240,238,234,0.35)`, one decimal (e.g. `61.9%`)
  - Trend — inline `<svg viewBox="0 0 24" preserveAspectRatio="none">` polyline, `width:100%;
    height:20px; opacity:0.5`, `stroke` = room tint, `stroke-width:1.4` with
    `vector-effect="non-scaling-stroke"`. 22 points, last 24 h of the temperature sensor.
- Icon column — `display:flex; flex-direction:column; gap:5px; align-items:flex-end; flex:0 0 auto`.
  **Must be in flow, not absolutely positioned**, so a room with four devices grows the card.
  Each item `width:30px; height:30px; border-radius:9px; display:flex; align-items:center;
  justify-content:center; cursor:pointer`, icon `15 × 15`.
  - Active: `background` = accent (`oklch(0.72 0.13 60)`, or `oklch(0.68 0.13 250)` for AC),
    `color:#12141a`
  - Inactive: `background:rgba(255,255,255,0.07)`, `color:rgba(240,238,234,0.42)`
  - Order: lights (always, toggles all room lights) → AC (toggles) → radio (play/pause) → read-only
    sensors (window, motion, smoke, camera)
  - Icon button taps must `stopPropagation()` so they don't open the sheet

**Other-rooms toggle card** — same footprint as a room card but
`border:1px dashed rgba(255,255,255,0.16); background:none; min-height:109px; display:flex;
flex-direction:column; align-items:center; justify-content:center; gap:7px;
color:rgba(240,238,234,0.45)`. Hover: `background:rgba(255,255,255,0.04);
color:rgba(240,238,234,0.8); border-color:rgba(255,255,255,0.28)`.
Chevron `20 × 20`, rotated `180deg` when expanded (animate the rotation, 180 ms).
Label IBM Plex Mono `9px`, `letter-spacing:0.1em`, uppercase, centred:
`Andere kamers · 4` collapsed, `Verberg` expanded.

#### Tab bar
Wrapper `height:58px; border-radius:22px; background:rgba(255,255,255,0.06);
border:1px solid rgba(255,255,255,0.07); display:flex; align-items:center;
justify-content:space-around; padding:0 6px`.
Each item `flex:1; height:42px; border-radius:15px; display:flex; align-items:center;
justify-content:center; cursor:pointer`, icon `21 × 21`.
- Active: `background:#f0eeea; color:#111318`
- Inactive: `background:transparent; color:rgba(240,238,234,0.45)`

Five tabs, left to right: **stroom** (power-plug-outline) · **energie** (solar-power-variant) ·
**home** (home-variant) · **netwerk** (lan-connect) · **auto** (car-side).
`stroom` and `energie` open the power sheet in the prototype; in production `energie` should open the
Lovelace energy dashboard and `netwerk` / `auto` their own views.

### 2. Room sheet (bottom sheet)
Opens on room card tap. Scrim `rgba(10,11,14,0.55)` + `backdrop-filter:blur(3px)`, `fadeIn 0.18s ease`;
tapping the scrim closes. Panel `position:absolute; left:0; right:0; bottom:0; background:#1b1e24;
border-radius:32px 32px 44px 44px; padding:20px 20px 34px; display:flex; flex-direction:column;
gap:16px`, entering with `sheetUp 0.28s cubic-bezier(0.2,0.9,0.2,1)` (`translateY(101%)` → `0`).

Contents, in order:
1. **Header row** — `gap:12px`: a `9 × 9` dot in the room tint, room name
   `font-size:20px; font-weight:500; letter-spacing:-0.015em; flex:1`, close button
   `34 × 34; border-radius:50%; background:rgba(255,255,255,0.08)`, icon `15 × 15`,
   `color:rgba(240,238,234,0.6)`
2. **Reading** — temperature `font-size:56px; font-weight:400; letter-spacing:-0.04em;
   line-height:0.9` with one decimal (`23.1°`), humidity IBM Plex Mono `12px`,
   `color:rgba(240,238,234,0.4)`, baseline-aligned via `padding-bottom:8px`
3. **Climate row** (only if the room has a climate entity) — `background:rgba(255,255,255,0.05);
   border-radius:16px; padding:12px 14px; display:flex; align-items:center; gap:10px`:
   mode chip (AC icon + `Cool` / `Uit`, `padding:7px 11px; border-radius:9px`, active
   `background:oklch(0.68 0.13 250); color:#fff`, inactive `background:rgba(255,255,255,0.08);
   color:rgba(240,238,234,0.5)`), then `−` / target / `+` — buttons `36 × 36; border-radius:11px;
   background:rgba(255,255,255,0.08)`, target `font-size:17px; font-weight:500; min-width:62px;
   text-align:center`, formatted `25.0 °C`, step 0.5, clamp 16–30
4. **Media block** (only if the room has a media player; Living does) —
   `background:rgba(255,255,255,0.05); border-radius:16px; padding:13px; display:flex;
   flex-direction:column; gap:12px`:
   - Row 1: `32 × 32; border-radius:10px; background:rgba(255,255,255,0.06)` radio icon, then station
     name `15px/500` with state line IBM Plex Mono `11px` uppercase
     `color:rgba(240,238,234,0.38)` reading `Speelt · media_player.living_radio` /
     `Gepauzeerd · …`, then prev `34 × 34`, play/pause `44 × 34` (active
     `background:accent; color:#1a1400`), next `34 × 34`, all `border-radius:11px`
   - Row 2: volume — `−` / track / `+` (`30 × 30; border-radius:9px`), track
     `height:6px; border-radius:3px; background:rgba(255,255,255,0.12)` with a fill in the accent at
     the volume percentage, then the percentage in IBM Plex Mono `11px`, `min-width:34px`, right
     aligned. Step 5
   - Row 3: three station presets, `flex:1; height:30px; border-radius:10px`, IBM Plex Mono `10px`
     uppercase; selected `background:#f0eeea; color:#111318`, else
     `background:rgba(255,255,255,0.08); color:rgba(240,238,234,0.5)`
5. **Entity rows** — one per light: `background:rgba(255,255,255,0.05); border-radius:16px;
   padding:14px; display:flex; align-items:center; gap:12px`, hover
   `background:rgba(255,255,255,0.08)`. Leading `32 × 32; border-radius:10px;
   background:rgba(255,255,255,0.06)` bulb icon, name `15px/500`, entity_id IBM Plex Mono `11px`
   uppercase `color:rgba(240,238,234,0.38)`, trailing switch `46 × 27; border-radius:14px;
   padding:3px` (on = accent, off = `rgba(255,255,255,0.14)`) with a `21 × 21` white knob,
   `transform:translateX(19px)` when on, `transition:transform 0.18s ease`
6. **Footer** — IBM Plex Mono `10px`, `letter-spacing:0.08em`, uppercase,
   `color:rgba(240,238,234,0.25)`, centred: `Entities from area · living`

### 3. Openings sheet
Same sheet chrome. Header: `34 × 34; border-radius:11px; background:oklch(0.32 0.05 60)` window icon
in `oklch(0.72 0.13 60)`, title `Open` with sub-line `3 van 13 open` (IBM Plex Mono `10px` uppercase,
`color:rgba(240,238,234,0.35)`), close button.
List `display:flex; flex-direction:column; gap:7px; max-height:340px; overflow-y:auto` — each row
`background:rgba(255,255,255,0.05); border-radius:16px; padding:12px 14px; gap:12px`: amber icon tile
(window or door glyph by device class), `Room · Name` at `15px/500`, and
`sinds 10:02 · binary_sensor.living_raam_2` in IBM Plex Mono `10px` uppercase, ellipsised.

### 4. Weather sheet
Header icon tile `background:rgba(255,255,255,0.07)`, title `KMI · Halle`.
Big current temp `54px/400/-0.04em` beside a two-line mono meta block
(`bewolkt · 23° / 17°`, `1015 hPa · 10 km/h SW`).
Then the forecast strip: `display:flex; gap:7px`, each day `flex:1; border-radius:12px;
background:rgba(255,255,255,0.04); padding:8px 9px; display:flex; flex-direction:column; gap:3px` —
day code in mono `10px` `letter-spacing:0.1em`, a `16 × 16` condition icon beside `23°` at `15px/500`,
low temp in mono `10px` `color:rgba(240,238,234,0.3)`.
Footer note: this is where the Lovelace forecast card is embedded.

### 5. Power sheet
Header icon tile with the plug glyph in `oklch(0.72 0.13 60)`, title `Stroom`.
- Row: `Nu` (mono `11px`, `letter-spacing:0.1em`, uppercase) and `+916 W NAAR NET` right-aligned
- Two columns `gap:14px`: solar and consumption. Each shows the value at `22px/400/-0.03em` + `W`,
  the source icon right-aligned in its accent colour, and a `height:5px; border-radius:3px` bar
  (`background:rgba(255,255,255,0.1)`) filled to `value / 2000` — solar in
  `oklch(0.72 0.13 60)`, consumption in `oklch(0.68 0.13 250)`
- Top loads list: mono `11px` rows, name uppercase `color:rgba(240,238,234,0.5)`, value
  `color:rgba(240,238,234,0.75)`, e.g. `keukenboiler` / `1.877 W`
- Footer note: this is where the Lovelace energy dashboard is embedded

---

## Interactions & Behavior
- **Room card tap** → room sheet. **Icon button tap** → the service call, sheet stays closed.
- **Lights icon** toggles every light in the room: if any is on, turn all off; else turn all on.
- **AC icon** toggles the climate entity between its cool mode and off.
- **Radio icon** toggles play/pause on the room's media player.
- **Alarm pill** cycles state in the prototype; production should open an arm/disarm sheet.
- **Openings pill** → openings sheet. Hidden when nothing is open.
- **Presence pill** → the person's location sheet (embed the Lovelace map card).
- **Weather block** → weather sheet. **Plug / solar tab** → power sheet.
- **Other rooms card** → expands a second grid below; the card becomes `Verberg`.
- Sheets: scrim tap or close button dismisses; `Escape` should too. Only one sheet open at a time.
- Animations: `fadeIn 0.18s ease` on the scrim, `sheetUp 0.28s cubic-bezier(0.2,0.9,0.2,1)` on the
  panel, `0.18s ease` on switch knobs, `180ms` on the chevron rotation. Respect
  `prefers-reduced-motion` by dropping the transforms.
- Every icon button is 30 × 30 in the design. **Give it a ≥ 44 px touch target** with padding or a
  pseudo-element hit area — do not shrink the visual size.
- Optimistic UI: flip the local state immediately on tap, reconcile when the state_changed event
  arrives, and revert with a toast if the service call fails.

## Responsive behavior
Phone is the primary target; desktop is secondary.
- ≤ 480 px: as designed, one column of pills, 2-up room grid.
- 481–1024 px: 3-up room grid, sheets max-width 560 px centred.
- ≥ 1025 px: 4-up room grid, `max-width:1200px` centred; move the tab bar to a left rail (same icons,
  same active treatment); sheets become centred modals with the same panel styling and a 24 px radius
  on all corners.

## State Management
Local UI state:
- `sheet: { kind: 'room' | 'openings' | 'weather' | 'power', id?: string } | null`
- `showOthers: boolean`
- `activeTab: 'stroom' | 'energie' | 'home' | 'netwerk' | 'auto'`

Server state, all from Home Assistant (see `HA_INTEGRATION.md`) — never duplicated into local state
except as optimistic overlays:
- areas + area registry (drives the room list; `fav` is a per-user client-side list of area ids)
- per area: temperature sensor, humidity sensor, lights, climate, media player, binary sensors
- `alarm_control_panel` state, `person.leen` state, `weather.kmi` + forecast,
  power/solar sensors, 24 h history for each room's temperature sensor

Data fetching: one WebSocket subscription for all state, plus `history/history_during_period`
per temperature sensor for the sparklines (cache 5 min).

## Design Tokens

### Colour
| Token | Value |
| --- | --- |
| bg | `#111318` |
| sheet bg | `#1b1e24` |
| text | `#f0eeea` |
| text muted | `rgba(240,238,234,0.4)` |
| text faint | `rgba(240,238,234,0.28)` |
| surface | `rgba(255,255,255,0.05)` |
| surface hover | `rgba(255,255,255,0.085)` |
| surface alt | `rgba(255,255,255,0.07)` |
| hairline | `1px solid rgba(255,255,255,0.07)` |
| scrim | `rgba(10,11,14,0.55)` + `blur(3px)` |
| accent (amber) | `oklch(0.72 0.13 60)` |
| accent ink | `#1a1400` |
| accent cool (blue) | `oklch(0.68 0.13 250)` |
| pill warn bg | `oklch(0.32 0.05 60)` |
| pill presence bg | `oklch(0.34 0.05 250)` |

Room tints: Living `oklch(0.78 0.07 250)` · Bureau `oklch(0.78 0.07 250)` ·
Slaapkamer `oklch(0.82 0.08 60)` · Clara `oklch(0.80 0.07 20)` · Oliver `oklch(0.82 0.07 150)` ·
Dressing `oklch(0.85 0.06 150)` · Waskot `oklch(0.82 0.06 250)` · Badkamer `oklch(0.82 0.06 220)` ·
Toilet `oklch(0.88 0.07 95)`.

The amber accent is a theme prop — the design also ships blue `oklch(0.68 0.13 250)`, green
`oklch(0.70 0.12 150)` and magenta `oklch(0.68 0.13 330)` at the same lightness and chroma. Keep it
one variable.

### Typography
- Display / UI: **Space Grotesk**, weights 400 and 500 (700 available, unused)
- Mono / labels: **IBM Plex Mono**, weight 400 (500 for badges)
- Scale: `56` sheet reading · `32` clock · `27` card temp · `26` header temp · `22` power value ·
  `20` sheet title · `17` climate target · `15` card name / entity name · `13` pill label ·
  `12`–`9` mono labels
- Tracking: `-0.04em` at 54–56 px, `-0.035em` at 27 px, `-0.03em` at 26–32 px, `-0.015em` at 15–20 px,
  `-0.01em` at 13 px; mono labels `+0.06em` to `+0.1em`, uppercase

### Spacing & shape
- Screen padding 22 px (24 px in the light direction), tab bar padding 18 px
- Grid gap 8 px, card internal gap 8–10 px, icon column gap 5 px, pill row gap 7 px
- Radii: 44 (phone) · 32/44 (sheet) · 22 (tab bar) · 20 (card) · 18 (pill) · 16 (sheet row) ·
  15 (tab item) · 14 (switch) · 13 (forecast day) · 12 · 11 (stepper) · 10 · 9 (icon button) ·
  6 (bar) · 50% (close)
- No shadows inside the app (the prototype's phone shadow is presentation only)

## Assets
No bitmaps. All icons are inline single-path SVGs on a `0 0 24 24` viewBox, `fill:currentColor`:
- **Material Design Icons** (Pictogrammers, Apache-2.0) — `shield-off-outline`, `shield-home`,
  `account-arrow-right`, `radio`, `lightbulb`, `window-open-variant`, `door`, `air-conditioner`,
  `motion-sensor`, `smoke-detector-variant`, `cctv`, `weather-cloudy`, `weather-partly-cloudy`,
  `weather-pouring`, `weather-sunny`, `power-plug-outline`, `solar-power-variant`, `home-variant`,
  `lan-connect`, `car-side`, `play`, `pause`, `skip-next`, `skip-previous`, `close`, `chevron-down`
- **custom-brand-icons** (elax46, free use) — available for device-specific glyphs; the prototype
  initially used its `air-conditioner`, `window-sensor`, `motion-sensor`, `smoke-detector` and
  `camera-person` but they read as blobs below 16 px, so MDI is used at these sizes. Use the brand
  set only at ≥ 24 px.

Weather icons are MDI placeholders. The intended set is **Meteocons** (meteocons.com) — keep every
weather glyph behind one lookup map so the swap is a single change.

Fonts: Google Fonts `Space Grotesk` (400,500,700) and `IBM Plex Mono` (400,500). Self-host in
production.

## Files
- `Home Dashboard.dc.html` — the design prototype. Direction `2a` is the approved one; it is the first
  section in the file. Open it in a browser and interact with it: every control works against mock state.
- `HA_INTEGRATION.md` — entity mapping, WebSocket calls, and which views stay Lovelace.
