# ha-dashboard

A custom mobile-first Home Assistant frontend, built to the **v4** design handoff in
[`design_handoff_ha_dashboard_v4/`](design_handoff_ha_dashboard_v4/) (section `3b` — "Tegel opent de
kamer, lichtchip schakelt").

It answers three questions at a glance — is the alarm set, is anything open, who is home — and puts
the lights one tap from the home screen. Everything a tile cannot hold lives in the room card:
per-lamp brightness, the AC, the radio, and the room's own 24 h temperature line.

Four tabs, each a real view: **Home**, **Energie**, **Netwerk**, **Auto**. The bottom bar is
absolutely pinned to the bottom of the screen — no amount of content scrolls it away — and sheets
stop above it. Heavy data views (the energy dashboard, the car cards) stay Home Assistant's own
Lovelace cards, embedded in the shell.

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

### What changed in v3

v3 compresses the top of the home screen and rebuilds the climate control. Everything else in the
v2 spec stands.

| v2 | v3 |
| --- | --- |
| Centred weather stack + three wrapping pills (~210 px before the rooms) | One weather line + a person chip on the right, then one pill row (~110 px) |
| Presence was the third pill | Presence is a fixed chip at the top right, so the two exception pills always fit on one line |
| Climate: power button, mode dropdown and a −/+ pair (~100 px) | One 54 px row — drag sets the setpoint, tap switches the unit, the glyph opens a mode picker |
| Mode reached through a dropdown | A floating five-way picker that sends exactly one command per pick and never cycles |

### What changed in v4

v4 gives the alarm and presence the treatment v3 gave the climate row, and makes favourites mean
something. Everything else in the v2/v3 spec stands.

| v3 | v4 |
| --- | --- |
| Alarm was a word in the pill row, armed from a sheet | An icon-only chip beside the person chips, with a floating state picker — one tap, one command |
| Alarm state written out (`Alarm uit`) | A shield glyph and a 6 px dot carry four states; `arming` pulses through the panel's exit delay |
| The picker's modes were the three the design drew | Read off the panel's own `supported_features`, so a device without `arm_night` shows one chip fewer |
| One person chip; "who am I" was a setting | The people you *follow*, up to two — and who you are comes from `hass.user`, not from a list you can get wrong |
| Favourites only sorted the grid | Favourites **are** the grid; the rest unfold from one disclosure row |
| Tile chips: 26 px plates in a row under the reading | Bare 16 px glyphs in a column at the tile's right edge, fixed priority, three at a time |
| Tab bar sat in the flex column | Absolutely pinned to the bottom of the frame; every scroll area pads to clear it |

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
| Light glyph (a toggle) + per-lamp rows | every `light.*` in the area |
| AC glyph (a toggle) + climate row | `climate.*` in the area |
| Radio glyph + media row | `media_player.*` in the area |
| Window glyph (only while open) | `binary_sensor` with `device_class` `window` / `door` / `garage_door` |

The tile shows **three glyphs at most**, in a fixed priority: light › radio › open window › AC.
Anything past the third is only in the room card — in a room with a radio *and* an open window that
drops the AC glyph, and with it the setpoint, which is the trade the design makes on purpose: the
exceptions matter more at a glance than the temperature the unit is holding.

**Adding a device in HA and assigning it to an area is the only step needed for it to appear here.**
Hidden, disabled and config/diagnostic entities are skipped. Areas with nothing to show are dropped.
The app re-reads the registries when HA reports a registry change, so no reload is needed.

A lamp counts as **dimmable** when its `supported_color_modes` lists anything other than `onoff`
(or, for older integrations, when it reports a `brightness` attribute). Non-dimmable lamps get a
tap-only row in the room card, never a fill they could be left in the middle of.

**Favourites are the grid's filter.** The home screen shows favourite rooms only; the rest are one
tap below, behind a disclosure row that resets to collapsed on every load. With no favourites set at
all it shows every room rather than an empty grid.

### Who you are, and who you follow

The dashboard reads **who is holding the phone off the Home Assistant account**, not off a setting:
it takes `hass.user` (or `auth/current_user` in standalone mode) and matches it to the `person`
entity whose `user_id` attribute is that account's id. A household of five people has five accounts,
and asking each of them to pick themselves out of a list is a setting that can be wrong.

The chips at the top right are the people you chose to *follow* — **at most two**, and the cap is a
layout constraint rather than a taste: a third chip takes exactly the space the weather's hi/lo range
needs, and that range is what the v3 header was reshaped to buy. One followed person shows their
name; two drop to glyph and dot. The logged-in user is never one of them.

### The alarm

The alarm sits beside the person chips as an icon-only chip. Tapping it opens a floating picker;
**only a pick sends a command** — nothing cycles, because an arm or disarm is a round trip a panel
has to acknowledge and a half-applied one is worse than none.

Which options the picker offers comes from the device: the `alarm_control_panel`'s
`supported_features` bitmask (`ARM_HOME` 1, `ARM_AWAY` 2, `ARM_NIGHT` 4, `ARM_VACATION` 32,
`ARM_CUSTOM_BYPASS` 16), with `Uit` always available. A panel that publishes nothing falls back to
`Weg` and `Uit`. If the panel declares a `code_format`, the picker asks for the code in place rather
than firing a call it knows will be rejected — always for disarming, and for arming when
`code_arm_required` is set.

Arming is **never painted optimistically as armed**. HA reports `arming` while the exit delay runs,
and that is what the chip shows — with its dot pulsing — until the panel reports the armed state
itself. A rejected call (wrong code, open zone) drops back to the previous state with a toast.

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

The **gear next to "Kamers"** opens the settings view: who you are (read-only — it comes from your
account), who you follow at the top of the home screen, room order and favourites, and the display
odds and ends (weather, light/dark, colours, per-room tints).

Everything that is left blank is derived from the state machine on first run:

| Key | Type | Default when unset |
| --- | --- | --- |
| `favouriteAreas` | `string[]` | first five areas that have a light, climate or media player |
| `areaTint` | `Record<areaId, string>` | the handoff's nine tints by area name, then a cycling palette |
| `roomOrder` | `string[]` | area registry order (favourites always sort first) |
| `theme` | `'auto' \| 'light' \| 'dark'` | `auto` — follows Home Assistant's own light/dark setting |
| `palette` | `'ha' \| 'design'` | `ha` — surfaces and text come from HA's active theme, see below |
| `tracked` | `string[]` | every `person.*` except your own account's, capped at two |
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
  tracked: ['person.leen', 'person.nora'],
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
fixed at amber, Netwerk is no longer a card page, and the room card draws its own history line. The
storage key changed with them, so a v1 install starts from the derived defaults rather than
half-reading an old shape.

**v4 drops `me`.** It is stripped on read rather than migrated — it was a *guess* the user made
about themselves, and the account is the answer — so an existing install keeps its favourites, order
and tints and simply stops storing who you are. The storage key is unchanged for the same reason.

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

- Tile body tap opens the room card; the **light and AC chips stop propagation** and only toggle.
  The same holds for the keyboard: the tile ignores `Enter`/`Space` that started on a chip inside
  it, so activating a chip does not also open the card on top of it.
- Light chip: if any light in the room is on, turn them all off; else turn them all on.
- **AC chip**: switches the unit off, or back on in `preferredHvacMode` — `cool` when the unit
  offers it, else its first non-`off` mode. HA remembers no previous mode, so there is nothing
  truer to return to; picking a specific one is the sheet's job.
- **Per-lamp rows** drag horizontally to set brightness and tap to toggle. A pointer that never
  travelled more than 6 px is a tap. The drag state is set *before* `setPointerCapture`, and the
  capture is wrapped in `try`/`catch` — a failed capture must not kill the tap. Rows use
  `touch-action: pan-y` so a finger starting on a lamp can still scroll the sheet.
- Non-dimmable lamps drag nowhere: tap only, `cursor: pointer`, and an `aan`/`uit` label.
- The room card's climate row is a **power button plus a mode dropdown**. The button toggles on/off
  and wears the mode's hue; the `<select>` beside it lists the unit's own `hvac_modes` — `off`
  included where the unit reports one, so its value is always the entity's real state and never a
  guess. A mode the unit reports but the design does not colour (`auto`, `heat_cool`) is de-slugged
  for the list rather than shown as the catch-all `Aan`. The dropdown is hidden when a unit reports
  fewer than two modes.
- **State chips are rendered for a device the room has**, active or not, so the light chip beside
  them never moves under your thumb. The radio and window chips are read-only glyphs; the AC chip
  is a control, and wears the light chip's 34 px shape to say so. The window chip is the exception — a shut
  house is the normal state and says nothing, so it appears only while an opening is open. It is
  last in the row, so it moves nothing when it comes and goes.
- Writes are **optimistic** — the UI flips immediately, the incoming `state_changed` confirms it, and
  a failure reverts the flip and raises a toast. Unconfirmed overlays expire after 5 s.
- The alarm pill opens an arm/disarm sheet with code entry (the prototype only cycled the state).
  The code field appears when the panel declares a `code_format`, and arming skips it when
  `code_arm_required` is false.
- **Sheets never cover the tab bar**: the scrim sits at `z-index: 1` and the bar at `2`, and the
  panel stops a bar's height above the bottom (`--bar-space`). Switching tab, opening the gear, `Escape` or a scrim tap all
  dismiss it; `prefers-reduced-motion` drops the transforms.
- Hit targets are ≥ 44 px throughout, except the two 34 px chips on a tile — light and AC. The
  26 px state chips are read-only and not targets at all.
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
- **The climate row runs on the unit's own temperature range**, not a hardcoded 16–30. The fill and
  the drag read `min_temp`/`max_temp` (which are 16 and 30 on this hardware, so it draws as
  specified) and round to the unit's `target_temp_step`, so a drag can never send a value the unit
  rejects. The row also uses `touch-action: pan-y` rather than the specified `none`, for the same
  reason the lamp rows do.
- **The mode picker offers what the unit reports.** The handoff draws five fixed options; a mode the
  unit does not list is dropped rather than offered as a command it would reject, and any extra mode
  it does list (`auto`, `heat_cool`) is appended before `Uit` instead of being unreachable.
- **Both floating pickers can wrap.** The handoff draws them as one row of `white-space: nowrap`
  options, which is what they are at the sizes it draws. Because the alarm's options come from the
  panel rather than from the design, a device advertising every arm mode would run off the screen
  edge, so both pickers carry a `max-width` and may fold to a second line. The alarm picker also
  needs `width: max-content`: its containing block is the 36 px chip, and an absolutely positioned
  auto-width box is shrink-to-fit against *that*, which folds the options one per line.
- **`triggered` wears the armed treatment and does not animate.** The handoff gives the pulse to
  `arming` alone and says no other state animates, so a triggered panel reads as loud-but-still.
  What that state actually needs is a siren, not a dot.
- **The gear button is 44 px**, as the handoff specifies and the "44 px minimum" rule requires. It
  had drifted to 40 px.
- The section head keeps the tighter **10 px** top padding it was given after v2 rather than the
  handoff's 20 px — see the safe-area note below.
- **"Standaardwaarden herstellen" sits below the "Overig" rows** rather than being one of them, so
  the specified block stays as drawn while the escape hatch survives from v1.
- **Surfaces and text follow Home Assistant's theme by default** — see "Following Home Assistant's
  theme". The handoff's own palette is one tap away under Overig → Kleuren, and is what paints
  wherever there is no HA theme to read.
- The prototype's 44 px phone radius is dropped: the real app is full-bleed and uses safe-area
  insets.
- **The top inset and the tab bar's drop follow the device, not the artboard.** The handoff draws a
  390 × 844 artboard with no status bar, so its 44 px top padding lands *below* the notch inset on a
  real phone; the top line starts at `max(16px, safe-area-inset-top + 8px)` instead. The bar's drop
  from the bottom edge goes from 22 px to `--bar-drop: 8px` on top of the home-indicator inset, so
  it reads as anchored rather than floating, and the section head keeps the tighter 10 px it was
  given after v2. Everything that measures itself against the bar (the sheet panel's `bottom` and
  `max-height`, the toasts, and every scroll area's bottom padding) derives from `--bar-space`
  instead of repeating the handoff's 96/102/104 px — so the v4 scroll padding is
  `--bar-space + 16px`, which is the handoff's 102 px measured against a 22 px bar drop.
- **The tab bar is inverted**, not the handoff's `#fbfaf7` on the page: its ground is the page's ink
  and its ink the page, so it stays a solid block against whatever scrolls under it. That was a
  deliberate change after v3 (`Invert the tab bar so it contrasts with the page`) and v4 repeats the
  v3 wording without commenting on it, so it stands. Its tones are the *other* scheme's, because
  they have to carry on that flipped ground.

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
    selectors.ts     rooms, lamps, climate, openings, alarm, people, weather, power; formatting
    stale.ts         the Netwerk list: entities grouped by device, silent over 24 h
    services.ts      every write, each with its optimistic patch
    history.ts       sparkline fetch, downsample, polyline points
    HassProvider.tsx the one subscription, the optimistic overlay, config resolution
  components/
    TopLine          the weather line, the alarm chip and the person chips
    AlarmChip        icon-only alarm state + its floating picker
    StatusPills      the openings pill
    RoomGrid         favourites, and the fold that holds the rest
    RoomTile         reading + the priority glyph column
    TabBar           four tabs, pinned, with the energy-flow and stale indicators
    Sheet            scrim + panel chrome, sitting below the tab bar
    sheets/          room card, weather, openings, person
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
