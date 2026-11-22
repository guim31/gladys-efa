// -----------------------------------------------------------------------------
// EFA (Mentz) journey planner servers of the German and Austrian transport
// networks, read without a key through their public `rapidJSON` output:
// - XML_STOPFINDER_REQUEST: the stop search (a name, a global stop id such as
//   de:05111:18235, or a stop number);
// - XML_DM_REQUEST: the next departures of a stop ("departure monitor"), with
//   their real-time estimate, cancellation flag and the traffic messages
//   (`infos`) the network attached to each one.
//
// One request per watched stop and refresh, serialized and spaced: every
// user of the integration shares these servers with the networks' own apps.
// Each server below was checked on 2026-11-22 (stop search and real-time
// departures); a server that asked for a key or gave no real time was left out.
// -----------------------------------------------------------------------------

export const NETWORKS = {
  vrr: { name: 'VRR', region: 'Rhein-Ruhr', url: 'https://efa.vrr.de/standard/' },
  vvs: { name: 'VVS', region: 'Stuttgart', url: 'https://www3.vvs.de/mngvvs/' },
  kvv: { name: 'KVV', region: 'Karlsruhe', url: 'https://projekte.kvv-efa.de/sl3-alone/' },
  mvv: { name: 'MVV', region: 'München', url: 'https://efa.mvv-muenchen.de/ng/' },
  vrn: { name: 'VRN', region: 'Rhein-Neckar', url: 'https://www.vrn.de/mngvrn/' },
  bwegt: { name: 'bwegt', region: 'Baden-Württemberg', url: 'https://www.efa-bw.de/nvbw/' },
  ding: { name: 'DING', region: 'Ulm', url: 'https://www.ding.eu/ding3/' },
  beg: { name: 'Bayern', region: 'Bayern (BEG)', url: 'https://bahnland-bayern.de/efa/' },
  vvo: { name: 'VVO', region: 'Dresden', url: 'https://efa.vvo-online.de/std3/' },
  nwl: { name: 'NWL', region: 'Westfalen-Lippe', url: 'https://westfalenfahrplan.de/nwl-efa/' },
  vmv: {
    name: 'VMV',
    region: 'Mecklenburg-Vorpommern',
    url: 'https://fahrplanauskunft-mv.de/vmv-efa/',
  },
  linz: { name: 'Linz AG', region: 'Linz', url: 'https://www.linzag.at/linz2/' },
};

// Transport modes of a watch, and the EFA product classes ("MOT") they cover.
export const MODES = {
  TRAIN: [0, 13, 14, 15, 16],
  SUBURBAN: [1],
  SUBWAY: [2, 3],
  TRAM: [4],
  BUS: [5, 6, 7, 10, 17, 19],
  FERRY: [9],
};

/** The mode of an EFA product class, OTHER when none (cable car, taxi…). */
export function modeOfClass(productClass) {
  for (const [mode, classes] of Object.entries(MODES)) {
    if (classes.includes(productClass)) {
      return mode;
    }
  }
  return 'OTHER';
}

