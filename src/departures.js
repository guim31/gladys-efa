// -----------------------------------------------------------------------------
// From the EFA answers to what a watched stop shows: departures (times in
// milliseconds, minutes to wait, delay, cancellation) kept by the filters of
// the watch (lines, direction, mode), and the traffic messages that concern
// them. Pure functions: the clock is a parameter.
// -----------------------------------------------------------------------------

import { modeOfClass } from './efa.js';

/** Lower case, without accents: "Düsseldorf" matches "dusseldorf", "ß" matches "ss". */
export function fold(text) {
  return String(text ?? '')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** "Stuttgart, Hauptbahnhof" and "stuttgart hauptbahnhof" compare equal. */
export const words = (text) =>
  fold(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** "2026-11-22T10:57:30Z" → epoch ms; NaN without an explicit zone. */
export function parseEfaTime(text) {
  const value = String(text ?? '');
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(value)
    ? Date.parse(value)
    : NaN;
}

/** The line as written on the vehicle: "U79", "RE5", "SEV RE 47", "ICE 627". */
export function lineOf(transportation) {
  const short = String(transportation?.disassembledName ?? '').trim();
  if (short) {
    return short;
  }
  const number = String(transportation?.number ?? '').trim();
  const type = String(transportation?.properties?.trainType ?? '').trim();
  if (number) {
    // Long-distance trains carry only their number: "627" is the ICE 627.
    return type && !number.startsWith(type) ? `${type} ${number}` : number;
  }
  return String(transportation?.name ?? '').trim() || '?';
}

const stripHtml = (text) =>
  String(text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

// Priorities of the EFA messages, for the order of the list.
const PRIORITY = { veryLow: 0, low: 1, normal: 2, high: 3, veryHigh: 4 };

// A plain message this young is news, not a standing note.
const FRESH_MS = 24 * 3600 * 1000;

// "Linie 42", "Linien 707, 752 und NE1:": a title that only lists lines.
const LINE_LIST = /^linien?\b[^.!?]*$/i;

/** The headline of a message: its title, unless it only lists lines. */
function headline(link, description) {
  for (const candidate of [link.title, link.subtitle, link.urlText]) {
    const text = stripHtml(candidate);
    if (text && !LINE_LIST.test(text)) {
      return text;
    }
  }
  const sentence = description.split(/(?<=[.!?])\s|\n/)[0];
  return sentence || stripHtml(link.title);
}

/**
 * The traffic messages attached to a departure, as { id, priority, important,
 * summary, description }. Important: a real-time trip message, a message of
 * high priority, or one created in the last day (a vehicle failure, written
 * by VRR as a plain line message); the networks also attach long-standing
 * notes (works, accessibility, even seasonal offers) to every departure of a
 * line, which are not a disruption of the trip.
 * @param {object} event a stop event
 * @param {number} now ms
 */
export function infosOf(event, now) {
  const found = [];
  for (const info of event?.infos ?? []) {
    if (!info?.id) {
      continue;
    }
    const link = (info.infoLinks ?? [])[0] ?? {};
    const description = stripHtml(link.content ?? info.content);
    const summary = headline(link, description);
    if (!summary) {
      continue;
    }
    const priority = PRIORITY[info.priority] ?? PRIORITY.normal;
    found.push({
      id: String(info.id),
      priority,
      important:
        priority >= PRIORITY.high ||
        info.type === 'tripMessage' ||
        now - parseEfaTime(info.timestamps?.creation) < FRESH_MS,
      summary,
      description,
    });
  }
  return found;
}

/**
 * One departure per stop event, soonest first; the ones already gone (an
 * answer a minute old) are dropped.
 * @param {object[]} events `stopEvents` of the departure monitor
 * @param {number} now ms
 */
export function parseDepartures(events, now) {
  const departures = [];
  for (const event of events ?? []) {
    const aimed = parseEfaTime(event?.departureTimePlanned);
    const estimated = parseEfaTime(event?.departureTimeEstimated);
    const expected = Number.isFinite(estimated) ? estimated : aimed;
    if (!Number.isFinite(aimed) || expected < now - 60000) {
      continue;
    }
    const transportation = event.transportation ?? {};
    const properties = event.location?.properties ?? {};
    departures.push({
      // The trip id of the network with its planned time: unique for the day.
      key: `${transportation.id ?? lineOf(transportation)}|${event.departureTimePlanned}`,
      line: lineOf(transportation),
      mode: modeOfClass(transportation.product?.class),
      destination: String(transportation.destination?.name ?? '').trim() || '?',
      platform: String(
        properties.platform ?? properties.platformName ?? event.location?.disassembledName ?? '',
      ).trim(),
      aimed,
      expected,
      minutes: Math.max(0, Math.floor((expected - now) / 60000)),
      // Early departures are not a delay: 0.
      delay: Math.max(0, Math.round((expected - aimed) / 60000)),
      cancelled:
        event.isCancelled === true ||
        (event.realtimeStatus ?? []).includes('TRIP_CANCELLED') ||
        (properties.realtimeStatus ?? []).includes('TRIP_CANCELLED'),
      realtime: Number.isFinite(estimated),
      infos: infosOf(event, now),
    });
  }
  return departures.sort((a, b) => a.expected - b.expected);
}

/**
 * The departures a watch keeps: its lines (as the network writes them, case
 * and spaces ignored), its direction (part of the destination, accents and
 * case ignored), its mode.
 * @param {object[]} departures from parseDepartures
 * @param {{ lines?: string[], direction?: string, mode?: string }} watch
 */
export function applyFilters(departures, watch) {
  const lines = new Set((watch.lines ?? []).map(lineKey));
  const direction = fold(watch.direction);
  return departures.filter(
    (departure) =>
      (lines.size === 0 || lines.has(lineKey(departure.line))) &&
      (!direction || fold(departure.destination).includes(direction)) &&
      (!watch.mode || departure.mode === watch.mode),
  );
}

/** "SEV RE 47" and "sev re47" are the same line. */
export const lineKey = (line) =>
  String(line ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * The departures of an earlier read, as of `now`: minutes counted again from
 * the expected time, the ones gone dropped. A board read a minute ago (or
 * before an outage of the server) never shows a frozen countdown.
 */
export const aged = (departures, now) =>
  departures
    .filter((departure) => departure.expected >= now - 60000)
    .map((departure) => ({
      ...departure,
      minutes: Math.max(0, Math.floor((departure.expected - now) / 60000)),
    }));

/** The departures that will run: not cancelled. */
export const running = (departures) => departures.filter((departure) => !departure.cancelled);

/**
 * The traffic messages of the departures a watch keeps, each once with the
 * lines it was attached to, the important ones first.
 * @param {object[]} departures the departures kept by the watch
 */
export function messagesFor(departures) {
  const byId = new Map();
  for (const departure of departures) {
    for (const info of departure.infos ?? []) {
      const known = byId.get(info.id);
      if (known) {
        if (!known.lines.includes(departure.line)) {
          known.lines.push(departure.line);
        }
      } else {
        byId.set(info.id, { ...info, lines: [departure.line] });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => Number(b.important) - Number(a.important) || b.priority - a.priority,
  );
}

const clockFormat = new Map();

/** "07:45" in the time zone of the container (TZ, set by Gladys). */
export function clockTime(ms) {
  const zone = process.env.TZ || undefined;
  if (!clockFormat.has(zone)) {
    clockFormat.set(
      zone,
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
      }),
    );
  }
  return clockFormat.get(zone).format(new Date(ms));
}
