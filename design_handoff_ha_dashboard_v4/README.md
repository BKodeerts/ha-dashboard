# Handoff: HA Dashboard — v4 home screen

## Overview
v4 of the Home Assistant phone dashboard (`BKodeerts/ha-dashboard`). v1 shipped and was rejected on
UX grounds; v2 corrected the structure; v3 compressed the header and replaced the climate panel with a
single drag row plus a floating mode picker; v4 takes the same treatment to the alarm and presence, and
makes favourites mean something. This package is the current specification for the home screen, room
card, tab structure, network view and settings panel, and replaces the v1, v2 and v3 handoffs for
everything it covers. `HA_INTEGRATION.md` (the WebSocket/area-registry/service-call layer) is
unchanged and still authoritative.

Carried over from v3, still current:
1. The weather block is a single left-aligned line instead of a centred stack.
2. The climate row: drag = setpoint, tap = power, glyph = a floating mode picker — **never a cycle**.
   Every mode tap on this system is a cloud command to the AC, so a picker that sends exactly one
   command is a hard requirement.

New in v4:
3. **The alarm left the pill row** and became an icon-only chip beside the presence chips, with its own
   floating state picker — same pattern as the climate row, and for the same reason: one tap, one
   command. It carries four states on a glyph and a dot, including the `arming` transition, which
   pulses. The pill row below is left with one job: what is open.
4. **Presence is a list, not a fixture.** The chip row at the top right shows the people the user chose
   to follow, up to two; the user is derived from the logged-in Home Assistant account rather than
   picked in settings.
5. **Favourites now filter the grid.** The room grid shows favourites only, with one row at the bottom
   that unfolds the rest — the setting existed in v3 but changed nothing.
6. **Tile chips are one size, bottom-right aligned, in a fixed priority order**, three at a time.
7. **The tab bar is absolutely pinned** to the bottom of the frame; it cannot be scrolled away.

Target: phone, one hand, portrait, 390 × 844. Colour scheme follows Home Assistant's light/dark
setting; this prototype shows the light scheme.

## About the design files
`Home Dashboard.dc.html` is a **design reference written in HTML** — an interactive prototype of the
intended look and behaviour, not production code. Recreate it in the existing React + TypeScript +
Vite app using that codebase's components and patterns (`src/components/*`, `src/ha/*`,
`src/ui/styles.css`). Do not port the prototype's inline styles or its mock state; wire the real
selectors that already exist.

The file also contains earlier turns of exploration below the current section — **only the top section
(badge `3b`) is the specification**. Everything below it is historical.

## Fidelity
**High fidelity.** Colours, type, spacing, radii and hit targets are final. Match them. Contrast was
checked: every label a user reads clears 4.5:1 on its own background.

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
| Centred weather stack + 3 wrapping pills (~210px before the rooms) | One weather line + alarm chip + person chips + one pill row (~110px) |
| Climate: power button, mode dropdown, −/+ pair | One 54px row: drag = setpoint, tap = power, glyph = mode picker |
| Mode changed by cycling | Mode chosen from a 5-way popover, one command per pick |
| Alarm state written as a word in the pill row | Icon-only chip beside presence, with a 3-way state picker |
| One hard-coded pair of people; "who am I" was a setting | User comes from `hass.user`; who you follow is a choice, up to two |
| Favourites could be set but changed nothing | Grid shows favourites; the rest unfold from one row |
| Tile chips: a 34px light chip with a percentage next to 26px plates | Bare glyphs in a vertical column at the right edge, fixed priority, three at a time |
| Bottom bar sat in the flex column | Bar absolutely pinned to the frame bottom, scroll areas padded 102px |

## Screens / views

### 1. Home (tab `home`)
Purpose: see whether the house is safe and closed, and control lights without navigating.

