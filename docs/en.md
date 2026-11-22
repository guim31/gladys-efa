# EFA departures (VRR, VVS, KVV…)

Next departures of your stops in Germany and Austria in Gladys: trains, S-Bahn, U-Bahn and
Stadtbahn, trams, buses and ferries, with delays, cancellations and disruptions, in real time.

The data comes from the public journey planner of each transport network, built on the **EFA**
software (Mentz): VRR (Rhein-Ruhr), VVS (Stuttgart), KVV (Karlsruhe), MVV (Munich) and the other
networks listed below. **No account and no key.** This integration is not affiliated with Mentz or
any of these networks.

## What you get

- **A device per watched stop** (optionally filtered by lines, direction or transport mode): next
  departure and following departure (minutes), delay of the next departure (minutes), its line and
  destination (text), and whether a disruption concerns the departures kept (yes/no).
- **A dashboard widget** with the next departures of a stop: time, minutes, delay, cancelled
  departures in red, disruptions on top.
- **Four scene triggers**: time to leave, departure delayed, departure cancelled, new disruption.
- **A scene action** that reads the next departures of a stop, with a sentence ready to send by
  message or speaker.

## Requirements

- Gladys Assistant 5.3.0 or later.
- Internet access from the Gladys host.
- A stop of one of these networks (each server was checked on 22 November 2026):

| Network      | Area                                      | Server                   |
| ------------ | ----------------------------------------- | ------------------------ |
| VRR          | Rhein-Ruhr (Düsseldorf, Essen, Dortmund…) | `efa.vrr.de`             |
| VVS          | Stuttgart                                 | `www3.vvs.de`            |
| KVV          | Karlsruhe                                 | `projekte.kvv-efa.de`    |
| MVV          | Munich                                    | `efa.mvv-muenchen.de`    |
| VRN          | Rhein-Neckar (Mannheim, Heidelberg…)      | `www.vrn.de`             |
| bwegt        | all of Baden-Württemberg                  | `www.efa-bw.de`          |
| DING         | Ulm                                       | `www.ding.eu`            |
| Bayern (BEG) | all of Bavaria (Nuremberg included)       | `bahnland-bayern.de`     |
| VVO          | Dresden                                   | `efa.vvo-online.de`      |
| NWL          | Westfalen-Lippe (Münster, Bielefeld…)     | `westfalenfahrplan.de`   |
| VMV          | Mecklenburg-Vorpommern                    | `fahrplanauskunft-mv.de` |
| Linz AG      | Linz (Austria)                            | `www.linzag.at`          |

