// -----------------------------------------------------------------------------
// The EFA client: request URLs, stop search, departures, retries and errors,
// against a fake `fetch` answering with the recorded responses.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Efa,
  FILTERED_LIMIT,
  LIMIT,
  NETWORKS,
  RETRY_DELAYS_MS,
  modeOfClass,
  parseStopId,
} from '../src/efa.js';
import { DUESSELDORF, KARLSRUHE, createFetch } from './helpers/world.js';

const client = (network = createFetch()) => {
  const sleeps = [];
  const efa = new Efa({
    fetch: network.fetch,
    now: () => 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { efa, network, sleeps };
};

test('every network is an https EFA base, the brief three included', () => {
  for (const [key, network] of Object.entries(NETWORKS)) {
    assert.match(network.url, /^https:\/\/[^/]+\/.+\/$/, key);
    assert.ok(network.name && network.region, key);
  }
  for (const key of ['vrr', 'vvs', 'kvv']) {
    assert.ok(NETWORKS[key], key);
  }
});

test('stop ids: global ids and stop numbers, nothing else', () => {
  assert.equal(parseStopId(' de:05111:18235 '), 'de:05111:18235');
  assert.equal(parseStopId('at:44:41164'), 'at:44:41164');
  assert.equal(parseStopId('20018235'), '20018235');
  assert.equal(parseStopId('Düsseldorf Hbf'), null);
  assert.equal(parseStopId('de:05111'), null);
  assert.equal(parseStopId('123'), null);
});

test('product classes map to the modes of a watch', () => {
  assert.equal(modeOfClass(13), 'TRAIN');
  assert.equal(modeOfClass(16), 'TRAIN');
  assert.equal(modeOfClass(1), 'SUBURBAN');
  assert.equal(modeOfClass(3), 'SUBWAY');
  assert.equal(modeOfClass(4), 'TRAM');
  assert.equal(modeOfClass(17), 'BUS');
  assert.equal(modeOfClass(9), 'FERRY');
  assert.equal(modeOfClass(8), 'OTHER');
  assert.equal(modeOfClass(undefined), 'OTHER');
});

test('stop search: stops only, best match first, labels with the town', async () => {
  const { efa, network } = client();
  const stops = await efa.findStops('vrr', 'Düsseldorf Hbf');
  assert.deepEqual(
    stops.map((s) => [s.id, s.label]),
    [[DUESSELDORF, 'Düsseldorf Hbf']],
  );
  const url = new URL(network.calls[0].url);
  assert.equal(url.origin + url.pathname, `${NETWORKS.vrr.url}XML_STOPFINDER_REQUEST`);
  assert.equal(url.searchParams.get('outputFormat'), 'rapidJSON');
  assert.equal(url.searchParams.get('name_sf'), 'Düsseldorf Hbf');
  const karlsruhe = await efa.findStops('kvv', 'Karlsruhe Marktplatz');
  assert.deepEqual(
    karlsruhe.map((s) => s.label),
    ['Karlsruhe, Marktplatz (Pyramide U)', 'Karlsruhe, Marktplatz (Kaiserstraße U)'],
  );
  assert.deepEqual(await efa.findStops('vrr', 'Xyzzyqwert'), []);
});

test('departures: limit, server-side mode filter, unknown stop', async () => {
  const { efa, network } = client();
  const all = await efa.departures({ network: 'kvv', id: KARLSRUHE });
  assert.equal(all.located, true);
  assert.equal(all.events.length, LIMIT);
  let url = new URL(network.calls.at(-1).url);
  assert.equal(url.searchParams.get('name_dm'), KARLSRUHE);
  assert.equal(url.searchParams.get('useRealtime'), '1');
  assert.equal(url.searchParams.get('limit'), String(LIMIT));
  assert.equal(url.searchParams.get('includedMeans'), null);
  const trams = await efa.departures({ network: 'kvv', id: KARLSRUHE, mode: 'TRAM' });
  url = new URL(network.calls.at(-1).url);
  assert.equal(url.searchParams.get('includedMeans'), 'checkbox');
  assert.equal(url.searchParams.get('inclMOT_4'), 'on');
  assert.equal(url.searchParams.get('limit'), String(FILTERED_LIMIT));
  assert.ok(trams.events.every((e) => e.transportation.product.class === 4));
  const unknown = await efa.departures({ network: 'vrr', id: 'de:05111:99999999' });
  assert.deepEqual(unknown, { located: false, events: [] });
  await assert.rejects(efa.departures({ network: 'nope', id: KARLSRUHE }), /unknown network/);
});

test('a 503 or 429 is tried again twice, then reported; other errors at once', async () => {
  const network = createFetch();
  const { efa, sleeps } = client(network);
  network.fail = 503;
  await assert.rejects(efa.departures({ network: 'vrr', id: DUESSELDORF }), {
    message: 'efa.vrr.de: HTTP 503',
  });
  assert.equal(network.calls.length, 3);
  assert.deepEqual(
    sleeps.filter((ms) => ms >= 2000),
    RETRY_DELAYS_MS,
  );
  network.calls.length = 0;
  network.fail = 500;
  await assert.rejects(efa.findStops('vvs', 'x'), { message: 'www3.vvs.de: HTTP 500' });
  assert.equal(network.calls.length, 1);
  network.fail = new TypeError('fetch failed');
  await assert.rejects(efa.findStops('vvs', 'x'), { message: 'www3.vvs.de: fetch failed' });
});

test('an answer that is not JSON is an error', async () => {
  const efa = new Efa({ fetch: async () => new Response('<html>'), sleep: async () => {} });
  await assert.rejects(efa.findStops('vrr', 'x'), { message: 'efa.vrr.de: invalid JSON' });
});
