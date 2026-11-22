// -----------------------------------------------------------------------------
// From the real EFA answers (test/fixtures/efa, 2026-11-22 around 12:00) to
// departures and traffic messages: times, delays, cancellations, lines,
// platforms, filters, and which messages are a disruption.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aged,
  applyFilters,
  clockTime,
  fold,
  lineOf,
  messagesFor,
  parseDepartures,
  parseEfaTime,
  running,
  words,
} from '../src/departures.js';
import { FIXTURE_TIME, fixtureJson } from './helpers/world.js';

const board = (name) => parseDepartures(fixtureJson(name).stopEvents, FIXTURE_TIME);
const VRR = 'dm-vrr-duesseldorf-hbf.json';
const VVS = 'dm-vvs-stuttgart-hbf.json';
const KVV = 'dm-kvv-karlsruhe-marktplatz.json';

test('EFA times carry their zone; a time without one is refused', () => {
  assert.equal(parseEfaTime('2026-11-22T10:57:30Z'), Date.parse('2026-11-22T10:57:30Z'));
  assert.equal(parseEfaTime('2026-11-22T11:57:30+01:00'), Date.parse('2026-11-22T10:57:30Z'));
  assert.ok(Number.isNaN(parseEfaTime('2026-11-22T11:57:30')));
  assert.ok(Number.isNaN(parseEfaTime(undefined)));
});

test('Düsseldorf Hbf: lines, modes, platforms, delays, the cancelled RE5', () => {
  const departures = board(VRR);
  assert.equal(departures.length, 40);
  // Soonest first, by the expected time.
  for (let i = 1; i < departures.length; i += 1) {
    assert.ok(departures[i - 1].expected <= departures[i].expected);
  }
  const re5 = departures[0];
  assert.equal(re5.line, 'RE5');
  assert.equal(re5.mode, 'TRAIN');
  assert.equal(re5.destination, 'Koblenz Hauptbahnhof');
  assert.equal(re5.platform, '16');
  assert.equal(re5.cancelled, true);
  assert.equal(re5.realtime, false);
  const s8 = departures.find((d) => d.line === 'S8' && d.destination === 'Wuppertal Oberbarmen');
  assert.equal(s8.mode, 'SUBURBAN');
  assert.equal(s8.delay, 9);
  assert.equal(s8.minutes, 9);
  assert.equal(s8.realtime, true);
  assert.equal(departures.find((d) => d.line === 'U79').mode, 'SUBWAY');
  assert.equal(departures.find((d) => d.line === '704').mode, 'TRAM');
  // Rail replacement buses keep their full name, long-distance trains their type.
  assert.equal(departures.find((d) => d.line === 'SEV RE 47').mode, 'BUS');
  assert.ok(departures.some((d) => d.line === 'ICE 627' && d.destination === 'Nürnberg Hbf'));
  assert.ok(departures.some((d) => d.line === 'IC 2202'));
  assert.equal(running(departures).length, 39);
});

test('Stuttgart and Karlsruhe: Stadtbahn as U-Bahn, the cancelled RE8 and S4', () => {
  const stuttgart = board(VVS);
  assert.equal(stuttgart.find((d) => d.line === 'U7').mode, 'SUBWAY');
  assert.equal(stuttgart.find((d) => d.line === 'S5').platform, '101');
  assert.equal(stuttgart.find((d) => d.line === 'RE8').cancelled, true);
  const karlsruhe = board(KVV);
  const s4 = karlsruhe.find((d) => d.cancelled);
  assert.equal(s4.line, 'S4');
  assert.equal(s4.destination, 'Flehingen');
  assert.equal(s4.platform, '4(U)');
  assert.equal(karlsruhe.find((d) => d.line === '1').mode, 'TRAM');
});

