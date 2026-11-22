// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real EFA
// answers: configuration actions, discovered devices, states, scene triggers,
// widget, scene action, persistence, failures, logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_DEPARTURE_MINUTES } from '../src/devices.js';
import { MAX_WATCHES, TRIGGERS, relevantStops } from '../src/service.js';
import {
  DUESSELDORF,
  KARLSRUHE,
  STUTTGART,
  action,
  captureLogs,
  create,
  createFetch,
  createWorld,
  discovered,
  failedAction,
  lastState,
} from './helpers/world.js';
import { stageEverything } from './helpers/scenario.js';

const fr = (message) => message.fr;

test('nothing watched: no request at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.service.refresh();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(fr(await action(world, 'status')), /Aucun arrêt suivi/);
});

test('search: by name or id, in the chosen network; failures in red', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const found = await action(world, 'search_stops', {
    network: 'kvv',
    query: 'Karlsruhe Marktplatz',
  });
  assert.equal(
    fr(found),
    '2 arrêt(s) trouvé(s) :\n• Karlsruhe, Marktplatz (Pyramide U) [de:08212:1011]\n• Karlsruhe, Marktplatz (Kaiserstraße U) [de:08212:1003]\nPour en suivre un, copiez son identifiant (entre crochets) dans « Ajouter un arrêt ».',
  );
  assert.match(found.de, /Haltestelle hinzufügen/);
  assert.match(
    fr(await action(world, 'search_stops', { network: 'vrr', query: '20018235' })),
    /Düsseldorf Hbf \[de:05111:18235\]/,
  );
  assert.equal(
    fr(await failedAction(world, 'search_stops', { network: 'vrr', query: 'Xyzzyqwert' })),
    'Aucun arrêt ne correspond à « Xyzzyqwert ».',
  );
  assert.match(
    fr(await failedAction(world, 'search_stops', { network: 'vrr', query: ' ' })),
    /saisissez/,
  );
  assert.equal(
    fr(await failedAction(world, 'search_stops', { query: 'x' })),
    'Choisissez un réseau.',
  );
  world.network.fail = new TypeError('fetch failed');
  assert.equal(
    fr(await failedAction(world, 'search_stops', { network: 'vvs', query: 'Stuttgart' })),
    'Le serveur du réseau est injoignable (www3.vvs.de: fetch failed). Réessayez dans un instant.',
  );
});

test('a name EFA does not know: its fuzzy matches are not offered', () => {
  const stops = [
    { id: 'de:05111:1', name: 'Uedorf, Werthstr.', label: 'Uedorf, Werthstr.' },
    { id: 'de:05111:18235', name: 'Düsseldorf, Düsseldorf Hbf', label: 'Düsseldorf Hbf' },
    { id: 'de:08111:6118', name: 'Stuttgart, Hauptbahnhof', label: 'Stuttgart, Hauptbahnhof' },
  ];
  assert.deepEqual(relevantStops(stops, 'Xyzzyqwert'), []);
  assert.deepEqual(
    relevantStops(stops, 'Duesseldorf Hbf').map((s) => s.id),
    ['de:05111:18235'],
  );
  assert.deepEqual(
    relevantStops(stops, 'stuttgart').map((s) => s.id),
    ['de:08111:6118'],
  );
  assert.equal(relevantStops(stops, '20018235').length, 3);
});

