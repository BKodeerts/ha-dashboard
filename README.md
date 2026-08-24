# ha-dashboard

A custom mobile-first Home Assistant frontend, built to the **v4** design handoff in
[`design_handoff_ha_dashboard_v4/`](design_handoff_ha_dashboard_v4/) (section `3b` — "Tegel opent de
kamer, lichtchip schakelt").

It answers three questions at a glance — is the alarm set, is anything open, who is home — and puts
the lights one tap from the home screen. Everything a tile cannot hold lives in the room card:
per-lamp brightness, the AC, the radio, and the room's own 24 h temperature line.

Four tabs, each a real view: **Home**, **Energie**, **Netwerk**, **Auto**. The bottom bar is
absolutely pinned to the bottom of the screen — no amount of content scrolls it away — and sheets
stop above it. Everything each tab shows is drawn by this app itself — see "What stays Lovelace"
below for the one embed that remains.

### What changed in v7

v7 replaces the Energie tab's two-bar comparison with the
[`design_handoff_ha_energy_tab/`](design_handoff_ha_energy_tab/) handoff: a solar/now card with
today's production-vs-consumption curve and a self-consumption ratio, a per-device trend card (each
line normalised to its own daily max), and the "apparaten nu" list.

The solar/now card's curve also carries a forecast: a dashed line picks up right where today's actual
solar line stops (at "now") and continues through the rest of the day, whenever a forecast integration
(Forecast.Solar, Solcast, …) is wired to the household's Energy dashboard solar source. Nothing to
configure — it reads `energy/solar_forecast`, the same call HA's own Energy dashboard draws its
forecast from, keyed by whatever `config_entry_solar_forecast` the solar source in `energy/get_prefs`
already names. No forecast integration configured, or an HA too old to answer the call, both mean no
dashed line rather than a broken chart.

It also moves the devices list off name-guessing entirely. `power.loads` (a hand-written list) and
`power.excludeLoads` (patterns to trim it) briefly existed and are gone again — a name-matching guess
at "which sensors are individual devices" turned out to reliably catch a smart meter's own internal
per-phase and import/export breakdown sensors alongside the real ones, however the guess was tuned,
because there is no name pattern that tells the two apart. Home Assistant already has the answer:
Settings → Dashboards → Energy's "Individual devices" list is the household's own curation of exactly
this, read live over `energy/get_prefs` (see `ha/energyPrefs.ts`) — no config on this card at all,
short of the noise floor.

| v6 | v7 |
| --- | --- |
| Solar and consumption were two bars against a fixed scale | One card: live solar W, home W, and net flow, over today's hourly curve for both |
| No sense of *how much* of today's solar was self-consumed | A self-consumption % bar — `min(solar, consumption)` summed across today's hours, over consumption |
| The devices list was a flat row of numbers | The same list, plus a small-multiples trend chart per device |
| Devices came from `power.loads`, a name-matched guess at every `device_class: power` sensor | Devices come from Settings → Dashboards → Energy's "Individual devices" list, read live — no guessing, no YAML |

### What changed in v6

v6 makes the Lovelace card the primary way to run this, gives it a GUI editor, and drops the
household layer that lived in HA's system store.

| v5 | v6 |
| --- | --- |
| Household defaults were a button in settings (admin, HA 2025.12+) that copied your layer into `frontend.system_data` | Household defaults are the card's own YAML — no version gate, no publish step |
| The only way to set the car, media presets and the energy bar's scale was hand-written `panel_custom`/card YAML | A GUI editor (HA's "Edit card" dialog) covers those, plus "media per kamer" — power sensors stay auto-detected, same as before, so the editor never asks for them |
| "Media per kamer" was admin-only, written straight to the household layer from Settings | Set from the card's visual editor instead; the in-app Settings view no longer has an admin section |
| Recommended install was a `panel_custom` sidebar panel | Recommended install is the Lovelace card — see "Three ways to run it" |

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

### What changed in v5

v5 moves the settings off the browser and onto the server, and pins both bars to the viewport.