Layout, top to bottom, in a 390 × 844 column:
1. **Weather line + alarm chip + person chips** — one row, `padding: 44px 18px 0 20px`,
   `align-items:center`, gap 12px. Order: weather, a flexible spacer, alarm chip, person chips.
   - Left (`flex:0 0 auto`, taps to the weather sheet): condition icon 24px `#8a877f`, gap 9px,
     temperature `18,0°` at 26px/400 `letter-spacing:-0.03em` `line-height:1`, then hi/lo in 10px
     IBM Plex Mono uppercase `#6e6b64` (`letter-spacing:0.05em`, `white-space:nowrap`, `flex:0 0 auto`):
     `23° / 17°`. The condition word moved into the weather sheet — the icon carries it here.
     **The weather block does not shrink and the range does not clip**: it is the reason the header was
     reshaped, so the chips give way, not the range. The slack lives in a
     `flex:1 1 auto; min-width:8px` spacer between the weather and the chips.
   - **Alarm chip** (see *Alarm chip* below), then **person chips**, both `flex:0 0 auto`.
   - **Person chip**: height 36px, radius 18px, gap 7px, person icon 16px + a 6px state dot.
     One followed person → the name shows at 13px/500 and padding is `0 12px 0 10px`; two → the names
     drop and padding is `0 9px`, so both chips fit beside the alarm chip without touching the weather
     range. Home: bg `oklch(0.68 0.13 250 / 0.18)`, fg `oklch(0.40 0.12 250)`,
     dot `oklch(0.42 0.12 250)`. Away: bg `#eae7e0`, fg `#57544e`, dot `#a8a49c`. Tapping opens that
     person's entity detail. Which people appear is a setting (§6); the logged-in user is never one of
     them. **Two is the cap** — a third chip costs the weather range its space.
2. **Exception pills** — `padding: 14px 20px 0`, flex, gap 8px, **no wrap, one line only**. One pill
   now that the alarm has moved up: openings. Height 40px, radius 20px, `padding: 0 14px`, icon 17px
   (`flex:0 0 auto`) + label 14px/500 with `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`.
   The label is count-based so it can never wrap: `1 raam open` / `3 ramen open` / `Alles dicht` —
   which room is in the sheet the pill opens.
   - Attention state (anything open): bg `oklch(0.72 0.13 60 / 0.22)`, fg `oklch(0.45 0.11 60)`.
   - Calm: bg `#e6e3dc`, fg `#57544e`.
3. **Section head** — `padding: 20px 14px 8px 20px`, `Kamers` in 11px mono uppercase `#8a877f`
   (`letter-spacing:0.1em`), and a 44px round gear button on the right (icon 19px, `#a8a49c`;
   hover bg `#e6e3dc`, fg `#57544e`) opening the settings view.
4. **Room grid** — scrollable, `padding: 0 20px 102px` (the bar is pinned over it, so the padding is
   what keeps the last row reachable), 2 columns, gap 10px. **Favourites only**, in user order.
   Beneath the grid, one disclosure row, `margin-top:10px`, `min-height:44px`, radius 14px, bg
   `#eae7e0` (hover `#e2dfd8`), centred 10px mono uppercase `#7d7a72` (`letter-spacing:0.08em`) with a
   15px chevron: `Overige kamers · 4` / `Verberg overige · 4`. Expanded, the non-favourites append to
   the same grid in user order. Collapsed is the default on every load — the fold is a display filter,
   not a stored preference.
5. **Tab bar** — see below.