test('add a stop: homonyms, unknown stop, line or mode, filters in the name, duplicates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ambiguous = await failedAction(world, 'add_stop', {
    network: 'kvv',
    stop: 'Karlsruhe Marktplatz',
  });
  assert.match(fr(ambiguous), /Plusieurs arrêts correspondent/);
  assert.match(fr(ambiguous), /Kaiserstraße U\) \[de:08212:1003\]/);
  assert.equal(
    fr(await failedAction(world, 'add_stop', { network: 'vrr', stop: 'Xyzzyqwert' })),
    'VRR ne connaît aucun arrêt « Xyzzyqwert ».',
  );
  const wrongLine = await failedAction(world, 'add_stop', {
    network: 'kvv',
    stop: KARLSRUHE,
    lines: 'S5, 99',
  });
  assert.equal(
    fr(wrongLine),
    'Ligne(s) absente(s) des prochains départs : 99. Lignes vues : 1, S1, S2, S4, S5, S7, S8, S11, S51.',
  );
  assert.match(
    fr(
      await failedAction(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, mode: 'funicular' }),
    ),
    /Mode « FUNICULAR » inconnu/,
  );
  // Lines typed in lower case, with spaces: written back as the network does.
  assert.equal(
    fr(
      await action(world, 'add_stop', {
        network: 'vrr',
        stop: 'Düsseldorf Hbf',
        lines: 'u79 ; sev re 47',
      }),
    ),
    "Düsseldorf Hbf (SEV RE 47, U79) ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.",
  );
  assert.equal(discovered(world, 'U79').name, 'VRR · Düsseldorf Hbf (SEV RE 47, U79)');
  assert.match(
    fr(
      await failedAction(world, 'add_stop', {
        network: 'vrr',
        stop: DUESSELDORF,
        lines: 'U79, SEV RE 47',
      }),
    ),
    /déjà suivi avec ces filtres/,
  );
  await action(world, 'add_stop', {
    network: 'vvs',
    stop: 'Stuttgart Hauptbahnhof',
    mode: 'subway',
    direction: 'gerlingen',
  });
  assert.equal(
    world.fake.discoveredDevices[1].name,
    'VVS · Stuttgart, Hauptbahnhof (→ gerlingen · U-Bahn)',
  );
  assert.equal(
    new URL(world.network.departureRequests().at(-1).url).searchParams.get('inclMOT_3'),
    'on',
  );
});

test('a direction no departure goes to is refused, with the destinations', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const error = await failedAction(world, 'add_stop', {
    network: 'vrr',
    stop: DUESSELDORF,
    lines: 'U79',
    direction: 'Köln',
  });
  assert.equal(
    fr(error),
    'Aucun prochain départ vers « Köln ». Destinations : D-Uni Ost/Botanischer Garten, D-Wittlaer.',
  );
});

test(`at most ${MAX_WATCHES} stops`, async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = ['704', '707', '708', '709', '721', '732', '738', '834', 'U75', 'U76'];
  for (const line of lines) {
    await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF, lines: line });
  }
  assert.match(
    fr(await failedAction(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF, lines: 'U79' })),
    /déjà 10 arrêts/,
  );
});

test('three networks: states at creation, one request per stop', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF, lines: 'U79' });
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF, lines: 'U75' });
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE });
  const u79 = await create(world, 'U79');
  assert.equal(lastState(world, u79, 'line'), 'U79 → D-Wittlaer');
  assert.equal(lastState(world, u79, 'next'), 2);
  assert.equal(lastState(world, u79, 'following'), 14);
  assert.equal(lastState(world, u79, 'delay'), 1);
  // Only standing notes on the U79: no disruption.
  assert.equal(lastState(world, u79, 'disruption'), 0);
  assert.ok(world.fake.widgetRefreshes.includes('departures'));
  // A vehicle failure on the U75 this morning: a disruption.
  const u75 = await create(world, 'U75');
  assert.equal(lastState(world, u75, 'disruption'), 1);
  const ka = await create(world, 'KVV');
  assert.equal(lastState(world, ka, 'line'), 'S5 → Knielingen Rheinbergstraße');
  assert.equal(lastState(world, ka, 'delay'), 5);
  const before = world.network.departureRequests().length;
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.network.departureRequests().length, before + 3);
});

test('an empty board: countdowns at their maximum, "no departure" text', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: 'S5' });
  const device = await create(world, 'KVV');
  world.network.stops[`kvv|${KARLSRUHE}`].stopEvents = [];
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(lastState(world, device, 'next'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, device, 'following'), NO_DEPARTURE_MINUTES);
  assert.equal(lastState(world, device, 'line'), 'Aucun départ annoncé');
});

