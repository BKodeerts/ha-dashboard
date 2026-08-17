# ha-dashboard

A custom mobile-first Home Assistant frontend, built to the design handoff in
[`design_handoff_ha_dashboard/`](design_handoff_ha_dashboard/) (direction **2a** — "Dense — cards
with device badges, trend, energy").

It answers four questions at a glance — is the alarm set, is anything open, is Leen home, what are
the favourite rooms doing — and puts the common controls (lights, AC, radio) one tap from the home
screen. Heavy data views stay Home Assistant's own Lovelace cards, embedded in the shell.

```
npm install
npm run dev          # http://localhost:5173/?mock=1 — full UI, no HA needed
```

## Stack

React 19 + TypeScript + Vite, with `home-assistant-js-websocket` as the only runtime dependency
besides React. No component framework: the design is inline-style-simple, so it is plain CSS with
custom properties for the tokens.

Everything renders inside a **shadow root** with the stylesheet inlined, so the dashboard cannot
style — or be styled by — the Home Assistant frontend around it.

## Two ways to run it

Both targets mount the same `<ha-dashboard-panel>` custom element, so there is one code path.

### 1. As a Home Assistant panel (recommended)

HA handles authentication, and `hui-card` is available for the embedded Lovelace cards.

```bash
npm run build:panel      # → dist/panel/ha-dashboard-panel.js
```

Copy that one file into your HA config directory under `www/` (served as `/local/`):

```bash
cp dist/panel/ha-dashboard-panel.js /config/www/ha-dashboard-panel.js
```

Then register it in `configuration.yaml` and restart HA:

```yaml
panel_custom:
  - name: ha-dashboard-panel
    url_path: home
    sidebar_title: Home
    sidebar_icon: mdi:home-variant
    module_url: /local/ha-dashboard-panel.js
    embed_iframe: false
    require_admin: false
    # Optional: defaults for the client-side config (see "Configuration").
    # Anything the user changes in the app overrides this and is stored locally.
    config:
      favouriteAreas: [living, bureau, slaapkamer, clara, oliver]
```

The dashboard is then at `/home`. Bump the filename (or add `?v=2`) when you deploy a new build —
HA caches `/local/` aggressively.

### 2. Standalone

```bash
npm run build:app        # → dist/
```

Serve `dist/` from anywhere. On first load the app runs Home Assistant's OAuth flow and stores the
refresh token in `localStorage`; it asks for the HA URL if `VITE_HASS_URL` is not set.

```bash
VITE_HASS_URL=http://homeassistant.local:8123 npm run build:app
```

A long-lived token can be supplied with `VITE_HASS_TOKEN`, but **that bakes the token into the
bundle** — only do it for a kiosk device on a trusted network, or better, put a server-side proxy in
front and keep the token there.

Standalone has no access to HA's card registry, so the Lovelace embeds degrade to a footnote naming
what would be there. Everything else works identically.

## How the room list is built

Rooms come from the **area registry**, not from a hand-written list. At startup the app fetches the
area, device and entity registries once, resolves each entity to an area (directly via
`entity.area_id`, or through its device), and buckets the result:

| Card slot | Selector |
| --- | --- |
| Temperature | `sensor` with `device_class: temperature` (prefers the one whose name matches the area) |
| Humidity | `sensor` with `device_class: humidity` |
| Lights icon | every `light.*` in the area |
| AC icon | `climate.*` in the area |
| Radio icon | `media_player.*` in the area |
| Window / door | `binary_sensor` with `device_class` `window` / `door` / `garage_door` |
| Motion | `binary_sensor` with `device_class` `motion` / `occupancy` |
| Smoke | `binary_sensor` with `device_class: smoke` |
| Camera | `camera.*` in the area |

**Adding a device in HA and assigning it to an area is the only step needed for it to appear here.**
Hidden, disabled and config/diagnostic entities are skipped. Areas with nothing to show are dropped.
The app re-reads the registries when HA reports a registry change, so no reload is needed.

One WebSocket subscription (`subscribeEntities`) feeds the whole home screen. The sparklines add one
`history/history_during_period` call per temperature sensor, cached for five minutes.

## Configuration

Everything user-specific is client-side — a JSON blob in `localStorage` under
`ha-dashboard.config.v1`, layered over `panel_custom`'s `config:` block, layered over the defaults.
No YAML edit is needed to change a favourite or a colour.

Tap the **room-count line** in the "Kamers" header (`5 favoriet · 10 totaal`) to open the settings
sheet: favourites, accent hue, and reset.

Everything that is left blank is derived from the state machine on first run:

| Key | Type | Default when unset |
| --- | --- | --- |
| `favouriteAreas` | `string[]` | first five areas that have a light, climate or media player |
| `areaTint` | `Record<areaId, string>` | the design's nine tints by area name, then a cycling palette |
| `roomOrder` | `string[]` | area registry order |
| `accent` | `string` | amber `oklch(0.72 0.13 60)`; also ships blue, green, magenta |
| `alarmEntity` | `string` | first `alarm_control_panel.*` |
| `personEntity` | `string` | first `person.*` |
| `weatherEntity` | `string` | first `weather.*` |
| `power.solar` / `.consumption` / `.grid` | `string` | a `device_class: power` sensor matched by name |
| `power.loads` | `string[]` | the remaining power sensors, sorted by value at render time |
| `mediaPresets` | `Record<playerId, {name, media_content_id, media_content_type}[]>` | none — the preset row is hidden |
| `lovelace.*` | card configs | sensible per-sheet defaults, see below |

Example, set from the browser console:

```js
localStorage.setItem('ha-dashboard.config.v1', JSON.stringify({
  favouriteAreas: ['living', 'bureau', 'slaapkamer', 'clara', 'oliver'],
  power: { solar: 'sensor.zonnepanelen_vermogen', consumption: 'sensor.verbruik_vermogen' },
  mediaPresets: {
    'media_player.living_radio': [
      { name: 'Studio Brussel', media_content_type: 'music', media_content_id: 'https://…/stubru.mp3' },
      { name: 'Willy',          media_content_type: 'music', media_content_id: 'https://…/willy.mp3' },
      { name: 'Klara',          media_content_type: 'music', media_content_id: 'https://…/klara.mp3' },
    ],
  },
  lovelace: {
    energy: [{ type: 'energy-distribution' }, { type: 'energy-usage-graph' }],
    netwerk: [{ type: 'entities', entities: ['sensor.wan_download', 'sensor.wan_upload'] }],
  },
}));
```

## What stays Lovelace

These are embedded rather than rebuilt — they are where HA's own cards are worth more than a
rewrite, and where the old dashboard's maintenance came from:

| Where | Config key | Default card |
| --- | --- | --- |
| Power sheet + `energie` tab | `lovelace.energy` | none — set it to your energy cards |
| Room sheet history | `lovelace.roomHistory` | `history-graph` over the room's temp + humidity |
| Presence sheet | `lovelace.map` | `map` for the person entity |
| Weather sheet | `lovelace.forecast` | `weather-forecast` |
| Room sheet camera | — | `picture-entity` when the area has a camera |
| `netwerk` / `auto` tabs | `lovelace.netwerk`, `lovelace.auto` | none — empty state explains how to set them |

Mounting uses `hui-card` when it is defined, falling back to `window.loadCardHelpers()`. Cards
inherit HA's theme through the shadow boundary (custom properties cross it), so aligning your HA
theme to these tokens makes the embeds blend in.

## Interaction notes

- Room card tap opens the room sheet; **icon-button taps stop propagation** and only make the
  service call.
- Lights icon: if any light in the room is on, turn them all off; else turn them all on.
- Writes are **optimistic** — the UI flips immediately, the incoming `state_changed` confirms it, and
  a failure reverts the flip and raises a toast. Unconfirmed overlays expire after 5 s.
- The alarm pill opens an arm/disarm sheet with code entry (the prototype only cycled the state).
  The code field appears when the panel declares a `code_format`, and arming skips it when
  `code_arm_required` is false.
- The `stroom` tab opens the power sheet, as designed. `energie`, `netwerk` and `auto` are their own
  views, per the handoff's production note.
- Every 30 × 30 icon button carries a ≥ 44 × 44 hit area via a pseudo-element, without changing its
  visual size. `Escape` closes any sheet; `prefers-reduced-motion` drops the transforms.
- The last entity snapshot is cached in `localStorage`, so a cold start paints real values before the
  socket connects. A dropped socket shows a subdued banner, not an error screen.

## Fonts

Space Grotesk (400, 500) and IBM Plex Mono (400, 500), self-hosted as data URIs in
`src/ui/fonts.css` — no CDN request, which matters for LAN-only tablets. Regenerate with:

```bash
node scripts/fetch-fonts.mjs
```

`@font-face` is ignored inside a shadow root, so those rules are injected into the document head.
Set `fonts="off"` on the element to skip that and supply the families yourself.

## Deviations from the handoff

Small, deliberate, and listed so they are easy to reverse:

- **Numbers use the `nl-BE` locale** (`24,2°`, `1.877 W`), matching the design's own power values.
  Pressure is printed without a thousands separator (`1015 hPa`) as the design shows.
- **The room-count line is a button** so the settings sheet has a way in. It is styled identically to
  the static text in the design.
- **Weather glyphs are the MDI placeholders** the handoff shipped, behind the single `WEATHER_ICONS`
  lookup in `src/ui/icons.ts` — pointing that map at Meteocons is the whole swap. Conditions with no
  verified MDI path map to the nearest available glyph rather than to an invented one.
- **The room sheet also embeds a history graph and, when the area has one, a camera card** — the
  handoff lists both under "what stays Lovelace" but the prototype had no slot for them.
- The prototype's 44px phone radius is dropped: the real app is full-bleed and uses safe-area insets.

## Project layout

```
src/
  element.tsx        the <ha-dashboard-panel> custom element (shadow root, backend selection)
  panel.ts           entry for the HA panel build
  main.tsx           entry for the standalone build / dev server
  app/App.tsx        screen composition, sheet + tab state
  ha/
    backend.ts       panel and standalone connections, snapshot cache
    mock.ts          a stand-in Home Assistant, same interface as the live socket
    registry.ts      area/device/entity registries → per-area device buckets
    selectors.ts     rooms, openings, alarm, presence, weather, power; formatting
    services.ts      every write, each with its optimistic patch
    history.ts       sparkline fetch, downsample, polyline points
    HassProvider.tsx the one subscription, the optimistic overlay, config resolution
  components/        header, pills, room grid/card, tab bar, sheets, Lovelace mount
  config/config.ts   client-side config, defaults and derivation
  ui/                icons, tokens + layout CSS, self-hosted fonts
scripts/
  fetch-fonts.mjs    regenerates src/ui/fonts.css
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server; add `?mock=1` for the mock backend |
| `npm run build` | both targets |
| `npm run build:app` | standalone SPA → `dist/` |
| `npm run build:panel` | HA panel module → `dist/panel/` |
| `npm run typecheck` | `tsc --noEmit` |