| v4 | v5 |
| --- | --- |
| Settings in `localStorage` — per browser, and shared by everyone using that browser | Settings in Home Assistant, against your account: same dashboard on every device you sign in on, and your own on a tablet somebody else also uses |
| Bulk changes meant pasting `localStorage.setItem(...)` into a console | The household layer is a button in settings (admin, HA 2025.12+); the rest is `configuration.yaml` |
| A change on one device stayed there | Live sync through `frontend/subscribe_user_data` (HA 2025.6+) |
| Versioned by renaming the storage key | Versioned by an envelope, `{version, config}`, since the data is no longer somewhere a human can replace by hand |
| Tab bar absolutely positioned, top line in the flex column | Both `position: fixed` to the viewport — neither can be carried by an ancestor that scrolls |

### What changed in v4

v4 gives the alarm and presence the treatment v3 gave the climate row, and makes favourites mean
something. Everything else in the v2/v3 spec stands.

| v3 | v4 |
| --- | --- |
| Alarm was a word in the pill row, armed from a sheet | An icon-only chip beside the person chips, with a floating state picker — one tap, one command |
| Alarm state written out (`Alarm uit`) | A shield glyph and a 6 px dot carry the state; `arming` pulses through the exit delay, `pending` and `triggered` flash red |
| The picker's modes were the three the design drew | Read off the panel's own `supported_features`, so a device without `arm_night` shows one chip fewer |
| One person chip; "who am I" was a setting | The people you *follow*, up to two — and who you are comes from `hass.user`, not from a list you can get wrong |
| Favourites only sorted the grid | Favourites **are** the grid; the rest unfold from one disclosure row |
| Tile chips: 26 px plates in a row under the reading | Bare 16 px glyphs in a column at the tile's right edge, fixed priority, three at a time |
| Tab bar sat in the flex column | Pinned to the bottom of the frame; every scroll area pads to clear it (v5 makes this `fixed`) |

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

All of them mount the same `<ha-dashboard-panel>` custom element, so there is one code path. The
Lovelace card is the recommended one — it needs no restart to add or reconfigure, and it is the only
mount that gets the visual editor (see "Editing it visually" below).

### 1. As a Lovelace card, via HACS (recommended)

1. HACS → ⋮ → **Custom repositories** → add `BKodeerts/ha-dashboard`, type **Dashboard**.
2. Find "Home dashboard" in HACS and **Download**. HACS registers the bundle as a Lovelace
   **resource** on its own — check Settings → Dashboards → Resources if in doubt.
3. **+ Add card** on any dashboard, search "HA Dashboard", and use the GUI editor that opens (or add
   it by hand — see "Setting it as your default dashboard" below for the YAML and the `panel: true`
   view that gives it a full-page, no-sidebar look).

Updates are one click in HACS — no file copying, no restart. Releases are built by CI
(`.github/workflows/release.yml`); to cut one:

```bash
npm version patch && git push --follow-tags
```

### 2. As a Home Assistant panel (`panel_custom`)

An alternative for a fixed sidebar entry point outside any dashboard. It works exactly the way it
always has, but it has no visual editor — `config:` stays hand-written YAML — and, unlike the card,
it is not eligible for "Default dashboard" (see below).

1. Build or download the same bundle as above.
2. Add it to `configuration.yaml`:

```yaml
panel_custom:
  - name: ha-dashboard-panel
    url_path: home
    sidebar_title: Home
    sidebar_icon: mdi:home-variant
    module_url: /hacsfiles/ha-dashboard/ha-dashboard-panel.js  # or /local/… for a manual copy
    embed_iframe: false
    require_admin: false
    # Optional: defaults for the client-side config (see "Configuration").
    # Anything the user changes in the app overrides this and is stored on their account.
    config:
      favouriteAreas: [living, bureau, slaapkamer, clara, oliver]
```

3. Restart Home Assistant — a YAML reload will not register a new panel. The dashboard is at `/home`.

Three fields matter and are easy to get wrong:

- `name` **must** be `ha-dashboard-panel` — it is the custom element the bundle registers.
- `module_url`, not `js_url` — the build is an ES module.
- `embed_iframe: false` is required. Inside an iframe the panel never receives `hass`, so there is
  no data and no Lovelace embeds.

A manual (non-HACS) copy works the same way:

```bash
npm run build:panel                                        # → dist/panel/ha-dashboard-panel.js
scp dist/panel/ha-dashboard-panel.js root@homeassistant.local:/config/www/
```

Use `module_url: /local/ha-dashboard-panel.js`. HA caches `/local/` aggressively, so bump `?v=2` on
every redeploy — this is the copying HACS saves you, on either mount.

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

## Setting it as your default dashboard