How it differs from neighbours in the store: the **Deutsche Bahn** integration
(`LM1LC3N7/gladys-deutsche-bahn`) follows DB trains; this one reads the local network's own
departure board, the one shown at the stop, with its U-Bahn, trams and buses and the network's
messages. **Transitous** and **gladys-gtfs** read GTFS feeds, worldwide, with real time where a feed
provides it; here the real time is the network's own.

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-efa` and install.
3. Open the integration's **Configuration** tab.

## Configuration

### Settings

- **Language of the texts**: language of the feature names (set when a device is created) and of
  the scene sentences. The networks write their messages in German: they are shown as they are.
- **Refresh interval**: 1 minute (default) or 2 minutes. One request per created device.

### Adding a stop

1. **Find a stop**: choose the network, type a name (`Düsseldorf Hbf`, `Stuttgart Hauptbahnhof`…).
   The answer lists the matching stops with their identifier, `Düsseldorf Hbf [de:05111:18235]` for
   example.
2. **Add a stop**: choose the network again and type the identifier (or the exact name when it is
   unique). Optional filters:
   - **Lines**: `U79, 704` keeps only these lines, as written on the vehicle (`RE5`, `S1`,
     `SEV RE 47`…), separated by commas. They are checked against the next departures.
   - **Direction**: `Duisburg` keeps only the departures whose destination contains this text
     (accents and case ignored).
   - **Mode**: train, S-Bahn, U-Bahn / Stadtbahn, tram, bus or ferry, for the large hubs. This
     filter is applied by the server, so the board reaches further ahead.
3. Open the **Discover** tab and add the device to Gladys.

The same stop with other filters makes another device: add the U79 towards Duisburg and the U79
towards the city to follow both directions. Up to 10 stops can be watched.

### Removing a stop, checking the state

- **Remove a stop**: type its name as shown by the status (`Düsseldorf Hbf (U79)`) or its
  identifier. Its device stays in Gladys until you delete it.
- **Show what is watched**: the stops, whether their device exists, the last read and the last
  error.

## Devices

| Feature              | Type            | Content                                                       |
| -------------------- | --------------- | ------------------------------------------------------------- |
| Next departure       | duration (min)  | minutes before the next departure that runs (0 = leaving now) |
| Following departure  | duration (min)  | minutes before the one after                                  |
| Delay                | duration (min)  | delay of the next departure (0 when on time or early)         |
| Line and destination | text            | `U79 → D-Wittlaer`                                            |
| Disruption           | binary (yes/no) | a disruption concerns a departure kept by the filters         |

Cancelled departures are skipped by the countdowns. With no departure announced, the countdowns
show 1440 minutes. Only the departures kept by the filters count.

A **disruption** is a real-time trip message, a message of high priority, or one written in the
last 24 hours. The networks also attach long-standing notes to every departure of a line (works,
accessibility, sometimes seasonal offers): they are not counted, so that the feature does not stay
on for months.

## Dashboard widget

**Next departures**: choose a stop. The widget shows its next eight departures (line, destination,
expected time, minutes, delay): green when counted down in real time, orange when two minutes late
or more, red when cancelled, grey for a timetable time. The caption shows the disruptions. The
heading is the name you gave the device in Gladys.

## Scene triggers

Each trigger can be limited to a stop and to a line (exactly as written on the vehicle).

- **Time to leave**: a departure leaves in the chosen number of minutes (1 to 20). Fires once per
  departure, when its countdown reaches the number. A departure first seen inside the window does
  not fire.
- **Departure delayed**: a departure is late by the chosen number of minutes or more (1 to 60).
  Once per departure and threshold.
- **Departure cancelled**: an upcoming departure is cancelled. Once per departure.
- **New disruption**: a new disruption concerns a departure of the stop. Once per message and line.

Variables passed to the scene: stop, line, mode (`TRAIN`, `SUBURBAN`, `SUBWAY`, `TRAM`, `BUS`,
`FERRY`, `OTHER`), destination, platform, scheduled and expected times, minutes, delay; for a
disruption, its summary and details (in German). What is already there when the integration starts
is not announced; cancellations and messages already announced are not announced again after a
restart.

## Scene actions

**Read the next departures**: choose a stop, optionally a line. Outputs: a sentence
(`U79 to D-Wittlaer at Düsseldorf Hbf: in 2 and 14 min`), the stop, line, destination, minutes to
wait, minutes to the following one, delay, expected time, platform, real time (1/0), disruption
(1/0). The sentence follows the language of the configuration.

## Scene examples

- **Leave for the tram**: trigger "Time to leave", stop Düsseldorf Hbf (704), 7 min → send "Your
  tram leaves in {{minutes}} min from platform {{platform}}" and blink the hall light.
- **Morning briefing**: at 7:00 on weekdays, action "Read the next departures" → send its sentence
  to the kitchen speaker.
- **Warn of a cancelled S-Bahn**: trigger "Departure cancelled", stop Karlsruhe Marktplatz (S4) →
  send a message with the destination and the scheduled time.

## Data, refresh and quotas

The EFA servers are the public back-ends of the networks' own journey planners and departure
monitors. They need no key, and none of them publishes written terms for third-party apps: several
networks (VRR, VVS, KVV, MVV…) release their timetables as open data, the real-time boards are
shown here as their websites show them. The integration stays light: one request per created
device and refresh (at most once a minute), the stops read one after the other, spaced by half a
second, a refused request (HTTP 429 or 503) tried again twice; nothing is read for a stop you did
not create in Gladys. Departures are the network's real time when the vehicle is tracked, else
the timetable. Data © the respective networks.

## Troubleshooting

- **No device in Discover**: add the stop first, with "Add a stop".
- **"The network server cannot be reached"**: the Gladys host has no internet access, or the
  network's server is down. The integration retries at each refresh and says when it is back.
- **A line filter is refused**: the answer lists the lines of the next departures; type the line as
  written there. A line that runs rarely may be absent at the moment: try again later, or add the
  stop with a mode filter.
- **Several stops share a name** (`Karlsruhe, Marktplatz (Pyramide U)` and
  `Karlsruhe, Marktplatz (Kaiserstraße U)`): use the identifier shown by "Find a stop".
- **A trigger does not fire**: check the line (exactly as written) and that the device exists in
  Gladys: only created devices are read.

## Limits

- Developed without living in these regions, against the real EFA servers of VRR, VVS and KVV:
  feedback welcome.
- Feature names are set when the device is created.
- Messages are in German, never translated.
- A server returns the next 40 departures of a stop (100 with a filter): at a large hub that is
  about 15 to 40 minutes ahead. Use a line or mode filter for a line that runs rarely.
- VGN (Nuremberg) is not listed: its server gives no real time; use **Bayern (BEG)**, which covers
  Nuremberg with real time.

## Credits

Data: the transport networks listed above, through their EFA servers (Mentz). Inspired by the
Home Assistant community integrations for EFA departures and by the `gladys-sl-stockholm`
integration.