const TIMEOUT_MS = 20000;
// Departures asked for: a busy hub (Düsseldorf Hbf) gives about 15 minutes for
// 40, so a watch filtered by line or direction asks for more.
export const LIMIT = 40;
export const FILTERED_LIMIT = 100;
// Between two requests, and after a 429 or 503 before trying again.
export const REQUEST_GAP_MS = 500;
export const RETRY_DELAYS_MS = [2000, 5000];
const RETRY_STATUSES = new Set([429, 503]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class EfaError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** "de:05111:18235" (global stop id) or "20018235" (stop number) → itself; else null. */
export function parseStopId(text) {
  const value = String(text ?? '').trim();
  return /^[a-z]{2}:\d{1,6}:\d{1,9}$/i.test(value) || /^\d{5,9}$/.test(value)
    ? value.toLowerCase()
    : null;
}

/** The short name of a stop: "Düsseldorf Hbf", "Stuttgart, Hauptbahnhof (tief)". */
export function stopLabel(location) {
  const short = String(location?.disassembledName ?? '').trim();
  const full = String(location?.name ?? '').trim();
  const town = String(location?.parent?.name ?? '').trim();
  if (!short) {
    return full;
  }
  return town && !short.toLowerCase().includes(town.toLowerCase().split(/[ ,/(]/)[0])
    ? `${town}, ${short}`
    : short;
}

export class Efa {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep] instant in the tests
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, now = Date.now, sleep = wait } = {}) {
    this.fetch = fetchImpl;
    this.now = now;
    this.sleep = sleep;
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }

  /** One request at a time, spaced, a 429 or 503 tried again (RETRY_DELAYS_MS). */
  request(url) {
    const run = this.queue.then(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const gap = this.lastRequestAt + REQUEST_GAP_MS - this.now();
        if (gap > 0) {
          await this.sleep(gap);
        }
        let error;
        try {
          return await this.requestOnce(url);
        } catch (err) {
          error = err;
        } finally {
          this.lastRequestAt = this.now();
        }
        if (!RETRY_STATUSES.has(error.status) || attempt >= RETRY_DELAYS_MS.length) {
          throw error;
        }
        await this.sleep(RETRY_DELAYS_MS[attempt]);
        this.lastRequestAt = 0;
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async requestOnce(url) {
    const host = new URL(url).host;
    let response;
    try {
      response = await this.fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new EfaError(`${host}: ${err.name === 'TimeoutError' ? 'timeout' : err.message}`);
    }
    if (!response.ok) {
      throw new EfaError(`${host}: HTTP ${response.status}`, response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new EfaError(`${host}: invalid JSON`);
    }
  }

  static url(network, request, params) {
    const base = NETWORKS[network]?.url;
    if (!base) {
      throw new EfaError(`unknown network ${String(network).slice(0, 20)}`);
    }
    const url = new URL(`${base}${request}`);
    url.searchParams.set('outputFormat', 'rapidJSON');
    // Plain stop ids in the answers, not the encoded "SpEnc" form.
    url.searchParams.set('SpEncId', '0');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /**
   * The stops matching a text, best match first.
   * @returns {Promise<{ id: string, name: string, label: string, town: string, quality: number }[]>}
   */
  async findStops(network, text) {
    const body = await this.request(
      Efa.url(network, 'XML_STOPFINDER_REQUEST', { type_sf: 'any', name_sf: text }),
    );
    const locations = Array.isArray(body?.locations) ? body.locations : [];
    return locations
      .filter((location) => location?.type === 'stop' && typeof location.id === 'string')
      .map((location) => ({
        id: location.id,
        name: String(location.name ?? location.id),
        label: stopLabel(location),
        town: String(location.parent?.name ?? ''),
        quality: Number(location.matchQuality) || 0,
      }))
      .sort((a, b) => b.quality - a.quality);
  }

  /**
   * The raw departures (`stopEvents`) of a stop, filtered by mode on the
   * server when the watch has one.
   * @param {{ network: string, id: string, mode?: string, lines?: string[], direction?: string }} watch
   */
  async departures(watch) {
    const params = {
      mode: 'direct',
      type_dm: 'stop',
      name_dm: watch.id,
      useRealtime: 1,
      depType: 'stopEvents',
      limit: watch.lines?.length || watch.direction || watch.mode ? FILTERED_LIMIT : LIMIT,
    };
    if (MODES[watch.mode]) {
      params.includedMeans = 'checkbox';
      for (const productClass of MODES[watch.mode]) {
        params[`inclMOT_${productClass}`] = 'on';
      }
    }
    const body = await this.request(Efa.url(watch.network, 'XML_DM_REQUEST', params));
    if (!body || typeof body !== 'object') {
      throw new EfaError(`${NETWORKS[watch.network].name}: unexpected answer`);
    }
    // An unknown stop gives no `locations` and no `stopEvents`.
    const located = (body.locations ?? []).some((location) => location?.id);
    return {
      located,
      events: Array.isArray(body.stopEvents) ? body.stopEvents : [],
    };
  }
}
