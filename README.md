# ha-dashboard

A custom mobile-first Home Assistant frontend, built to the **v2** design handoff in
[`design_handoff_ha_dashboard_v2/`](design_handoff_ha_dashboard_v2/) (section `3b` — "Tegel opent de
kamer, lichtchip schakelt").

It answers three questions at a glance — is the alarm set, is anything open, where is the other
person — and puts the lights one tap from the home screen. Everything a tile cannot hold lives in
the room card: per-lamp brightness, the AC, the radio, and the room's own 24 h temperature line.

Four tabs, each a real view: **Home**, **Energie**, **Netwerk**, **Auto**. The bottom bar is always
visible and always tappable — sheets stop 96 px above it. Heavy data views (the energy dashboard,
the car cards) stay Home Assistant's own Lovelace cards, embedded in the shell.

### What changed in v2

| v1 (rejected on UX grounds) | v2 |
| --- | --- |
| 5 tabs; `Stroom` opened a modal instead of a view | 4 tabs, each a real view |
| A sheet could cover the bottom bar | Bar always visible; sheets stop 96 px above it, and switching tab dismisses any sheet |
| Room card held large Lovelace temp + humidity graphs | One reading line and a single 24 h sparkline, no embeds |
| Lights on/off only | Per-lamp brightness in the room card, non-dimmable lamps handled explicitly |
| 30 px icon buttons nested in a tappable card | One 34 px light chip; every other target ≥ 44 px |
| State written as text ("AC uit") | Coloured state icons, read at a glance |
| Favourites/others fold | All rooms in one scroll, favourites first, order user-defined |
| Settings hidden behind a text link | Gear button next to "Kamers" |

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

## Three ways to run it

All of them mount the same `<ha-dashboard-panel>` custom element, so there is one code path.

### 1. As a Home Assistant panel, via HACS (recommended)

HA handles authentication, `hui-card` is available for the embedded Lovelace cards, and updates are
one click — no file copying.

1. HACS → ⋮ → **Custom repositories** → add `BKodeerts/ha-dashboard`, type **Dashboard**.
2. Find "Home dashboard" in HACS and **Download**. It lands at
   `/config/www/community/ha-dashboard/ha-dashboard-panel.js`, served as `/hacsfiles/…`.
3. Add the panel to `configuration.yaml` (once — later updates never touch this):

```yaml
panel_custom:
  - name: ha-dashboard-panel
    url_path: home
    sidebar_title: Home
    sidebar_icon: mdi:home-variant
    module_url: /hacsfiles/ha-dashboard/ha-dashboard-panel.js
    embed_iframe: false
    require_admin: false
    # Optional: defaults for the client-side config (see "Configuration").
    # Anything the user changes in the app overrides this and is stored locally.
    config:
      favouriteAreas: [living, bureau, slaapkamer, clara, oliver]
```

4. Restart Home Assistant — a YAML reload will not register a new panel. The dashboard is at `/home`.

Three fields matter and are easy to get wrong:

- `name` **must** be `ha-dashboard-panel` — it is the custom element the bundle registers.
- `module_url`, not `js_url` — the build is an ES module.
- `embed_iframe: false` is required. Inside an iframe the panel never receives `hass`, so there is
  no data and no Lovelace embeds.

Releases are built by CI (`.github/workflows/release.yml`) and the panel is attached as a release
asset, which is what HACS downloads. To cut one:

```bash
npm version patch && git push --follow-tags
```

HACS then offers the update in Home Assistant.

### 2. As a Home Assistant panel, manually

Same thing without HACS, if you would rather not add the custom repository:

```bash
npm run build:panel                                        # → dist/panel/ha-dashboard-panel.js
scp dist/panel/ha-dashboard-panel.js root@homeassistant.local:/config/www/
```

Use `module_url: /local/ha-dashboard-panel.js` in the snippet above. HA caches `/local/`
aggressively, so bump `?v=2` on every redeploy — this is the copying that HACS saves you.

### 3. Standalone

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

| Tile / room-card slot | Selector |
| --- | --- |
| Temperature | `sensor` with `device_class: temperature` (prefers the one whose name matches the area) |
| Humidity | `sensor` with `device_class: humidity` |
| Light chip + per-lamp rows | every `light.*` in the area |
| AC chip + climate row | `climate.*` in the area |
| Radio chip + media row | `media_player.*` in the area |
| Window chip | `binary_sensor` with `device_class` `window` / `door` / `garage_door` |

**Adding a device in HA and assigning it to an area is the only step needed for it to appear here.**
Hidden, disabled and config/diagnostic entities are skipped. Areas with nothing to show are dropped.
The app re-reads the registries when HA reports a registry change, so no reload is needed.

A lamp counts as **dimmable** when its `supported_color_modes` lists anything other than `onoff`
(or, for older integrations, when it reports a `brightness` attribute). Non-dimmable lamps get a
tap-only row and the room's light chip reads `aan` rather than a percentage.

One WebSocket subscription (`subscribeEntities`) feeds the whole home screen. The room card's
temperature line adds one `history/history_during_period` call per temperature sensor (~28 points,
cached for five minutes).

### Netwerk: what has gone quiet

The Netwerk tab is **not** a card page. It compares each entity's `last_updated` to now and lists
what has not reported in over 24 hours — dead batteries, dropped Zigbee nodes, offline bridges.
Entities are **grouped by device**, so one silent sensor produces one row rather than five, and a
device counts as silent only when *none* of its entities has reported. The battery percentage comes
from the `device_class: battery` sensor on the same device. Past 48 h the badge turns amber and the
tab grows a dot.

Entities belonging to a disabled device are skipped, as are the domains that are legitimately quiet
for months (`automation`, `script`, `scene`, the `input_*` helpers, `zone`, …) — listing them would
bury the devices that are actually broken.

## Configuration

Everything user-specific is client-side — a JSON blob in `localStorage` under
`ha-dashboard.config.v2`, layered over `panel_custom`'s `config:` block, layered over the defaults.
No YAML edit is needed to change a favourite or a colour.

The **gear next to "Kamers"** opens the settings view: who you are, room order and favourites, and
the display odds and ends (weather, light/dark, colours, per-room tints).

Everything that is left blank is derived from the state machine on first run:

| Key | Type | Default when unset |
| --- | --- | --- |
| `favouriteAreas` | `string[]` | first five areas that have a light, climate or media player |
| `areaTint` | `Record<areaId, string>` | the v2 handoff's nine tints by area name, then a cycling palette |
| `roomOrder` | `string[]` | area registry order (favourites always sort first) |
| `theme` | `'auto' \| 'light' \| 'dark'` | `auto` — follows Home Assistant's own light/dark setting |
| `palette` | `'ha' \| 'design'` | `ha` — surfaces and text come from HA's active theme, see below |
| `me` | `string` | first `person.*` — the presence pill then shows *the other one* |
| `alarmEntity` | `string` | first `alarm_control_panel.*` |
| `weatherEntity` | `string` | first `weather.*` |
| `power.solar` / `.consumption` / `.grid` | `string` | a `device_class: power` sensor matched by name |
| `power.loads` | `string[]` | the remaining power sensors, sorted by value at render time |
| `power.scale` | `number` | `2000` — full scale of the two bars on the Energie tab, in watts |
| `car.name` / `.battery` / `.range` | `string` | none — the Auto tab's title and subtitle |
| `mediaPresets` | `Record<playerId, {name, media_content_id, media_content_type}[]>` | none — the preset row is hidden |
| `lovelace.*` | card configs | sensible per-surface defaults, see below |

Example, set from the browser console:

```js
localStorage.setItem('ha-dashboard.config.v2', JSON.stringify({
  favouriteAreas: ['living', 'bureau', 'slaapkamer', 'clara', 'oliver'],
  me: 'person.bart',
  power: { solar: 'sensor.zonnepanelen_vermogen', consumption: 'sensor.verbruik_vermogen' },
  car: { name: 'Kona electric', battery: 'sensor.kona_battery', range: 'sensor.kona_range' },
  mediaPresets: {
    'media_player.living_radio': [
      { name: 'Studio Brussel', media_content_type: 'music', media_content_id: 'https://…/stubru.mp3' },
      { name: 'Willy',          media_content_type: 'music', media_content_id: 'https://…/willy.mp3' },
      { name: 'Klara',          media_content_type: 'music', media_content_id: 'https://…/klara.mp3' },
    ],
  },
  lovelace: {
    energy: [{ type: 'energy-distribution' }, { type: 'energy-usage-graph' }],
    auto: [{ type: 'entities', entities: ['sensor.kona_battery', 'sensor.kona_range'] }],
  },
}));
```

v1's `accent`, `personEntity`, `lovelace.netwerk` and `lovelace.roomHistory` are gone: the accent is
fixed at amber, the person entity is derived from `me`, Netwerk is no longer a card page, and the
room card draws its own history line. The storage key changed with them, so a v1 install starts
from the derived defaults rather than half-reading an old shape.

## Following Home Assistant's theme

Home Assistant publishes its active theme as custom properties on `document.documentElement`, and
custom properties are one of the few things that cross a shadow boundary. So although no rule of
ours escapes the shadow root and no rule of HA's reaches our elements, the *values* of HA's theme
are readable in here — which is the seam `palette: 'ha'` (the default) uses.

What it takes: the page, card, sheet, control, chip, border and divider surfaces, and the text
colours. Nothing else. The amber accent, the hvac hues, the alarm and presence colours, the per-room
tints, Space Grotesk and IBM Plex Mono, and every radius and spacing value stay the handoff's — they
carry meaning HA has no token for, and they are what makes this dashboard look like itself. Set
`palette: 'design'` (Overig → Kleuren) to pin the neutrals back to the handoff too.

| Token | Taken from |
| --- | --- |
| `--page` | `--primary-background-color` |
| `--card`, `--sheet` | `--ha-card-background`, else `--card-background-color` |
| `--control`, `--chip-off` | `--secondary-background-color` |
| `--control-alt` | `--ha-color-fill-neutral-normal-hover`, else `--secondary-background-color` |
| `--border`, `--divider` | `--divider-color` |
| `--text`, `--text-body` | `--primary-text-color` |
| `--text-2`, `--text-muted`, `--text-dim` | `--secondary-text-color` |
| `--text-faint` | `--disabled-text-color` |

Two details make this safe to leave on:

- **No dark variant is needed.** HA's variables already flip with its dark mode, and this app's
  `data-theme` is derived from that same `themes.darkMode`, so both halves of the palette turn over
  together.
- **Absent variables fall back, per token.** Each mapping is a bare `var()` with no fallback of its
  own, so where a variable does not exist — the standalone and mock builds, or an HA old enough not
  to publish it — the alias computes to nothing and the token's handoff value paints instead. That
  is why `palette: 'ha'` looks exactly like `palette: 'design'` outside a panel, and why a theme
  that only sets the classic variables loses no more than a hover shade.

## What stays Lovelace

These are embedded rather than rebuilt — they are where HA's own cards are worth more than a
rewrite, and where the old dashboard's maintenance came from:

| Where | Config key | Default card |
| --- | --- | --- |
| Bottom of the `energie` tab | `lovelace.energy` | none — set it to your energy cards |
| `auto` tab | `lovelace.auto` | none — empty state explains how to set it |
| Presence sheet | `lovelace.map` | `map` for the person entity |
| Weather sheet | `lovelace.forecast` | `weather-forecast` |

**The room card embeds nothing.** v1 put a `history-graph` and a camera card in there, which is what
made it slow and unreadable on a phone; v2 draws a plain polyline in the room's tint instead.
Netwerk is a computed list, not a card page.

Mounting uses `hui-card` when it is defined, falling back to `window.loadCardHelpers()`. Cards
inherit HA's theme through the shadow boundary (custom properties cross it) — and with the default
`palette: 'ha'` the shell around them reads that same theme, so an embed and the sheet holding it
are painted from one source.

## Interaction notes

- Tile body tap opens the room card; the **light chip stops propagation** and only toggles.
- Light chip: if any light in the room is on, turn them all off; else turn them all on.
- **Per-lamp rows** drag horizontally to set brightness and tap to toggle. A pointer that never
  travelled more than 6 px is a tap. The drag state is set *before* `setPointerCapture`, and the
  capture is wrapped in `try`/`catch` — a failed capture must not kill the tap. Rows use
  `touch-action: pan-y` so a finger starting on a lamp can still scroll the sheet.
- Non-dimmable lamps drag nowhere: tap only, `cursor: pointer`, and an `aan`/`uit` label.
- The climate **mode button cycles** through the modes the unit reports (`hvac_modes`). It is the
  only way to reach the four modes the design colours, so a plain on/off toggle would leave three of
  them unreachable.
- **State chips are read-only and always rendered** for a device the room has, active or not, so the
  light chip beside them never moves under your thumb.
- Writes are **optimistic** — the UI flips immediately, the incoming `state_changed` confirms it, and
  a failure reverts the flip and raises a toast. Unconfirmed overlays expire after 5 s.
- The alarm pill opens an arm/disarm sheet with code entry (the prototype only cycled the state).
  The code field appears when the panel declares a `code_format`, and arming skips it when
  `code_arm_required` is false.
- **Sheets never cover the tab bar**: the scrim sits at `z-index: 1` and the bar at `2`, and the
  panel stops 96 px above the bottom. Switching tab, opening the gear, `Escape` or a scrim tap all
  dismiss it; `prefers-reduced-motion` drops the transforms.
- Hit targets are ≥ 44 px throughout, except the 34 px light chip and the 26 px read-only state
  chips, which are not tappable.
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
- **Weather glyphs are the MDI placeholders** the handoff shipped, behind the single `WEATHER_ICONS`
  lookup in `src/ui/icons.ts` — pointing that map at Meteocons is the whole swap. Conditions with no
  verified MDI path map to the nearest available glyph rather than to an invented one.
- **The handoff shows the light scheme only.** The app follows Home Assistant's light/dark setting,
  so `src/ui/styles.css` carries a dark set that mirrors the specified one role for role — same
  tokens, no rule below them knows which is painting.
- **Lamp rows use `touch-action: pan-y`, not the specified `none`.** The room card can hold several
  lamps plus climate and media, and `none` would make a finger that starts on a lamp unable to
  scroll past it. Horizontal drag still belongs to the row.
- **The Netwerk row's entity id is what truncates**, not the whole meta line — a dead-battery list
  that ellipsises its battery percentage is hiding its own answer.
- **The climate mode button cycles**; the handoff specifies the button's four colours but not how
  the mode is chosen.
- **"Standaardwaarden herstellen" sits below the "Overig" rows** rather than being one of them, so
  the specified block stays as drawn while the escape hatch survives from v1.
- **Surfaces and text follow Home Assistant's theme by default** — see "Following Home Assistant's
  theme". The handoff's own palette is one tap away under Overig → Kleuren, and is what paints
  wherever there is no HA theme to read.
- The prototype's 44 px phone radius is dropped: the real app is full-bleed and uses safe-area
  insets.
- **The top block is tighter than the handoff's and the tab bar sits lower.** The handoff draws a
  390 × 844 artboard with no status bar; on a real phone its 52 px weather inset lands *below* the
  notch inset, and the header block ate a third of the screen before the first room card. The
  weather block now starts at `max(16px, safe-area-inset-top + 8px)`, the pill row at 12 px with
  42 px pills, and the section head at 10 px — about 70 px back for the room grid. The bar's own
  drop from the bottom edge goes from 22 px to `--bar-drop: 8px` on top of the home-indicator
  inset, so it reads as anchored rather than floating. Everything that measures itself against the
  bar (the sheet panel's `bottom` and `max-height`, the toasts) derives from `--bar-space` instead
  of repeating the handoff's 96/104 px.

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
    selectors.ts     rooms, lamps, climate, openings, alarm, presence, weather, power; formatting
    stale.ts         the Netwerk list: entities grouped by device, silent over 24 h
    services.ts      every write, each with its optimistic patch
    history.ts       sparkline fetch, downsample, polyline points
    HassProvider.tsx the one subscription, the optimistic overlay, config resolution
  components/
    WeatherBlock     the centred weather header
    StatusPills      alarm / openings / presence
    RoomGrid, RoomTile
    TabBar           four tabs, with the energy-flow and stale indicators
    Sheet            scrim + panel chrome, sitting below the tab bar
    sheets/          room card, weather, alarm, openings, presence
    views/           Energie, Netwerk, Auto, Settings
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
