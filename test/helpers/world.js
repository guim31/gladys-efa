// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` answering like
// the EFA servers from the real responses of test/fixtures/efa (captured on
// 2026-11-22 around 12:00 in Germany), a manual clock, a temporary /data, and
// the integration wired on top through registerHandlers. Nothing touches the
// network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MODES, NETWORKS } from '../../src/efa.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Berlin';

export const fixtureJson = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/efa/${name}`, import.meta.url), 'utf8'));

// 2026-11-22 12:00:00 in Germany: when the departures were captured.
export const FIXTURE_TIME = Date.parse('2026-11-22T11:00:00Z');

export const DUESSELDORF = 'de:05111:18235'; // VRR: trains, S-Bahn, U-Bahn, tram, bus
export const STUTTGART = 'de:08111:6118'; // VVS: S-Bahn, Stadtbahn, bus
export const KARLSRUHE = 'de:08212:1011'; // KVV: S-Bahn, tram

/** The recorded departures of each network and stop, a deep copy the test may change. */
export function recordedStops() {
  return {
    [`vrr|${DUESSELDORF}`]: fixtureJson('dm-vrr-duesseldorf-hbf.json'),
    [`vvs|${STUTTGART}`]: fixtureJson('dm-vvs-stuttgart-hbf.json'),
    [`kvv|${KARLSRUHE}`]: fixtureJson('dm-kvv-karlsruhe-marktplatz.json'),
  };
}

// The recorded stop searches: network|text → fixture.
const SEARCHES = {
  'vrr|düsseldorf hbf': 'sf-vrr-duesseldorf-hbf.json',
  [`vrr|${DUESSELDORF}`]: 'sf-vrr-duesseldorf-hbf.json',
  'vrr|20018235': 'sf-vrr-duesseldorf-hbf.json',
  'vrr|marktplatz': 'sf-vrr-marktplatz.json',
  'vvs|stuttgart hauptbahnhof': 'sf-vvs-stuttgart-hbf.json',
  [`vvs|${STUTTGART}`]: 'sf-vvs-stuttgart-hbf.json',
  'kvv|karlsruhe marktplatz': 'sf-kvv-karlsruhe-marktplatz.json',
  [`kvv|${KARLSRUHE}`]: 'sf-kvv-karlsruhe-marktplatz.json',
};

/**
 * A fake `fetch` answering like the EFA servers. `stops` holds the departures
 * of each network|stop (change them to stage a delay, a cancellation);
 * `fail` makes every request fail with an Error or an HTTP status. The mode
 * filter (inclMOT_*) and the limit are applied as EFA does. Every call is
 * recorded in `calls`.
 */
export function createFetch() {
  const network = { stops: recordedStops(), calls: [], fail: null };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  network.fetch = async (url) => {
    network.calls.push({ url });
    if (network.fail instanceof Error) {
      throw network.fail;
    }
    if (typeof network.fail === 'number') {
      return new Response('Service Unavailable', { status: network.fail });
    }
    const parsed = new URL(url);
    const key = Object.keys(NETWORKS).find((k) => url.startsWith(NETWORKS[k].url));
    if (!key || parsed.searchParams.get('outputFormat') !== 'rapidJSON') {
      return new Response('not found', { status: 404 });
    }
    if (parsed.pathname.endsWith('/XML_STOPFINDER_REQUEST')) {
      const text = parsed.searchParams.get('name_sf').toLowerCase();
      return json(fixtureJson(SEARCHES[`${key}|${text}`] ?? 'sf-vrr-unknown.json'));
    }
    if (parsed.pathname.endsWith('/XML_DM_REQUEST')) {
      const stop = parsed.searchParams.get('name_dm');
      const body = network.stops[`${key}|${stop}`];
      if (!body) {
        return json(fixtureJson('dm-unknown.json'));
      }
      const copy = structuredClone(body);
      const classes = Object.values(MODES)
        .flat()
        .filter((c) => parsed.searchParams.get(`inclMOT_${c}`) === 'on');
      if (parsed.searchParams.get('includedMeans') === 'checkbox') {
        copy.stopEvents = copy.stopEvents.filter((e) =>
          classes.includes(e.transportation.product.class),
        );
      }
      copy.stopEvents = copy.stopEvents.slice(0, Number(parsed.searchParams.get('limit')));
      return json(copy);
    }
    return new Response('not found', { status: 404 });
  };
  network.departureRequests = () =>
    network.calls.filter((call) => call.url.includes('XML_DM_REQUEST'));
  return network;
}

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.saved] content of /data/watch.json before the start
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  saved,
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-efa-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    timers,
    now: clock.now,
    // No real wait: the clock is manual.
    sleep: async () => {},
    dataDir,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    service: app.service,
    network,
    clock,
    store,
    dataDir,
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`action ${key} failed: ${JSON.stringify(ack.error)}`);
  }
  return ack.data.message;
}

/** Run an action expected to fail: resolves with its error (multi-language). */
export async function failedAction(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (ack.success !== false || typeof ack.error?.fr !== 'string' || !ack.error.fr) {
    throw new Error(`action ${key} did not fail with a message: ${JSON.stringify(ack)}`);
  }
  return ack.error;
}

/** The discovered device whose name contains `name`. */
export function discovered(world, name) {
  const device = world.fake.discoveredDevices.find((d) => d.name.includes(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** "Add to Gladys" on the discovered device named `name`; resolves with it. */
export async function create(world, name) {
  const device = discovered(world, name);
  await world.fake.deviceCreated(device);
  return device;
}

/** The last state published on a feature of a device. */
export const lastState = (world, device, key) =>
  world.fake.lastState(`${device.external_id}:${key}`);

/** Captures the log lines of the integration at `level` and above. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