test('lineOf: short name, then number with the train type, then name', () => {
  assert.equal(lineOf({ disassembledName: 'U79', number: 'U79' }), 'U79');
  assert.equal(lineOf({ number: '627', properties: { trainType: 'ICE' } }), 'ICE 627');
  assert.equal(lineOf({ number: 'SEV RE 47', properties: { trainType: 'SEV' } }), 'SEV RE 47');
  assert.equal(lineOf({ name: 'ICE', properties: { trainType: 'ICE' } }), 'ICE');
  assert.equal(lineOf({}), '?');
});

test('a departure gone a minute ago is dropped; the countdown ages', () => {
  const later = FIXTURE_TIME + 3 * 60000;
  const fresh = parseDepartures(fixtureJson(KVV).stopEvents, later);
  assert.ok(fresh.length < 40);
  const old = aged(board(KVV), later);
  assert.equal(old.length, fresh.length);
  assert.deepEqual(
    old.map((d) => d.minutes),
    fresh.map((d) => d.minutes),
  );
});

test('filters: lines (case and spaces ignored), direction (accents ignored), mode', () => {
  const departures = board(VRR);
  const u79 = applyFilters(departures, { lines: ['u79'] });
  assert.deepEqual([...new Set(u79.map((d) => d.line))], ['U79']);
  assert.equal(applyFilters(departures, { lines: ['sev re47'] }).length, 1);
  const wittlaer = applyFilters(departures, { lines: ['U79'], direction: 'wittlaer' });
  assert.equal(wittlaer.length, 1);
  const trams = applyFilters(departures, { mode: 'TRAM' });
  assert.ok(trams.length > 5 && trams.every((d) => d.mode === 'TRAM'));
  assert.equal(applyFilters(board(VVS), { direction: 'Dürrlewang' }).length, 2);
  assert.equal(applyFilters(board(VVS), { direction: 'durrlewang' }).length, 2);
});

test('messages: once each with their lines; the standing notes are not disruptions', () => {
  const messages = messagesFor(board(VRR));
  const wuppertal = messages.find((m) => m.id === 'ZTP-PROD-141575');
  assert.deepEqual(wuppertal.lines, ['S8', 'S28', 'RE13']);
  assert.equal(wuppertal.important, true);
  assert.match(wuppertal.summary, /^Region\s+Wuppertal Zoologischer Garten nicht befahrbar/);
  assert.match(wuppertal.description, /Ersatzverkehr \(SEV\)/);
  // A vehicle failure written this morning as a plain line message: news.
  const u75 = messages.find((m) => m.id === '314802');
  assert.equal(u75.important, true);
  assert.equal(u75.summary, 'Linie U75: Fahrzeugstörung im Bereich Neuss Hbf.');
  // A seasonal offer attached to the U79 for days: not a disruption.
  assert.equal(messages.find((m) => m.id === '314539').important, false);
  // The important ones first.
  const firstPlain = messages.findIndex((m) => !m.important);
  assert.ok(messages.slice(firstPlain).every((m) => !m.important));

  const stuttgart = messagesFor(board(VVS));
  // A title that only lists the lines gives way to the headline.
  const re8 = stuttgart.find((m) => m.id === 'ems-28850');
  assert.equal(re8.important, true);
  assert.match(re8.summary, /^Heilbronn - Stuttgart: ganztägig Zugausfälle/);
  assert.equal(stuttgart.find((m) => m.id === 'ems-28977').important, false);
  assert.equal(
    stuttgart.filter((m) => m.important).length,
    2,
    'only the two very high VVS messages',
  );
  assert.ok(
    stuttgart.every((m) => !/<[a-z]/i.test(m.description)),
    'no HTML left',
  );
});

test('fold and words: German letters and punctuation', () => {
  assert.equal(fold('Düsseldorf Straße'), 'dusseldorf strasse');
  assert.equal(words('Stuttgart, Hauptbahnhof'), words('stuttgart hauptbahnhof'));
});

test('clock times follow TZ (the zone Gladys gives the container)', () => {
  assert.equal(clockTime(Date.parse('2026-11-22T11:07:00Z')), '12:07');
});