test('triggers: silent first read, then once per journey and threshold', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device, events } = await stageEverything(world);
  const of = (key) => events.filter((event) => event.key === key);

  assert.deepEqual(
    of(TRIGGERS.CANCELLED).map((event) => event.data),
    [
      {
        stop: device.external_id,
        stop_name: 'Düsseldorf Hbf',
        line: '709',
        mode: 'TRAM',
        destination: 'Neuss Theodor-Heuss-Platz',
        platform: '8',
        scheduled_time: '12:07',
        expected_time: '12:07',
        minutes: 2,
        delay_minutes: 0,
      },
    ],
  );
  const delayed = of(TRIGGERS.DELAYED).filter((event) => event.data.line === 'S1');
  assert.deepEqual(
    delayed.map((event) => event.data.threshold),
    ['1', '2', '3', '5', '10'],
  );
  assert.equal(delayed[0].data.expected_time, '12:19');
  // The delays already there at the first read are not news.
  assert.ok(of(TRIGGERS.DELAYED).every((event) => event.data.line === 'S1'));
  assert.deepEqual(
    of(TRIGGERS.DISRUPTION).map((event) => event.data),
    [
      {
        stop: device.external_id,
        stop_name: 'Düsseldorf Hbf',
        line: 'U75',
        summary: 'U75: Signalstörung in Neuss',
        description: 'Verspätungen auf der Linie U75.',
      },
    ],
  );
  assert.ok(of(TRIGGERS.SOON).length > 0);
  assert.ok(
    of(TRIGGERS.SOON).every(
      (event) =>
        event.data.line !== '709' || event.data.destination !== 'Neuss Theodor-Heuss-Platz',
    ),
  );
  const count = world.fake.sceneEvents.length;
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, count);
});

test('time to leave: each threshold once, when the countdown reaches it', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: '1' });
  await create(world, 'KVV');
  const soon = () =>
    world.fake.sceneEvents
      .filter((e) => e.key === TRIGGERS.SOON && e.data.scheduled_time === '12:26')
      .map((e) => [e.data.threshold, e.data.minutes]);
  // Tram 1 to Durlach leaves at 12:26: the 20-minute threshold is reached at 12:06.
  for (let i = 0; i < 6; i += 1) {
    world.clock.advance(60000);
    await world.service.refresh();
  }
  assert.deepEqual(soon(), [['20', 20]]);
});

test('a restart does not announce the same cancellation or message again', async (t) => {
  const world = await createWorld();
  await stageEverything(world);
  await world.app.stop();
  const network = createFetch();
  network.stops = world.network.stops;
  const again = await createWorld({
    network,
    dataDir: world.dataDir,
    devices: world.fake.devices,
    clock: world.clock,
  });
  t.after(() => again.app.stop());
  world.clock.advance(60000);
  await again.service.refresh();
  const keys = again.fake.sceneEvents.map((event) => event.key);
  assert.ok(!keys.includes(TRIGGERS.CANCELLED));
  assert.ok(!keys.includes(TRIGGERS.DISRUPTION));
});

test('the container reads the departures on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true, config: { refresh_interval: '60' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  await create(world, 'Düsseldorf');
  const before = world.network.departureRequests().length;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  t.mock.timers.tick(60000);
  await world.service.inflight;
  assert.equal(world.network.departureRequests().length, before + 2);
  // A poll right after a read does not read again.
  await world.fake.poll(discovered(world, 'Düsseldorf'));
  assert.equal(world.network.departureRequests().length, before + 2);
});

