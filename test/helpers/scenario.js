// -----------------------------------------------------------------------------
// A scenario staging every trigger on the real Düsseldorf Hbf departures: the
// first read is silent, then, five minutes later, a tram is cancelled, an
// S-Bahn is 12 minutes late, a new traffic message concerns the U75, and the
// countdowns go on. The changes are made on the recorded answers, as the VRR
// server would send them.
// -----------------------------------------------------------------------------

import { DUESSELDORF, action, create } from './world.js';

/** "2026-11-22T11:07:00Z" + minutes, in the same format as EFA. */
export function shift(time, minutes) {
  return new Date(Date.parse(time) + minutes * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** A traffic message as EFA attaches it to a departure. */
export function efaInfo({ id, title, content, type = 'tripMessage', priority = 'normal' }) {
  return {
    timestamps: { creation: '2026-11-22T10:50:00Z' },
    priority,
    id,
    version: 1,
    type,
    properties: { publisher: 'ems.comm.addinfo', infoType: type },
    infoLinks: [{ urlText: '', url: 'http://example.invalid', content, subtitle: title, title }],
  };
}

/** The recorded stop event of `line` towards `destination`. */
export const findEvent = (events, line, destination) =>
  events.find(
    (e) =>
      e.transportation.disassembledName === line &&
      e.transportation.destination.name === destination,
  );

/** Resolves with the scene events fired after the first read. */
export async function stageEverything(world) {
  await action(world, 'add_stop', { network: 'vrr', stop: DUESSELDORF });
  const device = await create(world, 'Düsseldorf Hbf');
  const before = world.fake.sceneEvents.length;
  const events = world.network.stops[`vrr|${DUESSELDORF}`].stopEvents;
  // Tram 709 to Neuss (12:07): cancelled.
  const cancelled = findEvent(events, '709', 'Neuss Theodor-Heuss-Platz');
  cancelled.isCancelled = true;
  cancelled.realtimeStatus = ['TRIP_CANCELLED', 'MONITORED'];
  // S1 to Dortmund (12:07): 12 minutes late.
  const late = findEvent(events, 'S1', 'Dortmund Hbf');
  late.departureTimeEstimated = shift(late.departureTimePlanned, 12);
  // A new message about the U75.
  for (const event of events.filter((e) => e.transportation.disassembledName === 'U75')) {
    event.infos = [
      ...(event.infos ?? []),
      efaInfo({
        id: 'TEST-U75-1',
        title: 'U75: Signalstörung in Neuss',
        content: 'Verspätungen auf der Linie U75.',
      }),
    ];
  }
  world.clock.advance(5 * 60000);
  await world.service.refresh();
  return { device, events: world.fake.sceneEvents.slice(before) };
}
