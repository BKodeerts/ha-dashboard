/**
 * Entry point for the standalone build and for `npm run dev`.
 *
 * `?mock=1` (or `VITE_HA_MODE=mock`) runs the dashboard against the mock backend
 * from `ha/mock.ts` — the full UI, no Home Assistant needed.
 */
import './element';

const useMock =
  new URLSearchParams(location.search).has('mock') || import.meta.env.VITE_HA_MODE === 'mock';

const panel = document.createElement('ha-dashboard-panel');
panel.setAttribute('mode', useMock ? 'mock' : 'standalone');
document.body.appendChild(panel);