test('network cut: one warning, the status, countdowns go on, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: '1' });
  const device = await create(world, 'KVV');
  assert.equal(lastState(world, device, 'next'), 12);
  const logs = captureLogs(t);
  world.network.fail = new Error('getaddrinfo EAI_AGAIN');
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  await world.service.refresh();
  assert.equal(logs.filter((line) => line.level === 'warn').length, 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Le serveur du réseau est injoignable/);
  assert.match(world.fake.connectionStatus.message.de, /nicht erreichbar/);
  assert.equal(lastState(world, device, 'next'), 9);
  assert.match(
    fr(await action(world, 'status')),
    /Dernière erreur : projekte\.kvv-efa\.de: getaddrinfo EAI_AGAIN/,
  );
  world.network.fail = null;
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(logs.some((line) => line.level === 'info' && /reachable again/.test(line.text)));
});

test('one stop failing keeps the others', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: '1' });
  await action(world, 'add_stop', { network: 'vvs', stop: STUTTGART });
  const ka = await create(world, 'KVV');
  await create(world, 'VVS');
  const fetch = world.network.fetch;
  world.service.efa.fetch = async (url) =>
    url.includes('kvv-efa') ? new Response('{}', { status: 500 }) : fetch(url);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(lastState(world, ka, 'next'), 11);
});

test('a normal read writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  await create(world, 'Düsseldorf');
  const logs = captureLogs(t);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.deepEqual(logs, []);
});

test('/data lost: the stops come back from the Gladys devices', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', {
    network: 'vrr',
    stop: DUESSELDORF,
    lines: 'u79',
    direction: 'Wittlaer',
  });
  await create(first, 'Düsseldorf');
  await first.app.stop();
  const world = await createWorld({ devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, [
    {
      network: 'vrr',
      id: DUESSELDORF,
      name: 'Düsseldorf Hbf',
      lines: ['U79'],
      direction: 'Wittlaer',
      mode: '',
    },
  ]);
  assert.equal(world.fake.discoveredDevices[0].external_id, first.fake.devices[0].external_id);
  assert.equal(world.network.departureRequests().length, 1);
});

test('a removed stop does not come back at the restart, even with its device', async (t) => {
  const first = await createWorld();
  await action(first, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  await create(first, 'Düsseldorf');
  await action(first, 'remove_stop', { name: 'Düsseldorf Hbf' });
  await first.app.stop();
  const world = await createWorld({ dataDir: first.dataDir, devices: first.fake.devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.watches, []);
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  assert.equal(world.service.watches.length, 1);
});

test('remove a stop by its name or id', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF, lines: 'U79' });
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE });
  assert.match(
    fr(await action(world, 'remove_stop', { name: 'düsseldorf hbf (u79)' })),
    /^Düsseldorf Hbf \(U79\) n'est plus/,
  );
  assert.match(fr(await action(world, 'remove_stop', { name: KARLSRUHE })), /n'est plus suivi/);
  assert.match(
    fr(await failedAction(world, 'remove_stop', { name: KARLSRUHE })),
    /Aucun arrêt suivi ne correspond/,
  );
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test('the status lists the stops and their devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE });
  await create(world, 'VRR');
  world.clock.advance(12000);
  const status = fr(await action(world, 'status'));
  assert.match(status, /Arrêts suivis : 2/);
  assert.match(status, /• Düsseldorf Hbf \[VRR de:05111:18235\] — appareil créé/);
  assert.match(
    status,
    /• Karlsruhe, Marktplatz \(Pyramide U\) \[KVV de:08212:1011\] — appareil pas encore créé/,
  );
  assert.match(status, /il y a 12 s/);
});

