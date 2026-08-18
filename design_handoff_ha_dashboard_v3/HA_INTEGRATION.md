# Home Assistant integration

The frontend is a standalone app that talks to Home Assistant over its WebSocket API. HA stays the
backend: all logic, automations and device state live there. Nothing in the UI is configured in YAML.

## Recommended stack
- React + TypeScript + Vite
- `home-assistant-js-websocket` (official client: auth, `subscribeEntities`, `callService`)
- No component framework needed; the design is inline-style-simple. Tailwind is fine if the codebase
  already uses it — map the tokens in the README to theme values.
- Serve it from HA as a custom panel (`panel_custom` in `configuration.yaml`) or host separately and
  authenticate with a long-lived access token.

## Connecting

```ts
import {
  getAuth, createConnection, subscribeEntities, callService,
} from 'home-assistant-js-websocket';

const auth = await getAuth({ hassUrl: import.meta.env.VITE_HASS_URL, saveTokens, loadTokens });
const conn = await createConnection({ auth });
subscribeEntities(conn, (entities) => store.setEntities(entities));
```

`subscribeEntities` gives you every entity's state and attributes and pushes updates. That single
subscription is the whole data layer for the home screen.

## Room model

Rooms come from the **area registry**, not from a hand-written list — that is what removes the
multi-place YAML edits. Fetch once at startup and cache:

```ts
const areas   = await conn.sendMessagePromise({ type: 'config/area_registry/list' });
const devices = await conn.sendMessagePromise({ type: 'config/device_registry/list' });
const entReg  = await conn.sendMessagePromise({ type: 'config/entity_registry/list' });
```

An entity belongs to an area either directly (`entity.area_id`) or through its device
(`device.area_id`). Resolve that once into `Record<areaId, entityId[]>`, then bucket by domain and
device class:

| Card slot | Selector |
| --- | --- |
| Temperature | `sensor` with `device_class: temperature` (prefer the one whose name matches the area) |
| Humidity | `sensor` with `device_class: humidity` |
| Lights icon | all `light.*` in the area |
| AC icon | `climate.*` in the area |
| Radio icon | `media_player.*` in the area |
| Window / door sensor | `binary_sensor` with `device_class: window` / `door` / `garage_door` |
| Motion | `binary_sensor` with `device_class: motion` / `occupancy` |
| Smoke | `binary_sensor` with `device_class: smoke` |
| Camera | `camera.*` in the area |

Adding a device in HA and assigning it to an area is therefore the only step needed for it to appear.

Client-side config (a small JSON in `localStorage` or a HA `input_text`, not YAML):
- `favouriteAreas: string[]` — the five cards shown before "Andere kamers"
- `areaTint: Record<areaId, string>` — the accent edge colours
- `roomOrder: string[]`

## Service calls

```ts
// lights: any on → all off, else all on
callService(conn, 'light', anyOn ? 'turn_off' : 'turn_on', undefined, { entity_id: lightIds });

// AC on/off and setpoint
callService(conn, 'climate', 'set_hvac_mode', { hvac_mode: acOn ? 'off' : 'cool' }, { entity_id: id });
callService(conn, 'climate', 'set_temperature', { temperature: target }, { entity_id: id });

// media
callService(conn, 'media_player', 'media_play_pause', undefined, { entity_id: id });
callService(conn, 'media_player', 'volume_set', { volume_level: v / 100 }, { entity_id: id });
callService(conn, 'media_player', 'play_media',
  { media_content_type: 'music', media_content_id: presetUrl }, { entity_id: id });

// alarm
callService(conn, 'alarm_control_panel', 'alarm_arm_away', { code }, { entity_id: 'alarm_control_panel.home' });
```

Apply the state change locally first, then let the incoming `state_changed` event confirm it.

## Status pills
- **Alarm** — `alarm_control_panel.*`; `disarmed` is the attention state. `armed_home` / `armed_away`
  map to the two calm labels. Show `arming` / `pending` with the amber treatment and a countdown.
- **Openings** — every `binary_sensor` with device_class `window`, `door` or `garage_door` whose state
  is `on`. Sort by `last_changed` descending. `sinds HH:mm` comes from `last_changed`. Up to 13 can be
  open at once, which is why the pill collapses to a count and the list scrolls.
- **Presence** — `person.leen`; `not_home` → `Leen weg`, `home` → `Leen thuis`. The sheet embeds the
  Lovelace map card rather than reimplementing Leaflet.

## Sparklines
`history/history_during_period` per temperature sensor, one call per room on mount, then keep the line
fresh from the live state:

```ts
const hist = await conn.sendMessagePromise({
  type: 'history/history_during_period',
  start_time: new Date(Date.now() - 24 * 3600e3).toISOString(),
  entity_ids: [tempSensorId],
  minimal_response: true,
  no_attributes: true,
});
```

Downsample to ~22 points, map to the `0 0 100 24` viewBox, render as a polyline. Cache per sensor for
5 minutes.

## What stays Lovelace
Embed these rather than rebuilding — they are the four places HA's own cards are worth more than a
rewrite, and they were the source of most of the old dashboard's maintenance:

| View | Card |
| --- | --- |
| Power sheet detail | `energy-*` cards / the energy dashboard |
| Room history detail | `history-graph` / `statistics-graph` |
| Presence sheet | `map` |
| Camera view | `picture-glance` / `webrtc` stream |
| Weather sheet detail | `weather-forecast` |

Two mounting options:

1. **`hui-card` in a shadow root.** HA's frontend elements are available inside a custom panel. Create
   `document.createElement('hui-card')`, set `.hass` and `.config` (the normal Lovelace card YAML as an
   object), and append it into a container styled to match the sheet. Cheapest visually — inherits the
   HA theme, which you can align to these tokens.
2. **`<iframe>` to a hidden Lovelace view.** Keep one Lovelace dashboard with `visible: false` views
   holding exactly these cards, and iframe the view into the sheet. More isolated, more robust across
   HA updates, slightly heavier.

Either way the summary values in the sheet header (solar W, consumption W, top loads) come from plain
sensor states through the same subscription — only the graph is Lovelace.

## Auth and deployment notes
- As a custom panel HA handles auth for you; no token in the client.
- If hosted separately, use a long-lived access token in a server-side proxy, never in the bundle.
- Cache the last known entity snapshot in `localStorage` so the first paint has real values before the
  socket connects.
- HA restarts drop the socket: reconnect with backoff and show a subdued banner rather than an error
  screen.
