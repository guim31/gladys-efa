// -----------------------------------------------------------------------------
// The EFA service: the watched stops (configuration actions, /data), their
// devices, the refresh timer (one departures request per created device), the
// states and the scene triggers.
//
// Triggers fire once per journey (and per threshold), never at the first read
// of a stop: what was already there when the integration started is not news.
// Cancellations and traffic messages already announced are kept in /data, so a
// restart does not announce them again; the "leave now" and delay thresholds
// are kept in memory only (a journey lives an hour or two, and /data is often
// an SD card).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  aged,
  applyFilters,
  clockTime,
  fold,
  lineKey,
  messagesFor,
  parseDepartures,
  words,
} from './departures.js';
import { buildStopDevice, clip, stopStates, watchKey, watchName, STOP_TYPE } from './devices.js';
import { ActionFailure } from './errors.js';
import { TEXT, modeName, say, sayAll } from './messages.js';
import { Efa, MODES, NETWORKS, parseStopId } from './efa.js';

const logger = createLogger({ name: 'efa' });

export const TRIGGERS = {
  SOON: 'departure_soon',
  DELAYED: 'departure_delayed',
  CANCELLED: 'departure_cancelled',
  DISRUPTION: 'new_disruption',
};
// Options of the threshold filters of the triggers (manifest `scene_triggers`).
// Few values: every one reached is an event, and the core takes 300 a minute.
export const SOON_MINUTES = [1, 2, 3, 5, 7, 10, 12, 15, 20];
export const DELAY_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 60];
// One request per watched stop and refresh: kept low, the servers are shared.
export const MAX_WATCHES = 10;
const SEARCH_RESULTS = 8;
// A value that does not change is published again this often, so that Gladys
// does not show it as stale ("no recent value" after 48 h).
const HEARTBEAT_MS = 6 * 3600 * 1000;
// Announced cancellations and messages are forgotten two days after they were
// last seen; their "last seen" is written at most hourly.
const MEMORY_MS = 48 * 3600 * 1000;
const SEEN_WRITE_MS = 3600 * 1000;
// "Time to leave" and delay thresholds of a journey, kept in memory this long
// after its aimed time.
const JOURNEY_MEMORY_MS = 2 * 3600 * 1000;
// Scene events sent per minute at most: the core refuses more than 300.
const EVENTS_PER_MINUTE = 200;

/** "u79, 704 ; sev re 47" → ["704", "SEV RE 47", "U79"]: sorted, so the order typed does not matter. */
export function parseLines(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[,;]+/)
        .map((line) => line.trim().replace(/\s+/g, ' ').toUpperCase())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** A watch read from /data or a device: a known network and a stop id. */
const isWatch = (watch) =>
  Boolean(NETWORKS[watch?.network]) && typeof watch.id === 'string' && watch.id.length > 0;

