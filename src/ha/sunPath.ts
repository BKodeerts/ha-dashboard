import type { HassEntity } from './types';

export interface DaylightSegment {
  /** Epoch ms of this segment's sunrise and sunset. */
  start: number;
  end: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daylight segments (sunrise → sunset) overlapping [windowStart, windowEnd),
 * built from `sun.sun`'s own `next_rising`/`next_setting` attributes rather
 * than computing solar position ourselves. HA always keeps those two pointing
 * at the next future occurrence of each event, so together they bracket
 * whichever segment "now" sits in; shifting the same pair a day on
 * approximates the following one closely enough for a decorative arc.
 */
export function daylightSegments(
  sun: HassEntity | undefined,
  windowStart: number,
  windowEnd: number,
): DaylightSegment[] {
  const nextRising = Date.parse(String(sun?.attributes?.next_rising ?? ''));
  const nextSetting = Date.parse(String(sun?.attributes?.next_setting ?? ''));
  if (!Number.isFinite(nextRising) || !Number.isFinite(nextSetting)) return [];

  const segments: DaylightSegment[] =
    nextSetting < nextRising
      ? // Currently daytime: today's segment ends at `nextSetting` and started
        // a day before the next rising; tomorrow's mirrors it 24h on.
        [
          { start: nextRising - DAY_MS, end: nextSetting },
          { start: nextRising, end: nextSetting + DAY_MS },
        ]
      : // Currently night: the next segment is `nextRising` → `nextSetting`.
        [
          { start: nextRising, end: nextSetting },
          { start: nextRising + DAY_MS, end: nextSetting + DAY_MS },
        ];

  return segments
    .map((s) => ({ start: Math.max(s.start, windowStart), end: Math.min(s.end, windowEnd) }))
    .filter((s) => s.end > s.start);
}