**Room tile.** Radius 20px, bg `#fbfaf7`, border `1px solid #e2dfd8`, `overflow:hidden`,
`position:relative`.
- **Tint spine**: absolutely positioned, `left:0; top:0; bottom:0; width:5px`, the room's accent.
- **Tap area** (opens the room card): `padding: 13px 11px 11px 18px`, **row**,
  `align-items:flex-start`, gap 8px.
  - Left column (`flex:1; min-width:0`, gap 4px): room name 15px/500, `letter-spacing:-0.015em`,
    ellipsised; then the reading row — temperature 24px/400 `letter-spacing:-0.035em` + humidity
    10px mono `#8a877f`.
  - **Icon column** (`flex:0 0 auto`): a vertical stack against the tile's right edge —
    `flex-direction:column; align-items:flex-end; gap:1px`, `margin: -6px -6px 0 0` so the padded rows
    reach the tile's edge. Right edges stay flush whether or not a glyph carries a note.
  - **No plates.** Each row is a bare 16px glyph — colour alone carries state, which keeps the column
    quiet beside the 24px reading. Active: the mode/accent colour. Inactive: `#b4afa5`.
    A glyph with a value (the AC setpoint) puts it **left** of the icon in 10px mono
    (`letter-spacing:0.02em`), `#6e6b64` when active and `#a8a49c` when not, gap 5px.
  - **Hit area is padding, not a plate.** The two controls carry `padding: 8px` (≈32 × 32px);
    read-only glyphs carry `padding: 8px 8px 8px 4px`. Without it a 16px glyph inside a tile body that
    is itself a tap target turns every near-miss into an opened room card.
  - **Priority, top to bottom: light › radio › open window › AC. Three at a time**; anything past the
    third is only in the room card. In a room with a radio *and* an open window this drops the AC chip,
    so the setpoint is not on the tile there — accepted, the exceptions matter more at a glance.
  - **Light glyph** (tappable, toggles the room's lights, must not open the card): bulb only, no
    percentage. On: `oklch(0.58 0.14 60)`. Off: `#b4afa5`.
  - **AC chip** is also a control: tapping it switches the unit on or off (`climate.turn_on` /
    `climate.turn_off`); which mode it returns in is the room card's business. Radio and window chips
    are read-only glyphs.
  - Active glyph colours — use the `fg` value of each pair below; the `bg` values belong to the dark
    scheme's washed variant and are not used on this screen:
      - AC — colour by hvac mode, note = setpoint (`25°`), no note for fan:
        cool bg `oklch(0.68 0.13 250 / 0.18)` fg `oklch(0.42 0.12 250)`;
        heat `oklch(0.68 0.13 35 / 0.2)` / `oklch(0.45 0.13 35)`;
        dry `oklch(0.70 0.12 95 / 0.2)` / `oklch(0.44 0.11 95)`;
        fan_only `oklch(0.70 0.12 185 / 0.2)` / `oklch(0.42 0.09 185)`.
      - Radio — amber when playing: bg `oklch(0.72 0.13 60 / 0.22)`, fg `oklch(0.45 0.11 60)`.
      - Window — amber when an opening in that room is open.

**Alarm chip.** Icon-only, height 36px, radius 18px, `padding: 0 10px`, gap 6px: a 17px shield glyph
plus a 6px dot. The glyph and the dot carry the state on their own — the word is gone from the header.
The chip sits in a `position:relative` wrapper so its picker can hang off it.

| State | Glyph | Background | Foreground | Dot |
| --- | --- | --- | --- | --- |
| `disarmed` (uit) | shield-off | `#eae7e0` | `#57544e` | `#a8a49c` |
| `arming` (wapenen) | shield | `oklch(0.72 0.13 60 / 0.22)` | `oklch(0.42 0.10 60)` | `oklch(0.58 0.15 60)`, pulsing |
| `armed_away` (weg) | shield | `oklch(0.72 0.13 60 / 0.5)` | `#241a00` | `#241a00` |
| `armed_night` (nacht) | shield-home | `oklch(0.68 0.13 250 / 0.18)` | `oklch(0.40 0.12 250)` | `oklch(0.42 0.12 250)` |

`arming` is a transition, not a destination: HA reports it while the exit delay runs, and the chip
leaves it on its own when the panel reports the armed state. The dot pulses through it —
`animation: pulseDot 1.05s ease-in-out infinite`, keyframes
`0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.3; transform:scale(0.65) }`. No other state
animates.

**Alarm state picker.** Same pattern as the climate mode picker, and for the same reason — one tap, one
command, no cycling a panel would have to acknowledge. Tapping the chip opens it; tapping the chip again
closes it. It floats, so nothing in the header moves: `position:absolute; right:0; top:44px; z-index:4`,
`display:inline-flex`, gap 2px, padding 5px, radius 24px, bg `#fdfcfa`,
`box-shadow: 0 16px 34px -14px rgba(17,19,24,0.4), 0 0 0 1px rgba(17,19,24,0.06)`,
`fadeIn 0.14s ease`. It hangs *below* the chip because the chip is at the top of the screen.

Options, height 38px, `padding: 0 13px`, radius 19px, 10px mono uppercase
(`letter-spacing:0.04em`, `white-space:nowrap`): `Weg`, `Nacht`, `Uit`. Inactive: transparent bg, fg
`#57544e`. Active: bg `oklch(0.62 0.15 60)` (Weg), `oklch(0.52 0.13 250)` (Nacht), `#6e6b64` (Uit),
`#fff` text. While `arming`, `Weg` reads as active.

**Which options exist comes from the device, not this spec.** Read the panel's `supported_features`
bitmask on the `alarm_control_panel` entity and render only the modes it advertises
(`ARM_HOME` 1, `ARM_AWAY` 2, `ARM_NIGHT` 4, `ARM_VACATION` 32, `ARM_CUSTOM_BYPASS` 16, `TRIGGER` 8);
`Uit` is always available. A panel without `ARM_NIGHT` simply shows one chip fewer. Picking sends one
call — `alarm_control_panel.alarm_arm_away` / `alarm_arm_night` / `alarm_disarm` — and closes the
picker. If the panel requires a code, prompt for it here rather than sending a call that will fail.

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
4. **Climate row** — one row in the same visual language as the lamp rows. Wrapper
   `position:relative` (no overflow clip — the picker escapes it). Row: height 54px, radius 16px,
   bg `#eae7e0`, `overflow:hidden`, `touch-action:none`, `user-select:none`, `cursor:ew-resize`.
   - **Fill** = setpoint on a 16–30 °C track: `width = (target − 16) / 14`,
     `transition: width 0.09s linear`, colour = mode at `/0.45`
     (`oklch(0.68 0.13 250 / 0.45)` cool, `oklch(0.68 0.13 35 / 0.45)` heat,
     `oklch(0.70 0.12 95 / 0.45)` dry, `oklch(0.70 0.12 185 / 0.45)` fan). Width 0 when off.
   - **Contents** (`padding: 0 16px 0 6px`, gap 11px): mode glyph button 42px square, radius 12px,
     icon 18px, bg = mode at full chroma with `#fff` glyph, or `#ded9d0` / `#6e6b64` when off; then
     mode name 15px/500 (`Koelen` / `Warmen` / `Drogen` / `Ventileren` / `AC uit`), a 10px mono
     uppercase hint `#6e6b64` (`sleep 16–30°` when on, `tik = aan` when off), and the setpoint
     16px/500 right-aligned, `min-width:52px`.
   - **Gestures**: drag anywhere on the row sets the setpoint (rounded to 0.5 °C, and switches the
     unit on if it was off); a pointer that never moved 6px is a tap and toggles power. Dragging
     should send one service call on release, not per frame.
   - **Mode picker** — floating, so nothing in the sheet moves. `position:absolute; left:0;
     bottom:62px; z-index:3`, `display:inline-flex` (width follows content), gap 2px, padding 5px,
     radius 24px, bg `#fdfcfa`,
     `box-shadow: 0 16px 34px -14px rgba(17,19,24,0.4), 0 0 0 1px rgba(17,19,24,0.06)`,
     `fadeIn 0.14s ease`. Five options, height 38px, `padding: 0 13px`, radius 19px, 10px mono
     uppercase `letter-spacing:0.04em`, `white-space:nowrap`: `Koel`, `Warm`, `Droog`, `Vent`,
     `Uit`. Inactive: transparent bg, fg `#57544e`. Active: bg = that mode's full-chroma colour
     (`#6e6b64` for `Uit`) with `#fff` text (`#f0eeea` on `Uit`). Picking closes the picker and
     sends exactly one command — `climate.set_hvac_mode` for a mode, `climate.turn_off` for `Uit`.
     The glyph button opens and closes it; closing the sheet closes it.
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
Four sections:
1. **Wie ben jij** — **read-only**. One row, `min-height:60px`, `padding: 0 16px`, radius 18px, bg
   `#fbfaf7`, border `1px solid #e2dfd8`: a 19px person icon `#8a877f`, then the name 15px/500 over the
   entity id in 10px mono `#a8a49c`, and a badge on the right — 9px mono uppercase `#7d7a72` on
   `#eae7e0`, radius 7px, `padding: 5px 8px` — reading `uit je account`. Note underneath in 10px mono
   `#a8a49c`: `hass.user gekoppeld aan person`.

   This is not a setting. Resolve it from `hass.user` (the WebSocket `auth` response carries
   `user.id` and `user.name`) and match it to the `person` entity whose `user_id` attribute equals
   that id. With no match, fall back to the name and hide the entity id. A household of five people has
   five accounts; asking each of them to pick themselves out of a list is a setting that can be wrong.
2. **Wie volg je bovenaan** — the people whose chips appear in the header, **maximum two**. One row per
   `person` entity except the logged-in user: `min-height:56px`, `padding: 0 14px`, radius 16px, and a
   20px square checkbox (radius 6px, 1.5px border, 13px check glyph). Selected: bg
   `oklch(0.68 0.13 250 / 0.12)`, border `oklch(0.68 0.13 250 / 0.35)`, box filled
   `oklch(0.42 0.12 250)` with an `#f0eeea` check. Unselected: bg `#fbfaf7`, border `#e2dfd8`, empty box
   `#cfcbc2`. Name 15px/500 over the entity id in 10px mono `#a8a49c`; the person's current state
   (`thuis` / `weg`) right-aligned in 9px mono uppercase `#7d7a72`. Tapping toggles; at two selected,
   further taps do nothing and the note reads `maximum twee — zet er een uit` instead of
   `maximaal twee chips bovenaan`. Persists as `tracked` (array of person ids) in the client config.
3. **Kamers sorteren** — one row per area: name 15px/500 + `area_id` in 9px mono, then a 44px star
   (favourite: bg `oklch(0.72 0.13 60 / 0.28)`, fg `oklch(0.45 0.11 60)`; otherwise `#eae7e0` /
   `#a8a49c`) and 44px up / down buttons (bg `#eae7e0`, fg `#57544e`, `opacity:0.25` at the ends).
   Writes `roomOrder` and `favouriteAreas`.
4. **Overig** — 60px rows: `Weer` (opens the weather sheet), `Thema`, `Tints per kamer`.

### Tab bar
**Absolutely pinned**, not part of the column flow: `position:absolute; left:0; right:0; bottom:0`,
`padding: 0 16px 22px`, `z-index:2`. Every scroll area on every tab carries `102px` of bottom padding
so its last row clears the bar. The bar cannot be scrolled away no matter how long the content is.
Inner bar height 64px, radius 22px, bg
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
- **The mode glyph sits on top of a drag surface**: it must stop `pointerdown`, `pointermove` and
  `pointerup` as well as `click`. Stopping `click` alone is not enough — the row's pointer handler
  still fires underneath and toggles power on every mode tap. This was a real bug in the prototype.
- **No cycling in the alarm either.** The chip opens the picker; only the picker sends a command. An
  arming call is followed by whatever the panel reports — do not animate an optimistic `armed_away`;
  show `arming` until the state arrives, and handle the panel rejecting the call (wrong code, open
  zone) by returning to the previous state with a toast.
- **Two followed people, not three.** The cap is a layout constraint, not a preference: a third chip
  takes the weather range's space, and the range is what the v3 header was reshaped to buy. If more
  people ever need to be visible, they go somewhere other than this line.
- **Favourites are the grid's filter.** Non-favourites are hidden until the disclosure row is tapped,
  and the fold resets on load. If the user has no favourites, show all rooms rather than an empty grid.
- No cycling anywhere in climate. The AC is cloud-controlled, so each tap costs a round trip; the
  only paths that send a command are: pick a mode in the picker, tap the row (power), release a drag
  (setpoint).
- Drag a per-lamp row → brightness; a pointer that never moved more than 6px is a tap and toggles.
  Set the drag state *before* calling `setPointerCapture`, and wrap the capture in try/catch —
  a failed capture must not kill the tap.
- Switching tab or opening the gear closes any open sheet.
- Escape and scrim tap close the sheet; focus moves into the panel on open.
- Optimistic updates: apply locally, let `state_changed` confirm.
- Non-dimmable lamps: no drag anywhere in the UI; a room with no dimmable lamp shows `aan` instead of
  a percentage.

## State
`sheet` (room id or null), `acModes` (room id whose mode picker is open, or null — cleared when the
sheet closes), `alarmModes` (boolean, whether the alarm picker is open — closes on pick and on tab
switch), `tab` (`home` | `energie` | `netwerk` | `auto` | `meer`), `showOther` (boolean, the
non-favourite fold — session only, resets on load), per-room light on/brightness, climate mode +
setpoint, media station/volume/playing.

Derived, not stored: the current user (from `hass.user` → `person` entity) and the alarm state (from
the panel entity; the prototype's local `arming` timer stands in for HA's exit delay).

Stored config: `tracked` (array of person ids, max 2), `favouriteAreas`, `roomOrder`, `areaTint`,
`theme`, `palette`. `me` is **no longer stored** — delete it from the config and read the account
instead.

## Design tokens
- Surfaces: page `#f0eeea`, card `#fbfaf7`, sheet `#f6f4f0`, control `#eae7e0`, control alt `#e6e3dc`,
  inactive chip `#e4e1da`, border `#e2dfd8`, divider `#d8d4cc`.
- Text: primary `#111318`, secondary `#57544e`, tertiary `#6e6b64`, muted `#8a877f`, faint
  `#a8a49c`, on-accent `#241a00`. `#a8a49c` is decoration only — any 9–10px label a user must read
  is `#6e6b64` or darker (`#a8a49c` at 10px measures ≈2.1:1 on the page background and fails AA).
- Accent (lights): `oklch(0.72 0.13 60)`; fills at `/0.5`, `/0.28`, `/0.2`.
- Climate: cool `oklch(0.68 0.13 250)`, heat `oklch(0.68 0.13 35)`, dry `oklch(0.70 0.12 95)`,
  fan `oklch(0.70 0.12 185)`. Alert dot `oklch(0.62 0.16 40)`.
- Room tints — personal rooms distinct, wet rooms cool, dry rooms warm:
  Living `oklch(0.74 0.07 70)`, Bureau `oklch(0.74 0.07 55)`, Dressing `oklch(0.76 0.06 95)`,
  Slaapkamer `oklch(0.62 0.10 300)`, Clara `oklch(0.72 0.11 350)`, Oliver `oklch(0.70 0.10 195)`,
  Badkamer `oklch(0.72 0.09 230)`, Waskot `oklch(0.70 0.09 245)`, Toilet `oklch(0.74 0.08 215)`.
- Type: Space Grotesk 400/500 for UI, IBM Plex Mono 400/500 for labels, ids and values. Mono labels
  are uppercase with `letter-spacing` 0.05–0.1em. Sizes used: 30, 24, 22, 20, 15, 14, 11, 10, 9px.
- Radii: 28 sheet, 24 popover, 20 tile, 20 pill, 19 popover option, 18 header chip, 16 row,
  14 button / disclosure, 12 square control, 7 badge, 6 checkbox. The tile's state glyphs have no
  container and therefore no radius.
- Spacing: 20px screen gutter, 10px grid gap, 8px row gap, 4–6px inside controls.
- Hit targets: 44px minimum, except the 36px header chips and the tile's two glyph controls (light and
  AC), which are 16px glyphs in ≈32px padded rows. They are the knowingly-small controls in the design —
  they sit inside a tile that is itself a target, and the room card holds the full-size version of both.
  The padding is not optional: it is what stops a near-miss from opening the sheet.