Put the card in a dashboard with a single `panel: true` view and it is eligible for Settings → your
profile → **Default dashboard** — something a `panel_custom` panel never is, since that picker only
lists dashboards registered under Settings → Dashboards, a Home Assistant frontend restriction the
panel config cannot opt into.

```yaml
# configuration.yaml
lovelace:
  dashboards:
    home-dashboard:
      mode: yaml
      title: Home
      icon: mdi:home-variant
      show_in_sidebar: true
      filename: dashboards/home-dashboard.yaml
```

```yaml
# dashboards/home-dashboard.yaml
title: Home
# Requires the kiosk-mode custom card as its own registered Lovelace resource
# (a one-time setup) — this block just turns it on for this dashboard specifically,
# unindented at the file's root, so every other dashboard keeps HA's normal header.
kiosk_mode:
  hide_header: true
views:
  - title: Home
    path: home
    panel: true
    cards:
      - type: custom:ha-dashboard-panel
        favouriteAreas: [living, bureau, slaapkamer, clara, oliver]
```

Lovelace would otherwise always draw its own header (title bar, sidebar toggle) above the view,
stacked on top of this app's own header and tab bar — the `kiosk_mode:` block above hides it
automatically, scoped to just this dashboard. It needs
[`kiosk-mode`](https://github.com/maykar/kiosk-mode) itself registered as a Lovelace resource, the
same one-time step as the card's own resource.

## Editing it visually

The card in the snippet above (`type: custom:ha-dashboard-panel`) is a normal Lovelace card: press
**Edit Dashboard**, click the card, and "Edit card" opens with a GUI tab instead of raw YAML. It
covers the household-wide settings that have no auto-detected default and used to require
hand-written YAML — the car, media presets, the "apparaten nu" noise floor, and which media player
each room's card shows ("media per kamer") — because those are the ones a household actually changes
from time to time, not a config editor for every key.

**Which power sensors are which is deliberately not in the editor.** `power.solar`/`.consumption`/
`.grid` are already auto-detected from any `device_class: power` sensor (see the derived-defaults
table below) — adding pickers for them would just be asking you to re-enter what the app already found
on its own. If the auto-detection ever guesses wrong for your setup, override it in the card's "Edit
as YAML" tab, the same as any key the GUI doesn't cover.

The editor does carry the tracked-devices list (the trend chart, and "apparaten nu" when they're
actually drawing something) — `power.devices` — but only as a pick from Settings → Dashboards →
Energy's own "Individual devices" list, not any sensor in the house: a device has to be added there
first before the editor can offer it here. Left empty, it still follows that HA list wholesale, sorted
by current draw; pick a subset to track a different set on this dashboard specifically, in exactly the
order chosen for the trend chart — an explicit list is never re-sorted by live wattage there. Naming a
sensor that was never added to HA's Energy config still works, just not from the editor — write it into
the card's own YAML by hand.

Tracked and "on right now" are different things, though: the trend chart always draws every tracked
device, at every wattage, including a flat 0 W line while it's simply off — that's the point of naming
one explicitly, seeing its whole day's shape even when it's idle right now. "Apparaten nu" stays a
snapshot of what's actually drawing power, and it draws from a *wider* pool than the trend chart does:
every tracked device, plus every entity in HA's own "Individual devices" list when there is one — so
trimming `power.devices` down to just the appliances worth graphing (a TV plug's day-shape is rarely
interesting) does not also hide that TV from "apparaten nu" while it's genuinely drawing power.
`power.minWatts` (in the editor too) still trims that list, the same for a tracked device as for an
auto-detected one — being on the trend chart doesn't exempt an idle device from it.

Each row also has a name field, for when the entity's own friendly name is too long for the row —
"TV" instead of "TV power". Left blank, the entity's own name is used, same as before. There is no
icon override anywhere: the row already shows whatever icon the entity itself carries in Home
Assistant, in place of the generic bolt, whenever it has one.

Everything else (`favouriteAreas`, `theme`, tints, …) is either better set from the in-app Settings
view (it is personal, per account) or still just plain YAML in the card's "Edit as YAML" tab if you
want a household-wide starting point for it.

The editor only exists for the Lovelace card — `panel_custom` has no such hook, so a panel-mounted
install keeps editing `config:` by hand in `configuration.yaml`.

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

The chip at the top right is the one person you chose to *follow* — the header only ever renders the
first entry in `tracked`, so the settings picker is a radio list, not a multi-select: picking someone
replaces whoever was tracked before. The logged-in user is never an option.

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

A `triggered` panel flashes red, and is the loudest thing on the screen. So does `pending` — HA's
*entry* delay, where the panel has been tripped and is counting down while it waits for a code.
That one reads red from the start rather than amber: by the time it would turn red on its own, the
countdown it was warning about is over. No arm option reads as active through either — neither is a
state the user asked for — so the picker's only useful answer is `Uit`, which asks for the code and
disarms.

One WebSocket subscription (`subscribeEntities`) feeds the whole home screen. The room card's
temperature line adds one `history/history_during_period` call per temperature sensor (~28 points,
cached for five minutes).

### Netwerk: what has gone quiet

The Netwerk tab is **not** a card page, and it does not decide what counts as disconnected itself —
that judgement lives in Home Assistant, in a template sensor: `sensor.disconnected_devices`. Its
`entities` attribute lists whichever connectivity-tracking entities it considers gone (see the
sensor's own YAML for the exact rule), and this tab just turns that list into rows: **grouped by
device**, so two silent trackers on one device produce one row rather than two, with the longest
silence in the group deciding the row's age. The battery percentage comes from the
`device_class: battery` sensor on the same device. Past 48 h the badge turns amber and the tab grows
a dot.

An earlier version compared every entity's `last_updated` to now directly, which flagged far too
much — a closed door or a steady temperature reading are silent for entirely innocent reasons, not
because anything is broken. Delegating to a hand-picked sensor is what keeps the list to devices that
are actually worth checking on.

## Configuration

Settings live **in Home Assistant, against your account** — not in the browser. Sign in on a phone
and a wall tablet and you get the same dashboard on both; sign in as somebody else on that tablet and
you get your own. No YAML edit is needed to change a favourite or a colour.

They are stored through HA's own frontend storage, so there is nothing to install beyond this panel:

| Layer | Where | Who it applies to |
| --- | --- | --- |
| defaults | in the code, then derived from your state machine (see the table below) | everyone |
| household | the card's own YAML — hand-written or the visual editor (or `panel_custom`'s `config:` block, for a panel-mounted install) | everyone who has not chosen for themselves |
| yours | `frontend.user_data_{user_id}`, written by every tap in settings | you, on every device |

Each layer only carries what was actually set on it, so a household default keeps applying to the
keys you have not touched yourself.

**Live sync** (a change on your phone appearing on the tablet without a reload) uses
`frontend/subscribe_user_data`, **HA 2025.6+**. Below that your own settings are read once at
startup — the household layer needs no such gate, since it is just Lovelace's own storage.

`localStorage` is still used, but only as a cache: the last config each account saw is kept under
`ha-dashboard.cache.{user_id}` so a cold start paints the right dashboard immediately instead of
flashing the defaults while the socket connects. Deleting it costs nothing.

**Upgrading from v4:** the old `ha-dashboard.config.v2` blob is moved up to your account the first
time you open the dashboard, then renamed to `ha-dashboard.config.v2.migrated` so it cannot be
applied twice. Nothing is lost, and the old blob stays on disk as a way back.

**Upgrading from v5:** the household layer that used to live in `frontend.system_data` is gone —
move whatever it held into the card's own YAML (by hand or through the visual editor). There is
nothing to migrate automatically: that store had no equivalent in Lovelace to move it to.

**"standaardwaarden herstellen"** clears *your* layer only — you fall back to the card's own YAML,
then the derived defaults.

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
| `tracked` | `string[]` | the first other `person.*` found, capped at one |
| `alarmEntity` | `string` | first `alarm_control_panel.*` |
| `weatherEntity` | `string` | first `weather.*` |
| `power.solar` / `.consumption` / `.grid` | `string` | `energy/get_prefs`' solar source for `.solar`; otherwise a `device_class: power` sensor matched by name |
| `power.devices` | `(string \| {entityId, name?})[]` | Settings → Dashboards → Energy's "Individual devices", read live over `energy/get_prefs`, sorted by current draw. Set explicitly, the trend chart shows exactly that list in that order, at every wattage; "apparaten nu" still pools in the rest of the HA list too; `name` overrides the entity's own friendly name |
| `power.minWatts` | `number` | `0` — loads reading under this many watts (or reading exactly 0) drop off "Apparaten nu", tracked or auto-detected alike; the trend chart ignores it |
| `car.name` / `.battery` / `.range` | `string` | none — the Auto tab's title and subtitle |
| `mediaPresets` | `Record<playerId, {name, media_content_id, media_content_type}[]>` | none — the preset row is hidden |

The keys the in-app settings view does not expose — power, the car, media presets, and media per
kamer — are household-wide, and are set on the card itself. The car, media presets, `power.devices`,
`power.minWatts` and media per kamer have a GUI for that ("Editing it visually" above); `power.solar`/
`.consumption`/`.grid` are auto-detected and only need touching if that guess is wrong, by hand in the
card's YAML (or the `panel_custom` snippet's `config:` block, for a panel-mounted install):