export class EfaService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the fake one)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   * @param {boolean} [options.timers] false in the tests: refresh by hand
   */
  constructor({ gladys, store, fetch, now = Date.now, sleep, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.efa = new Efa({ fetch, now, sleep });
    this.now = now;
    this.timers = timers;
    this.config = { language: 'fr', refreshSeconds: 60 };
    this.watches = [];
    this.removed = [];
    this.memory = { announced: {}, checked: [] };
    // watchKey → { departures, messages, at }
    this.boards = new Map();
    // watchKey → Map(journey key → Set of thresholds handled), in memory only.
    this.soonDone = new Map();
    this.delayDone = new Map();
    this.checkedNow = new Set();
    this.refreshedAt = 0;
    this.lastError = null;
    this.inflight = null;
    this.timer = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.watches = Array.isArray(saved.watches) ? saved.watches.filter(isWatch) : [];
    this.memory = {
      announced: saved.announced && typeof saved.announced === 'object' ? saved.announced : {},
      checked: Array.isArray(saved.checked) ? saved.checked : [],
    };
    this.removed = Array.isArray(saved.removed) ? saved.removed : [];
    await this.restoreFromDevices();
    await this.publishDiscovered();
    await this.gladys.setConnectionStatus(true).catch(() => {});
    this.startTimer();
    // A failure here is not an initialization failure: the timer goes on.
    await this.refresh().catch((err) => logger.error('First refresh failed', err));
  }

  async resync(config) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    await this.publishDiscovered();
    await this.refresh({ republish: true });
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    if (previous.language !== config.language) {
      // The device names follow the language; the feature names stay as they
      // were created (frozen by the core).
      await this.publishDiscovered();
      await this.refresh({ republish: true });
    }
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers) {
      this.timer = setInterval(() => {
        // A read still running (server slow, 429 retries): this tick is skipped,
        // never queued behind it.
        if (this.inflight) {
          return;
        }
        this.refresh().catch((err) => logger.error('Refresh failed', err));
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => {});
    await this.store.flush();
  }

  save() {
    return this.store.save({
      watches: this.watches,
      announced: this.memory.announced,
      checked: this.memory.checked,
      removed: this.removed,
    });
  }

  // --- Devices ----------------------------------------------------------------

  deviceId(watch) {
    return this.gladys.externalIds(STOP_TYPE, watchKey(watch)).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  watchOfDevice(externalId) {
    return this.watches.find((watch) => this.deviceId(watch) === externalId) ?? null;
  }

  createdWatches() {
    return this.watches.filter((watch) => this.isCreated(this.deviceId(watch)));
  }

  /** The watches of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value ?? '';
    let changed = false;
    for (const device of devices ?? []) {
      const watch = {
        network: param(device, 'network'),
        id: param(device, 'stop_id'),
        name: param(device, 'stop_name') || param(device, 'stop_id'),
        lines: String(param(device, 'lines')).split(',').filter(Boolean),
        direction: param(device, 'direction'),
        mode: param(device, 'mode'),
      };
      if (!isWatch(watch)) {
        continue;
      }
      // A stop removed by the user keeps its device until deleted: not restored.
      if (
        !this.removed.includes(watchKey(watch)) &&
        !this.watches.some((known) => watchKey(known) === watchKey(watch))
      ) {
        this.watches.push(watch);
        changed = true;
      }
    }
    if (changed) {
      logger.info(`${this.watches.length} stop(s) restored from the Gladys devices`);
      await this.save();
    }
  }

  async publishDiscovered() {
    try {
      await this.gladys.publishDiscoveredDevices(
        this.watches.map((watch) => buildStopDevice(this.gladys, watch, this.config.language)),
      );
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const watch = this.watchOfDevice(device?.external_id);
    if (!watch) {
      return;
    }
    // A state published before the device existed was dropped by the core:
    // everything again, then the widgets showing it.
    await this.refresh({ republish: true });
    this.gladys.requestWidgetRefresh?.('departures');
  }

  // --- Refresh ----------------------------------------------------------------

  /** Polling fallback: Gladys does not poll these devices, but if it did. */
  async poll() {
    if (this.now() - this.refreshedAt >= (this.config.refreshSeconds * 1000) / 2) {
      await this.refresh();
    }
  }

  refresh(options = {}) {
    if (this.inflight) {
      // A read in progress may predate a device just created: read again after it.
      return this.inflight.then(() => this.refresh(options));
    }
    this.inflight = this.doRefresh(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async doRefresh({ republish = false } = {}) {
    const watches = this.createdWatches();
    if (watches.length === 0) {
      return;
    }
    this.attemptedAt = this.now();
    // One request per watch, one after the other: never a burst on the API.
    const results = [];
    let lastError = null;
    for (const watch of watches) {
      try {
        results.push(await this.efa.departures(watch));
      } catch (err) {
        lastError = err;
        results.push(null);
        logger.debug(`Cannot read the departures of ${watch.network} ${watch.id}: ${err.message}`);
      }
    }
    if (results.every((result) => result === null)) {
      if (!this.lastError) {
        logger.warn(`Cannot read the departures: ${lastError.message}`);
        await this.gladys
          .setConnectionStatus(false, sayAll(TEXT, 'serviceDown', { error: lastError.message }))
          .catch(() => {});
      }
      this.lastError = lastError.message;
      // The countdowns go on from the last expected times.
      await this.publishAll();
      return;
    }
    if (this.lastError) {
      logger.info('The network servers are reachable again');
      this.lastError = null;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
    const now = this.now();
    this.refreshedAt = now;
    const events = [];
    let memoryChanged = false;
    for (const [index, watch] of watches.entries()) {
      const result = results[index];
      if (!result) {
        // This stop only failed: its last board ages on.
        continue;
      }
      const departures = applyFilters(parseDepartures(result.events, now), watch);
      const messages = messagesFor(departures);
      this.boards.set(watchKey(watch), { departures, messages, at: now });
      const found = this.detect(watch, departures, messages, now);
      events.push(...found.events);
      memoryChanged ||= found.memoryChanged;
    }
    memoryChanged = this.pruneMemory(now) || memoryChanged;
    if (memoryChanged) {
      await this.save();
    }
    await this.publishAll({ force: republish });
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  async publishAll({ force = false } = {}) {
    const states = [];
    for (const watch of this.createdWatches()) {
      const board = this.boards.get(watchKey(watch));
      if (board) {
        states.push(
          ...stopStates(
            this.gladys,
            watch,
            aged(board.departures, this.now()),
            board.messages,
            this.config.language,
          ),
        );
      }
    }
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates?.();
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /** The scene events of a fresh read of a watch. */
  detect(watch, departures, messages, now) {
    const key = watchKey(watch);
    const deviceId = this.deviceId(watch);
    const events = [];
    let memoryChanged = false;
    // First read in this process: what is there is not news (RAM memories).
    const firstNow = !this.checkedNow.has(key);
    this.checkedNow.add(key);
    // First read ever (persisted memories).
    const firstEver = !this.memory.checked.includes(key);
    if (firstEver) {
      this.memory.checked.push(key);
      memoryChanged = true;
    }
    const base = (departure) => ({
      stop: deviceId,
      stop_name: watch.name,
      line: departure.line,
      mode: departure.mode,
      destination: departure.destination,
      platform: departure.platform,
      scheduled_time: clockTime(departure.aimed),
      expected_time: clockTime(departure.expected),
      minutes: departure.minutes,
      delay_minutes: departure.delay,
    });

    // journey key → { aimed, handled }: kept until two hours after the aimed
    // time, so a journey leaving the window and coming back is not news again.
    const soon = this.soonDone.get(key) ?? new Map();
    const delays = this.delayDone.get(key) ?? new Map();
    // A threshold crossed long before this read (server down, a 2-minute
    // interval) is too late to announce: marked, not fired.
    const slack = Math.ceil(this.config.refreshSeconds / 60);
    for (const departure of departures) {
      if (departure.cancelled) {
        const memo = this.remember(`${key}|cancel|${departure.key}`, now);
        memoryChanged ||= memo.changed;
        if (memo.fresh && !firstEver) {
          events.push({ key: TRIGGERS.CANCELLED, data: base(departure) });
        }
        continue;
      }
      // Leave now: each threshold once, when the countdown reaches it. A
      // journey first seen inside a threshold does not fire it.
      const seen = soon.get(departure.key);
      if (!seen) {
        soon.set(departure.key, {
          aimed: departure.aimed,
          handled: new Set(SOON_MINUTES.filter((minutes) => departure.minutes <= minutes)),
        });
      } else {
        for (const threshold of SOON_MINUTES) {
          if (departure.minutes <= threshold && !seen.handled.has(threshold)) {
            seen.handled.add(threshold);
            if (departure.minutes >= threshold - slack) {
              events.push({
                key: TRIGGERS.SOON,
                data: { ...base(departure), threshold: String(threshold) },
              });
            }
          }
        }
      }
      // Delay: each threshold once per journey.
      const reached = delays.get(departure.key) ?? { aimed: departure.aimed, handled: new Set() };
      for (const threshold of DELAY_MINUTES) {
        if (departure.delay >= threshold && !reached.handled.has(threshold)) {
          reached.handled.add(threshold);
          if (!firstNow) {
            events.push({
              key: TRIGGERS.DELAYED,
              data: { ...base(departure), threshold: String(threshold) },
            });
          }
        }
      }
      delays.set(departure.key, reached);
    }
    for (const map of [soon, delays]) {
      for (const [journey, entry] of map) {
        if (now - entry.aimed > JOURNEY_MEMORY_MS) {
          map.delete(journey);
        }
      }
    }
    this.soonDone.set(key, soon);
    this.delayDone.set(key, delays);

    // One event per message and line: a scene filtered on either line hears
    // it. The messages there at the first read are not news.
    for (const message of messages.filter((m) => m.important)) {
      const memoryKey = `${key}|message|${message.id}`;
      const memo = this.remember(memoryKey, now);
      memoryChanged ||= memo.changed;
      if (!memo.fresh || firstEver) {
        continue;
      }
      for (const line of message.lines.length > 0 ? message.lines : ['']) {
        events.push({
          key: TRIGGERS.DISRUPTION,
          data: {
            stop: deviceId,
            stop_name: watch.name,
            line,
            summary: clip(message.summary || message.description, 1000),
            description: clip(message.description, 1000),
          },
        });
      }
    }
    return { events, memoryChanged };
  }

  /** Records a persisted memory key: `fresh` when new, `changed` when /data must be written. */
  remember(memoryKey, now) {
    const seen = this.memory.announced[memoryKey];
    if (seen === undefined || now - seen > SEEN_WRITE_MS) {
      this.memory.announced[memoryKey] = now;
      return { fresh: seen === undefined, changed: true };
    }
    return { fresh: false, changed: false };
  }

  pruneMemory(now) {
    let changed = false;
    for (const [memoryKey, seen] of Object.entries(this.memory.announced)) {
      if (now - seen > MEMORY_MS) {
        delete this.memory.announced[memoryKey];
        changed = true;
      }
    }
    return changed;
  }

  async fire(key, data) {
    const minute = Math.floor(this.now() / 60000);
    if (this.eventMinute !== minute) {
      this.eventMinute = minute;
      this.eventCount = 0;
    }
    this.eventCount += 1;
    if (this.eventCount > EVENTS_PER_MINUTE) {
      logger.debug(`Too many scene events this minute, ${key} dropped`);
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.fireFailed = false;
    } catch (err) {
      // A 429 or Gladys restarting: said once per streak.
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- Readings for the widget and the scene action ----------------------------

  /**
   * The watch and departures of a device; read again when older than two
   * refresh intervals (a scene action right after the start).
   */
  async boardOf(externalId) {
    const watch = this.watchOfDevice(externalId);
    if (!watch) {
      return null;
    }
    let board = this.boards.get(watchKey(watch));
    // Read again when stale, unless a read was just tried (server down: the aged
    // board is served at once instead of a read per widget or scene).
    if (
      this.isCreated(externalId) &&
      (!board || this.now() - board.at > this.config.refreshSeconds * 2000) &&
      !(this.now() - (this.attemptedAt ?? 0) < this.config.refreshSeconds * 1000)
    ) {
      await this.refresh();
      board = this.boards.get(watchKey(watch));
    }
    return {
      watch,
      departures: board ? aged(board.departures, this.now()) : null,
      messages: board?.messages ?? [],
    };
  }

  // --- Configuration actions -------------------------------------------------
  //
  // Gladys shows in green what an action returns and in red what it throws:
  // every failure throws an ActionFailure with the four-language message.

  fail(key, params) {
    return new ActionFailure(sayAll(TEXT, key, params));
  }

  async call(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ActionFailure) {
        throw err;
      }
      throw this.fail('serviceDown', { error: err.message });
    }
  }

  /** The network of an action, or an ActionFailure. */
  networkOf(value) {
    const network = String(value ?? '').trim();
    if (!NETWORKS[network]) {
      throw this.fail('needNetwork');
    }
    return network;
  }

  stopLine(stop) {
    return `• ${stop.label} [${stop.id}]`;
  }

  async searchStops({ network: networkField, query } = {}) {
    const network = this.networkOf(networkField);
    const text = String(query ?? '').trim();
    if (!text) {
      throw this.fail('searchNeedText');
    }
    const stops = await this.call(() => this.efa.findStops(network, text));
    if (stops.length === 0) {
      throw this.fail('searchNone', { query: text });
    }
    const list = stops
      .slice(0, SEARCH_RESULTS)
      .map((stop) => this.stopLine(stop))
      .join('\n');
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        `${say(TEXT, lang, 'searchFound', { count: stops.length })}\n${list}\n${say(TEXT, lang, 'searchHint')}`,
      ]),
    );
  }

  /** The stop an action names: by id, by the only result, or by its exact name. */
  async resolveStop(network, text) {
    const stops = await this.call(() => this.efa.findStops(network, text));
    const id = parseStopId(text);
    if (id !== null) {
      // A global id or a stop number: the server's best answer is that stop.
      return stops.find((stop) => stop.id.toLowerCase() === id) ?? stops[0] ?? null;
    }
    if (stops.length <= 1) {
      return stops[0] ?? null;
    }
    const wanted = words(text);
    const exact = stops.filter(
      (stop) => words(stop.label) === wanted || words(stop.name) === wanted,
    );
    if (exact.length === 1) {
      return exact[0];
    }
    const list = (exact.length > 1 ? exact : stops)
      .slice(0, SEARCH_RESULTS)
      .map((stop) => this.stopLine(stop))
      .join('\n');
    const messages = sayAll(TEXT, 'addAmbiguous');
    for (const lang of Object.keys(messages)) {
      messages[lang] = `${messages[lang]}\n${list}`;
    }
    throw new ActionFailure(messages);
  }

  async addStop({ network: networkField, stop: query, lines: lineText, direction, mode } = {}) {
    const network = this.networkOf(networkField);
    const text = String(query ?? '').trim();
    if (!text) {
      throw this.fail('searchNeedText');
    }
    const stop = await this.resolveStop(network, text);
    if (!stop) {
      throw this.fail('addUnknown', { query: text, network: NETWORKS[network].name });
    }
    const wantedMode = String(mode ?? '')
      .trim()
      .toUpperCase();
    if (wantedMode && !MODES[wantedMode]) {
      throw this.fail('addUnknownMode', { mode: wantedMode });
    }
    const lines = parseLines(lineText);
    const wantedDirection = clip(String(direction ?? '').trim(), 40);
    // The lines served are those of the next departures: EFA has no list.
    const board = await this.call(() =>
      this.efa.departures({
        network,
        id: stop.id,
        mode: wantedMode,
        lines,
        direction: wantedDirection,
      }),
    );
    const departures = parseDepartures(board.events, this.now());
    const served = new Map();
    for (const departure of departures) {
      if (!wantedMode || departure.mode === wantedMode) {
        served.set(lineKey(departure.line), departure.line);
      }
    }
    const missing = lines.filter((line) => !served.has(lineKey(line)));
    if (missing.length > 0) {
      throw this.fail('addUnknownLines', {
        lines: missing.join(', '),
        available:
          clip(
            [...served.values()]
              .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
              .join(', '),
            120,
          ) || '—',
      });
    }
    // As the network writes them ("U79", "SEV RE 47"), for the name and the filter.
    const watchLines = lines.map((line) => served.get(lineKey(line)));
    if (wantedDirection) {
      // Checked like the lines: a typo would give a device that never counts down.
      const kept = applyFilters(departures, { lines: watchLines, mode: wantedMode });
      if (applyFilters(kept, { direction: wantedDirection }).length === 0) {
        throw this.fail('addUnknownDirection', {
          direction: wantedDirection,
          available:
            clip(
              [...new Set(kept.map((departure) => departure.destination))]
                .sort((x, y) => x.localeCompare(y, 'de'))
                .join(', '),
              160,
            ) || '—',
        });
      }
    }
    const watch = {
      network,
      id: stop.id,
      name: stop.label,
      lines: watchLines,
      direction: wantedDirection,
      mode: wantedMode,
    };
    const key = watchKey(watch);
    if (this.watches.some((known) => watchKey(known) === key)) {
      throw this.fail('alreadyWatched', { name: watchName(watch, this.config.language) });
    }
    if (this.watches.length >= MAX_WATCHES) {
      throw this.fail('tooMany', { max: MAX_WATCHES });
    }
    this.watches.push(watch);
    this.removed = this.removed.filter((removed) => removed !== key);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop added: ${NETWORKS[network].name} ${watchName(watch, 'en')} (${stop.id})`);
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        say(TEXT, lang, 'added', { name: watchName(watch, lang) }),
      ]),
    );
  }

  async remove({ name } = {}) {
    const text = fold(name);
    const id = parseStopId(name);
    const matches = this.watches.filter(
      (watch) =>
        fold(watchName(watch, this.config.language)) === text ||
        fold(watchName(watch, 'en')) === text ||
        watchKey(watch) === text ||
        (id !== null && watch.id === id),
    );
    const byName = matches.length > 0 ? matches : this.watches.filter((w) => fold(w.name) === text);
    if (byName.length === 0) {
      throw this.fail('removeUnknown', { query: String(name ?? '').trim() });
    }
    if (byName.length > 1) {
      throw this.fail('removeAmbiguous');
    }
    const [watch] = byName;
    this.watches = this.watches.filter((known) => known !== watch);
    const key = watchKey(watch);
    this.boards.delete(key);
    // Added again later, the stop starts afresh: nothing it held is news.
    this.soonDone.delete(key);
    this.delayDone.delete(key);
    this.checkedNow.delete(key);
    this.memory.checked = this.memory.checked.filter((checked) => checked !== key);
    for (const memoryKey of Object.keys(this.memory.announced)) {
      if (memoryKey.startsWith(`${key}|`)) {
        delete this.memory.announced[memoryKey];
      }
    }
    if (!this.removed.includes(key)) {
      this.removed.push(key);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop removed: ${watchName(watch, 'en')}`);
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => [
        lang,
        say(TEXT, lang, 'removed', { name: watchName(watch, lang) }),
      ]),
    );
  }

  status() {
    return Object.fromEntries(
      ['en', 'fr', 'de', 'es'].map((lang) => {
        if (this.watches.length === 0) {
          return [lang, say(TEXT, lang, 'statusNone')];
        }
        const lines = [say(TEXT, lang, 'statusHeader', { count: this.watches.length })];
        for (const watch of this.watches) {
          const created = this.isCreated(this.deviceId(watch));
          lines.push(
            `• ${watchName(watch, lang)} [${NETWORKS[watch.network].name} ${watch.id}] — ${say(TEXT, lang, created ? 'statusCreated' : 'statusNotCreated')}`,
          );
        }
        lines.push(
          this.refreshedAt
            ? say(TEXT, lang, 'statusRefreshed', {
                age: Math.round((this.now() - this.refreshedAt) / 1000),
              })
            : say(TEXT, lang, 'statusNeverRefreshed'),
        );
        if (this.lastError) {
          lines.push(say(TEXT, lang, 'statusError', { error: this.lastError }));
        }
        return [lang, lines.join('\n')];
      }),
    );
  }

  /** "U79 to Duisburg at Düsseldorf Hbf: in 3 and 7 min (4 min late)". */
  sentence(watch, group, language) {
    const [first, second] = group;
    let when;
    if (!second) {
      when = first.minutes === 0 ? say(TEXT, language, 'now') : say(TEXT, language, 'in', first);
    } else {
      when =
        first.minutes === 0
          ? say(TEXT, language, 'nowThen', { second: second.minutes })
          : say(TEXT, language, 'inTwo', { first: first.minutes, second: second.minutes });
    }
    const late = first.delay > 0 ? say(TEXT, language, 'delayedNote', first) : '';
    return (
      say(TEXT, language, 'sentence', {
        // "Bus 704", but "U79" and "RE5" alone: their letters already say the mode.
        line: /^\d/.test(first.line)
          ? `${modeName(first.mode, language)} ${first.line}`.trim()
          : first.line,
        destination: first.destination,
        stop: watch.name,
        when,
      }) + late
    );
  }
}
