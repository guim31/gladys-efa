// -----------------------------------------------------------------------------
// Texts sent from the container (feature names, action messages, widget
// contents, scene outputs), in the four languages of the Gladys interface.
// Entries are strings or functions of one parameter object. German says "du",
// Spanish "usted". Brand, line and place names never translate; the traffic
// messages come from the networks in German and are shown as they are.
// -----------------------------------------------------------------------------

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

// Feature names (frozen when the device is created, in the configured language).
export const NAMES = {
  en: {
    next: 'Next departure',
    following: 'Following departure',
    delay: 'Delay',
    line: 'Line and destination',
    disruption: 'Disruption',
  },
  fr: {
    next: 'Prochain départ',
    following: 'Départ suivant',
    delay: 'Retard',
    line: 'Ligne et destination',
    disruption: 'Perturbation',
  },
  de: {
    next: 'Nächste Abfahrt',
    following: 'Übernächste Abfahrt',
    delay: 'Verspätung',
    line: 'Linie und Ziel',
    disruption: 'Störung',
  },
  es: {
    next: 'Próxima salida',
    following: 'Salida siguiente',
    delay: 'Retraso',
    line: 'Línea y destino',
    disruption: 'Incidencia',
  },
};

// Transport modes of a watch (src/efa.js MODES, plus OTHER).
export const MODES = {
  en: {
    TRAIN: 'Train',
    SUBURBAN: 'S-Bahn',
    SUBWAY: 'U-Bahn',
    TRAM: 'Tram',
    BUS: 'Bus',
    FERRY: 'Ferry',
    OTHER: 'Other',
  },
  fr: {
    TRAIN: 'Train',
    SUBURBAN: 'S-Bahn',
    SUBWAY: 'U-Bahn',
    TRAM: 'Tram',
    BUS: 'Bus',
    FERRY: 'Bateau',
    OTHER: 'Autre',
  },
  de: {
    TRAIN: 'Zug',
    SUBURBAN: 'S-Bahn',
    SUBWAY: 'U-Bahn',
    TRAM: 'Straßenbahn',
    BUS: 'Bus',
    FERRY: 'Fähre',
    OTHER: 'Sonstiges',
  },
  es: {
    TRAIN: 'Tren',
    SUBURBAN: 'S-Bahn',
    SUBWAY: 'U-Bahn',
    TRAM: 'Tranvía',
    BUS: 'Autobús',
    FERRY: 'Ferry',
    OTHER: 'Otro',
  },
};