```yaml
type: custom:ha-dashboard-panel
power:
  solar: sensor.zonnepanelen_vermogen
  consumption: sensor.verbruik_vermogen
  devices:
    - sensor.vaatwasser_vermogen
    - entityId: sensor.wasmachine_vermogen
      name: Wasmachine
    - sensor.droogkast_vermogen
car:
  name: Kona electric
  battery: sensor.kona_battery
  range: sensor.kona_range
mediaEntity:
  living: media_player.living_sonos
mediaPresets:
  media_player.living_radio:
    - name: Studio Brussel
      media_content_type: music
      media_content_id: https://…/stubru.mp3
    - name: Klara
      media_content_type: music
      media_content_id: https://…/klara.mp3
```

To read or write your stored layer directly, use **Developer Tools → the websocket API** rather than
the browser console — the blob lives on the server now, under the key `ha-dashboard`:

```json
{ "type": "frontend/get_user_data", "key": "ha-dashboard" }
```

v1's `accent`, `personEntity`, `lovelace.netwerk` and `lovelace.roomHistory` are gone: the accent is
fixed at amber, Netwerk is no longer a card page, and the room card draws its own history line. The
storage key changed with them, so a v1 install starts from the derived defaults rather than
half-reading an old shape.

**v4 drops `me`.** It is stripped on read rather than migrated — it was a *guess* the user made
about themselves, and the account is the answer — so an existing install keeps its favourites, order
and tints and simply stops storing who you are.