- Motion: `sheetUp 0.28s cubic-bezier(0.2,0.9,0.2,1)`, `fadeIn 0.18s ease`, both pickers
  `fadeIn 0.14s ease`, brightness and setpoint fill `width 0.09s linear`, arming dot
  `pulseDot 1.05s ease-in-out infinite`.
- Alarm: armed `oklch(0.62 0.15 60)`, night `oklch(0.52 0.13 250)`, disarmed `#6e6b64`.
- Presence: home `oklch(0.40 0.12 250)` on `oklch(0.68 0.13 250 / 0.18)`, away `#57544e` on `#eae7e0`.

## Assets
No images. All icons are Material Design Icons paths (already in `src/ui/icons.ts`); the gear, star,
chevron and lan icons used here are from the same set. Fonts: Space Grotesk and IBM Plex Mono, both
already bundled in `src/ui/fonts.css`.

## Files
- `Home Dashboard.dc.html` — the prototype. The **top section only** (badge `3b`, the light screen)
  is the v4 spec; the sections below it are earlier explorations and should be ignored. The Dutch notes
  printed under the screen restate the v4 changes in the user's own words.
- `support.js` — runtime required to open the prototype in a browser. Not part of the design.
- `HA_INTEGRATION.md` — WebSocket, area registry, entity selection, service calls, sparkline history
  and what stays Lovelace. Unchanged and still correct, except that the room-detail history card is
  now a plain polyline instead of a `history-graph` embed.
