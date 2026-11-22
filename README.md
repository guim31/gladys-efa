# EFA departures for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for public transport in
**Germany and Austria**: next departures of your stops (train, S-Bahn, U-Bahn / Stadtbahn, tram,
bus, ferry), delays, cancellations and disruptions, in real time, from the public **EFA** journey
planner servers of the transport networks: VRR, VVS, KVV, MVV, VRN, bwegt, DING, Bayern (BEG), VVO,
NWL, VMV and Linz AG. No account, no key.

## What it does

- **A device per watched stop**, optionally filtered by lines, direction or transport mode: next
  and following departure (minutes), delay of the next departure, its line and destination, and a
  disruption indicator.
- **A dashboard widget**: the next departures of a stop, with times, delays, cancellations and the
  disruptions.
- **Scene triggers**: time to leave (1 to 20 minutes before a departure), departure delayed,
  departure cancelled, new disruption.
- **A scene action**: read the next departures of a stop, with a sentence ready to send.
- Texts in English, French, German and Spanish. The networks' messages stay in German, as
  published.

The user documentation is in [`docs/en.md`](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)). It also explains the difference with the Deutsche Bahn integration and with
Transitous / GTFS.

## Requirements

- Gladys Assistant 5.3.0 or later, with internet access.
- A stop of one of the networks listed in the documentation.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-efa` and install.
3. In the integration's **Configuration** tab, use **Find a stop** then **Add a stop** (choosing
   the network), and create the device in the **Discover** tab.

## How it works

For each created device the integration reads the network's departure monitor
(`XML_DM_REQUEST`, `outputFormat=rapidJSON`, real time on), one stop after the other, every
minute (or two); the stop search uses `XML_STOPFINDER_REQUEST`. A mode filter is applied by the
server (`inclMOT_*`), lines and direction here. The traffic messages come with each departure
(`infos`): real-time trip messages, high-priority messages and messages less than a day old count
as disruptions, the standing notes of a line do not. Requests are spaced by half a second, and a
429 or 503 is tried again twice, never in a loop. Only `/data/watch.json` is written.

## Limits

- Developed without living in these regions, against the real EFA servers of VRR, VVS and KVV:
  feedback welcome.
- Feature names are set when the device is created.
- Up to 10 stops; a server returns the next 40 departures of a stop (100 with a filter).
- The networks' messages are in German only. VGN (Nuremberg) gives no real time and is not listed:
  Bayern (BEG) covers Nuremberg.
- The EFA servers have no written terms for third-party apps: the integration keeps to one request
  per stop and minute at most.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and real EFA answers recorded in `test/fixtures/efa`
(Düsseldorf Hbf, Stuttgart Hauptbahnhof, Karlsruhe Marktplatz, 22/11/2026); they never touch the
network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Cover: a stop-sign pictogram drawn for this integration (no network's logo: it serves many).
- Data: the transport networks listed above, through their EFA servers (software by Mentz GmbH).
- Inspired by the Home Assistant community integrations for EFA departures and by the
  `gladys-sl-stockholm` integration.

Not affiliated with Mentz or with any of these transport networks.

## License

Apache-2.0
