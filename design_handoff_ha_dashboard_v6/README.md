# Handoff: Home Assistant dashboard — room-card background glyph (v6)

## Overview
Delta on top of v5. Everything from v5 (layout, tabs, entities, HA wiring) stays as it was. This bundle adds one visual detail to the room cards on the Home tab of `Home Dashboard.dc.html`: each card now carries its room's icon as a faint background watermark, matching the icon already assigned to that area/room type in Home Assistant.

## What changed
On the room-card grid ("Kamers", 3b tile, `v2Rooms`), each card now renders a large outline icon behind the content, bottom-right, tinted with the room's own accent colour:
- Position: `right:24px; bottom:-10px` — inset from the side, bleeding off the bottom edge.
- Size: 64×64 viewBox 24×24 (i.e. scaled up), `pointer-events:none` so it never intercepts taps.
- Colour: the room's tint (`r.tint`), at `opacity:0.07`.
- Stacking: sits behind the name/temperature/humidity text and the light/AC control glyphs — those must stay fully legible; the room-type glyph reads as texture, not content.

Four alternatives were explored side by side (see "Turn 4" at the top of `Home Dashboard.dc.html`, ids `4a`–`4d`) before settling on this treatment (closest to option **4b**, with the position tuned per feedback):
- `4a` — no glyph, tint bar only (baseline/revert)
- `4b` — large glyph bleeding off the bottom-right corner — **chosen direction**
- `4c` — small glyph top-right, higher opacity (rejected — collides with the light/AC control icons in that corner, effectively invisible)
- `4d` — full tint wash on the card background plus a bolder glyph (rejected — too loud, overpowers the room color-coding used elsewhere in the app)

## Room → icon mapping
Icons are Material Design Icons paths, matching each room's Home Assistant area type:
| Room | Icon |
| --- | --- |
| Living | sofa (`couch`) |
| Bureau | office chair (`chair`) |
| Slaapkamer, Clara, Oliver | bed (`bed`) |
| Dressing | hanger |
| Waskot | washing machine |
| Badkamer | shower |
| Toilet | toilet |

New paths live in the `ICONS` object in `Home Dashboard.dc.html`'s logic class (`couch`, `chair`, `bed`, `hanger`, `washer`, `shower`, `toiletIcon`). Each room object in `state.rooms` gained an `icon` field (the `ICONS` key); `v2Rooms` resolves it to a path via `iconD: ICONS[r.icon] || ICONS.couch`.

## Implementation for a native build
This is decorative only — no new interaction, no new state. In the target codebase:
1. Map each HA area to an icon. HA's own area registry already assigns an icon per area (visible in Settings → Areas & Zones) — reuse that icon rather than hand-mapping room names, so a renamed or newly added area gets a sensible glyph automatically.
2. Render it as an absolutely-positioned, non-interactive SVG/icon-font glyph behind the card's text content, tinted with the room's existing accent colour at very low opacity (~0.07). Keep it behind (z-index/DOM order) the name, temperature, humidity and the light/AC glyphs.
3. Don't let it affect card hit-testing (`pointer-events:none` / equivalent).

## Files
- `Home Dashboard.dc.html` — updated: room-card background glyphs (Home tab) + the "Turn 4" options canvas documenting the four explored treatments
- `Home Ruimte Opties.dc.html` — unchanged from v5
- `support.js` — runtime for the two HTML files; not part of the design
- `HA_INTEGRATION.md` — entity mapping and Home Assistant wiring, unchanged from v5