test('the widget: Gladys name, cancelled and late rows, disruption caption', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { device } = await stageEverything(world);
  world.gladys.devices.find((d) => d.external_id === device.external_id).name = 'Bahnhof';
  const ack = await world.fake.widgetGet('departures', {
    settings: { stop: device.external_id },
    language: 'en',
  });
  const [heading, caption, status] = ack.data.content.components;
  assert.equal(heading.text, 'Bahnhof');
  assert.match(caption.text, /^⚠ /);
  assert.ok(caption.text.length <= 120);
  assert.ok(!/Vorweihnachtszeit/.test(caption.text), 'no standing note in the caption');
  assert.equal(status.items.length, 8);
  const cancelled = status.items.find((item) => item.label === '709 → Neuss Theodor-Heuss-Platz');
  assert.deepEqual(cancelled, {
    label: '709 → Neuss Theodor-Heuss-Platz',
    value: '12:07 · Cancelled',
    color: 'danger',
  });
  const none = await world.fake.widgetGet('departures', { settings: {}, language: 'de' });
  assert.equal(
    none.data.content.components[0].text,
    'Wähle eine Haltestelle in den Widget-Einstellungen.',
  );
  const gone = await world.fake.widgetGet('departures', {
    settings: { stop: 'ext:x' },
    language: 'es',
  });
  assert.equal(gone.data.content.components[0].text, 'Esta parada ya no se sigue.');
});

test('the scene action: sentence, line filter, nothing found, unknown stop', async (t) => {
  const world = await createWorld({ config: { language: 'en' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: '1, S4' });
  const device = await create(world, 'KVV');
  const all = await world.fake.sceneAction('get_next_departures', { stop: device.external_id });
  assert.equal(
    all.data.outputs.sentence,
    'Tram 1 to Heide at Karlsruhe, Marktplatz (Pyramide U): in 12 and 32 min (1 min late). S4 to Karlsruhe Albtalbahnhof at Karlsruhe, Marktplatz (Pyramide U): in 14 and 36 min. S4 to Heilbronn Pfühlpark at Karlsruhe, Marktplatz (Pyramide U): in 24 min',
  );
  const s4 = await world.fake.sceneAction('get_next_departures', {
    stop: device.external_id,
    line: 's4',
  });
  assert.equal(s4.data.outputs.destination, 'Karlsruhe Albtalbahnhof');
  assert.equal(s4.data.outputs.platform, '3(U)');
  assert.equal(s4.data.outputs.realtime, 1);
  assert.equal(s4.data.outputs.disrupted, 0);
  const none = await world.fake.sceneAction('get_next_departures', {
    stop: device.external_id,
    line: '99',
  });
  assert.equal(none.data.outputs.minutes, NO_DEPARTURE_MINUTES);
  assert.equal(
    none.data.outputs.sentence,
    'No departure announced from Karlsruhe, Marktplatz (Pyramide U).',
  );
  const unknown = await world.fake.sceneAction('get_next_departures', { stop: 'ext:x' });
  assert.equal(unknown.success, false);
  assert.equal(unknown.error.fr, "Cet arrêt n'est plus suivi.");
});

test('a language change renames the devices, not their features', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, mode: 'tram' });
  await world.fake.configUpdated({ language: 'de' });
  assert.equal(
    world.fake.discoveredDevices[0].name,
    'KVV · Karlsruhe, Marktplatz (Pyramide U) (Straßenbahn)',
  );
});

test('server down: the widget serves the aged board instead of reading again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'kvv', stop: KARLSRUHE, lines: '1' });
  const device = await create(world, 'KVV');
  world.network.fail = 503;
  world.clock.advance(3 * 60000);
  await world.service.refresh();
  const before = world.network.calls.length;
  const ack = await world.fake.widgetGet('departures', {
    settings: { stop: device.external_id },
    language: 'en',
  });
  assert.equal(ack.data.content.components[2].items[0].value, '12:12 · 9 min · +1');
  assert.equal(world.network.calls.length, before);
});

test('a timer tick during a slow read is skipped, not queued', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  await create(world, 'Düsseldorf');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fetch = world.network.fetch;
  world.service.efa.fetch = async (url) => {
    await gate;
    return fetch(url);
  };
  const before = world.network.departureRequests().length;
  t.mock.timers.tick(60000);
  t.mock.timers.tick(60000);
  t.mock.timers.tick(60000);
  release();
  await world.service.inflight;
  await world.service.inflight;
  assert.equal(world.network.departureRequests().length, before + 1);
});