export const TEXT = {
  en: {
    needNetwork: 'Choose a network.',
    searchNeedText: 'Choose a network and type a stop name, e.g. Düsseldorf Hbf.',
    searchNone: ({ query }) => `No stop matches "${query}".`,
    searchFound: ({ count }) => `${count} stop(s) found:`,
    searchHint: 'To watch one, copy its identifier (in brackets) into "Add a stop".',
    addUnknown: ({ query, network }) => `${network} knows no stop "${query}".`,
    addAmbiguous: 'Several stops match: use the identifier of the one you want.',
    addUnknownLines: ({ lines, available }) =>
      `Line(s) not among the next departures: ${lines}. Lines seen: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `No upcoming departure towards "${direction}". Destinations: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Unknown mode "${mode}": TRAIN, SUBURBAN, SUBWAY, TRAM, BUS, FERRY or empty.`,
    added: ({ name }) => `${name} added.\nOpen the Discover tab to create its device.`,
    alreadyWatched: ({ name }) => `${name} is already watched with these filters.`,
    tooMany: ({ max }) => `You already watch ${max} stops, the maximum.`,
    removed: ({ name }) => `${name} is no longer watched. Delete its device in Gladys if you wish.`,
    removeUnknown: ({ query }) => `No watched stop matches "${query}".`,
    removeAmbiguous:
      'Several watched stops match: use the full name shown by "Show what is watched".',
    statusNone: 'No stop watched yet: use "Find a stop" then "Add a stop".',
    statusHeader: ({ count }) => `Watched stops: ${count}`,
    statusCreated: 'device created',
    statusNotCreated: 'device not created yet (Discover tab)',
    statusRefreshed: ({ age }) => `Last read: ${age} s ago.`,
    statusNeverRefreshed: 'Not read yet (only the created devices are read).',
    statusError: ({ error }) => `Last error: ${error}`,
    serviceDown: ({ error }) =>
      `The network server cannot be reached (${error}). Try again in a moment.`,
    now: 'now',
    in: ({ minutes }) => `in ${minutes} min`,
    inTwo: ({ first, second }) => `in ${first} and ${second} min`,
    nowThen: ({ second }) => `now, then in ${second} min`,
    noDeparture: 'No departure announced',
    cancelled: 'Cancelled',
    delayedNote: ({ delay }) => ` (${delay} min late)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} to ${destination} at ${stop}: ${when}`,
    nothingAt: ({ stop }) => `No departure announced from ${stop}.`,
    pickStop: 'Choose a stop in the widget settings.',
    loading: 'Departures are being read…',
    gone: 'This stop is no longer watched.',
    legend: 'Time · minutes · delay. Grey: timetable only.',
    unavailable: 'Departures not available yet, try again in a minute.',
  },
  fr: {
    needNetwork: 'Choisissez un réseau.',
    searchNeedText: "Choisissez un réseau et saisissez un nom d'arrêt, par exemple Düsseldorf Hbf.",
    searchNone: ({ query }) => `Aucun arrêt ne correspond à « ${query} ».`,
    searchFound: ({ count }) => `${count} arrêt(s) trouvé(s) :`,
    searchHint:
      'Pour en suivre un, copiez son identifiant (entre crochets) dans « Ajouter un arrêt ».',
    addUnknown: ({ query, network }) => `${network} ne connaît aucun arrêt « ${query} ».`,
    addAmbiguous:
      "Plusieurs arrêts correspondent : utilisez l'identifiant de celui que vous voulez.",
    addUnknownLines: ({ lines, available }) =>
      `Ligne(s) absente(s) des prochains départs : ${lines}. Lignes vues : ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Aucun prochain départ vers « ${direction} ». Destinations : ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Mode « ${mode} » inconnu : TRAIN, SUBURBAN, SUBWAY, TRAM, BUS, FERRY ou vide.`,
    added: ({ name }) => `${name} ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.`,
    alreadyWatched: ({ name }) => `${name} est déjà suivi avec ces filtres.`,
    tooMany: ({ max }) => `Vous suivez déjà ${max} arrêts, le maximum.`,
    removed: ({ name }) =>
      `${name} n'est plus suivi. Supprimez son appareil dans Gladys si vous le souhaitez.`,
    removeUnknown: ({ query }) => `Aucun arrêt suivi ne correspond à « ${query} ».`,
    removeAmbiguous:
      'Plusieurs arrêts suivis correspondent : utilisez le nom complet affiché par « Voir ce qui est suivi ».',
    statusNone: 'Aucun arrêt suivi : utilisez « Chercher un arrêt » puis « Ajouter un arrêt ».',
    statusHeader: ({ count }) => `Arrêts suivis : ${count}`,
    statusCreated: 'appareil créé',
    statusNotCreated: 'appareil pas encore créé (onglet Découverte)',
    statusRefreshed: ({ age }) => `Dernière lecture : il y a ${age} s.`,
    statusNeverRefreshed: 'Pas encore lu (seuls les appareils créés sont lus).',
    statusError: ({ error }) => `Dernière erreur : ${error}`,
    serviceDown: ({ error }) =>
      `Le serveur du réseau est injoignable (${error}). Réessayez dans un instant.`,
    now: 'maintenant',
    in: ({ minutes }) => `dans ${minutes} min`,
    inTwo: ({ first, second }) => `dans ${first} et ${second} min`,
    nowThen: ({ second }) => `maintenant, puis dans ${second} min`,
    noDeparture: 'Aucun départ annoncé',
    cancelled: 'Supprimé',
    delayedNote: ({ delay }) => ` (${delay} min de retard)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} vers ${destination} à ${stop} : ${when}`,
    nothingAt: ({ stop }) => `Aucun départ annoncé à ${stop}.`,
    pickStop: 'Choisissez un arrêt dans les réglages du widget.',
    loading: 'Lecture des départs en cours…',
    gone: "Cet arrêt n'est plus suivi.",
    legend: 'Heure · minutes · retard. Gris : horaire théorique.',
    unavailable: 'Départs pas encore disponibles, réessayez dans une minute.',
  },
  de: {
    needNetwork: 'Wähle einen Verbund.',
    searchNeedText:
      'Wähle einen Verbund und gib den Namen einer Haltestelle ein, z. B. Düsseldorf Hbf.',
    searchNone: ({ query }) => `Keine Haltestelle passt zu „${query}“.`,
    searchFound: ({ count }) => `${count} Haltestelle(n) gefunden:`,
    searchHint:
      'Um eine zu verfolgen, kopiere ihre Kennung (in Klammern) in „Haltestelle hinzufügen“.',
    addUnknown: ({ query, network }) => `${network} kennt keine Haltestelle „${query}“.`,
    addAmbiguous: 'Mehrere Haltestellen passen: nimm die Kennung der gewünschten.',
    addUnknownLines: ({ lines, available }) =>
      `Linie(n) nicht unter den nächsten Abfahrten: ${lines}. Gesehene Linien: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Keine nächste Abfahrt Richtung „${direction}“. Ziele: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Unbekanntes Verkehrsmittel „${mode}“: TRAIN, SUBURBAN, SUBWAY, TRAM, BUS, FERRY oder leer.`,
    added: ({ name }) => `${name} hinzugefügt.\nÖffne den Tab „Entdecken“, um das Gerät anzulegen.`,
    alreadyWatched: ({ name }) => `${name} wird mit diesen Filtern schon verfolgt.`,
    tooMany: ({ max }) => `Du verfolgst schon ${max} Haltestellen, das Maximum.`,
    removed: ({ name }) =>
      `${name} wird nicht mehr verfolgt. Lösche das Gerät in Gladys, wenn du willst.`,
    removeUnknown: ({ query }) => `Keine verfolgte Haltestelle passt zu „${query}“.`,
    removeAmbiguous:
      'Mehrere verfolgte Haltestellen passen: nimm den vollen Namen aus „Verfolgte anzeigen“.',
    statusNone:
      'Noch keine Haltestelle: nutze „Haltestelle suchen“, dann „Haltestelle hinzufügen“.',
    statusHeader: ({ count }) => `Verfolgte Haltestellen: ${count}`,
    statusCreated: 'Gerät angelegt',
    statusNotCreated: 'Gerät noch nicht angelegt (Tab „Entdecken“)',
    statusRefreshed: ({ age }) => `Zuletzt gelesen: vor ${age} s.`,
    statusNeverRefreshed: 'Noch nicht gelesen (nur angelegte Geräte werden gelesen).',
    statusError: ({ error }) => `Letzter Fehler: ${error}`,
    serviceDown: ({ error }) =>
      `Der Server des Verbunds ist nicht erreichbar (${error}). Versuch es gleich noch einmal.`,
    now: 'jetzt',
    in: ({ minutes }) => `in ${minutes} Min.`,
    inTwo: ({ first, second }) => `in ${first} und ${second} Min.`,
    nowThen: ({ second }) => `jetzt, dann in ${second} Min.`,
    noDeparture: 'Keine Abfahrt angekündigt',
    cancelled: 'Fällt aus',
    delayedNote: ({ delay }) => ` (${delay} Min. Verspätung)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} nach ${destination} ab ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Keine Abfahrt ab ${stop} angekündigt.`,
    pickStop: 'Wähle eine Haltestelle in den Widget-Einstellungen.',
    loading: 'Abfahrten werden gelesen…',
    gone: 'Diese Haltestelle wird nicht mehr verfolgt.',
    legend: 'Uhrzeit · Minuten · Verspätung. Grau: nur Fahrplan.',
    unavailable: 'Abfahrten noch nicht verfügbar, versuch es in einer Minute.',
  },
  es: {
    needNetwork: 'Elija una red.',
    searchNeedText: 'Elija una red y escriba el nombre de una parada, por ejemplo Düsseldorf Hbf.',
    searchNone: ({ query }) => `Ninguna parada coincide con «${query}».`,
    searchFound: ({ count }) => `${count} parada(s) encontrada(s):`,
    searchHint: 'Para seguir una, copie su identificador (entre corchetes) en «Añadir una parada».',
    addUnknown: ({ query, network }) => `${network} no conoce ninguna parada «${query}».`,
    addAmbiguous: 'Varias paradas coinciden: use el identificador de la que desea.',
    addUnknownLines: ({ lines, available }) =>
      `Línea(s) ausente(s) de las próximas salidas: ${lines}. Líneas vistas: ${available}.`,
    addUnknownDirection: ({ direction, available }) =>
      `Ninguna próxima salida hacia «${direction}». Destinos: ${available}.`,
    addUnknownMode: ({ mode }) =>
      `Modo «${mode}» desconocido: TRAIN, SUBURBAN, SUBWAY, TRAM, BUS, FERRY o vacío.`,
    added: ({ name }) => `${name} añadida.\nAbra la pestaña Descubrir para crear su dispositivo.`,
    alreadyWatched: ({ name }) => `${name} ya se sigue con estos filtros.`,
    tooMany: ({ max }) => `Ya sigue ${max} paradas, el máximo.`,
    removed: ({ name }) => `${name} ya no se sigue. Elimine su dispositivo en Gladys si lo desea.`,
    removeUnknown: ({ query }) => `Ninguna parada seguida coincide con «${query}».`,
    removeAmbiguous:
      'Varias paradas seguidas coinciden: use el nombre completo que muestra «Ver lo que se sigue».',
    statusNone: 'Ninguna parada seguida: use «Buscar una parada» y luego «Añadir una parada».',
    statusHeader: ({ count }) => `Paradas seguidas: ${count}`,
    statusCreated: 'dispositivo creado',
    statusNotCreated: 'dispositivo aún no creado (pestaña Descubrir)',
    statusRefreshed: ({ age }) => `Última lectura: hace ${age} s.`,
    statusNeverRefreshed: 'Aún no leído (solo se leen los dispositivos creados).',
    statusError: ({ error }) => `Último error: ${error}`,
    serviceDown: ({ error }) =>
      `No se puede contactar con el servidor de la red (${error}). Vuelva a intentarlo en un momento.`,
    now: 'ahora',
    in: ({ minutes }) => `en ${minutes} min`,
    inTwo: ({ first, second }) => `en ${first} y ${second} min`,
    nowThen: ({ second }) => `ahora, y luego en ${second} min`,
    noDeparture: 'Ninguna salida anunciada',
    cancelled: 'Cancelado',
    delayedNote: ({ delay }) => ` (${delay} min de retraso)`,
    sentence: ({ line, destination, stop, when }) =>
      `${line} hacia ${destination} en ${stop}: ${when}`,
    nothingAt: ({ stop }) => `Ninguna salida anunciada en ${stop}.`,
    pickStop: 'Elija una parada en los ajustes del widget.',
    loading: 'Leyendo las salidas…',
    gone: 'Esta parada ya no se sigue.',
    legend: 'Hora · minutos · retraso. Gris: solo horario teórico.',
    unavailable: 'Salidas aún no disponibles, vuelva a intentarlo en un minuto.',
  },
};

/** A text of `table` in `language` (English when missing), rendered with `params`. */
export function say(table, language, key, params = {}) {
  const entry = table[language]?.[key] ?? table.en[key];
  return typeof entry === 'function' ? entry(params) : entry;
}

/** Every language of a text: a multi-language action message. */
export function sayAll(table, key, params = {}) {
  return Object.fromEntries(
    Object.keys(table).map((lang) => [lang, say(table, lang, key, params)]),
  );
}

/** The name of a transport mode ("SUBWAY" → "U-Bahn"), the raw mode when unknown. */
export function modeName(mode, language) {
  return (MODES[language] ?? MODES.en)[mode] ?? String(mode ?? '');
}