**v5 moves the whole blob to the server.** The stored value is now an envelope, `{version, config}`:
a key rename was how v1 → v2 was versioned, which worked when a human could paste a replacement into
a console, and does not now that the data lives in Home Assistant.

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

One thing: the **presence sheet's map**, hardcoded to HA's own `map` card for the tapped person —
no history trail (`hours_to_show: 0`), and no config key to override it. Everywhere else that used
to embed a card (the energy dashboard, the `auto` tab, the weather forecast) now shows only what
this app draws itself; those embeds were placeholders more often than not, since nothing in the
settings view ever set the config keys they depended on.

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
- Settings live on the server, against your account — see [Configuration](#configuration). What is
  left in `localStorage` is a cache of them, plus the entity snapshot below.
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
- **`triggered` and `pending` get their own treatment, and flash.** The handoff gives the pulse to `arming` alone
  and says no other state animates — but that rule is about states of *rest*, and a tripped alarm
  reading as a still chip is a tripped alarm nobody notices. It flashes between two solid reds at
  ~1.1 Hz (well under the three-per-second photosensitivity threshold), both of which clear 4.5:1
  against the white shield riding on them, so the glyph is readable at either end of the blink
  rather than half the time. Under `prefers-reduced-motion` it holds the bright end instead of
  dropping the treatment: less movement is not a request for less information. It keeps the filled
  shield, because the icon set has no "breached" glyph and inventing one is worse than letting the
  colour say it.
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
  editor.tsx         the Lovelace card's visual editor (<ha-dashboard-panel-editor>)
  panel.ts           entry for the HA panel build
  main.tsx           entry for the standalone build / dev server
  app/App.tsx        screen composition, sheet + tab state
  ha/
    backend.ts       panel and standalone connections, snapshot cache
    mock.ts          a stand-in Home Assistant, same interface as the live socket
    registry.ts      area/device/entity registries → per-area device buckets
    selectors.ts     rooms, lamps, climate, openings, alarm, people, weather, power; formatting
    stale.ts         the Netwerk list: sensor.disconnected_devices' entities, grouped by device
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
