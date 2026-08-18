import { useEffect, useState, type RefObject } from 'react';
import type { PaletteSetting, ThemeSetting } from '../config/config';
import type { HaBackend } from '../ha/types';

export type Scheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : true;

/**
 * Resolves the stored preference to the scheme actually painted.
 *
 * `auto` follows Home Assistant. Its frontend publishes the scheme it settled on
 * as `hass.themes.darkMode`, which already folds in the user's theme choice and
 * their "sync with system" switch — so following it means this dashboard flips
 * with the rest of HA instead of second-guessing it. Outside HA (standalone or
 * mock) there is no `hass.themes`, and the OS preference stands in.
 */
export function useScheme(setting: ThemeSetting, backend: HaBackend): Scheme {
  const [systemDark, setSystemDark] = useState(prefersDark);
  const [haDark, setHaDark] = useState<boolean | undefined>(
    () => backend.hass?.themes?.darkMode,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setHaDark(backend.hass?.themes?.darkMode);
    return backend.subscribeDarkMode?.(setHaDark);
  }, [backend]);

  if (setting !== 'auto') return setting;
  return (haDark ?? systemDark) ? 'dark' : 'light';
}

/**
 * Stamps the scheme and the palette on the shadow host, which is where
 * `:host([data-theme])` and `:host([data-palette])` can see them — React renders
 * inside the shadow root and cannot reach the host on its own. `.app` carries the
 * same attributes, so the tokens still resolve if this is ever mounted without a
 * shadow root.
 *
 * Both belong on the host rather than on `.app`: the host is the element that
 * paints the page background, and it is also the element the Home Assistant theme
 * variables reach first on their way down from `document.documentElement`.
 */
export function useThemeAttribute(
  ref: RefObject<HTMLElement | null>,
  scheme: Scheme,
  palette: PaletteSetting,
): void {
  useEffect(() => {
    const root = ref.current?.getRootNode();
    if (!(root instanceof ShadowRoot)) return;
    const host = root.host as HTMLElement;
    host.setAttribute('data-theme', scheme);
    host.setAttribute('data-palette', palette);
  }, [ref, scheme, palette]);
}
