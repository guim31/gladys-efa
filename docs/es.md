# EFA departures (VRR, VVS, KVV…)

Las próximas salidas de sus paradas en Alemania y Austria en Gladys: trenes, S-Bahn, U-Bahn y
Stadtbahn, tranvías, autobuses y ferris, con retrasos, cancelaciones e incidencias, en tiempo real.

Los datos proceden del planificador de viajes público de cada red de transporte, basado en el
software **EFA** (Mentz): VRR (Rin-Ruhr), VVS (Stuttgart), KVV (Karlsruhe), MVV (Múnich) y las
demás redes indicadas abajo. **Sin cuenta ni clave.** Esta integración no está afiliada a Mentz ni
a ninguna de estas redes.

## Qué obtiene

- **Un dispositivo por parada seguida** (con filtro opcional por líneas, dirección o modo de
  transporte): próxima salida y salida siguiente (minutos), retraso de la próxima salida
  (minutos), su línea y destino (texto), y si una incidencia afecta a las salidas conservadas
  (sí/no).
- **Un widget de panel** con las próximas salidas de una parada: hora, minutos, retraso,
  cancelaciones en rojo, incidencias arriba.
- **Cuatro disparadores de escena**: hora de salir, salida con retraso, salida cancelada, nueva
  incidencia.
- **Una acción de escena** que lee las próximas salidas de una parada, con una frase lista para
  enviar por mensaje o altavoz.

## Requisitos

- Gladys Assistant 5.3.0 o posterior.
- Acceso a Internet desde el equipo de Gladys.
- Una parada de una de estas redes (cada servidor se comprobó el 22 de noviembre de 2026):

| Red          | Zona                                    | Servidor                 |
| ------------ | --------------------------------------- | ------------------------ |
| VRR          | Rin-Ruhr (Düsseldorf, Essen, Dortmund…) | `efa.vrr.de`             |
| VVS          | Stuttgart                               | `www3.vvs.de`            |
| KVV          | Karlsruhe                               | `projekte.kvv-efa.de`    |
| MVV          | Múnich                                  | `efa.mvv-muenchen.de`    |
| VRN          | Rin-Neckar (Mannheim, Heidelberg…)      | `www.vrn.de`             |
| bwegt        | todo Baden-Wurtemberg                   | `www.efa-bw.de`          |
| DING         | Ulm                                     | `www.ding.eu`            |
| Bayern (BEG) | toda Baviera (Núremberg incluido)       | `bahnland-bayern.de`     |
| VVO          | Dresde                                  | `efa.vvo-online.de`      |
| NWL          | Westfalia-Lippe (Münster, Bielefeld…)   | `westfalenfahrplan.de`   |
| VMV          | Mecklemburgo-Pomerania Occidental       | `fahrplanauskunft-mv.de` |
| Linz AG      | Linz (Austria)                          | `www.linzag.at`          |

Diferencia con las vecinas del store: la integración **Deutsche Bahn**
(`LM1LC3N7/gladys-deutsche-bahn`) sigue los trenes de DB; esta lee el panel de salidas de la red
local, el que se muestra en la parada, con su U-Bahn, tranvías y autobuses y los mensajes de la red.
**Transitous** y **gladys-gtfs** leen flujos GTFS, en todo el mundo, con tiempo real cuando un flujo
lo ofrece; aquí el tiempo real es el de la propia red.

## Instalación

1. En Gladys, abra **Integraciones → Instalar desde GitHub**.
2. Pegue `https://github.com/guim31/gladys-efa` e instale.
3. Abra la pestaña **Configuración** de la integración.

## Configuración

### Ajustes

- **Idioma de los textos**: idioma de los nombres de funciones (fijados al crear el dispositivo) y
  de las frases de escena. Las redes escriben sus mensajes en alemán: se muestran tal cual.
- **Intervalo de actualización**: 1 minuto (por defecto) o 2 minutos. Una petición por dispositivo
  creado.

### Añadir una parada

1. **Buscar una parada**: elija la red y escriba un nombre (`Düsseldorf Hbf`,
   `Stuttgart Hauptbahnhof`…). La respuesta lista las paradas que coinciden con su identificador,
   por ejemplo `Düsseldorf Hbf [de:05111:18235]`.
2. **Añadir una parada**: elija de nuevo la red y escriba el identificador (o el nombre exacto si es
   único). Filtros opcionales:
   - **Líneas**: `U79, 704` conserva solo esas líneas, tal como figuran en el vehículo (`RE5`,
     `S1`, `SEV RE 47`…), separadas por comas. Se comprueban con las próximas salidas.
   - **Dirección**: `Duisburg` conserva solo las salidas cuyo destino contiene ese texto (sin
     importar acentos ni mayúsculas).
   - **Modo**: tren, S-Bahn, U-Bahn / Stadtbahn, tranvía, autobús o ferry, para los grandes nudos.
     El servidor aplica este filtro, así que el panel llega más lejos.
3. Abra la pestaña **Descubrir** y añada el dispositivo a Gladys.

La misma parada con otros filtros da otro dispositivo: añada la U79 hacia Duisburg y la U79 hacia
el centro para seguir ambos sentidos. Se pueden seguir hasta 10 paradas.

### Quitar una parada, ver el estado

- **Quitar una parada**: escriba su nombre tal como lo muestra el estado (`Düsseldorf Hbf (U79)`) o
  su identificador. Su dispositivo permanece en Gladys hasta que lo elimine.
- **Ver lo que se sigue**: las paradas, si su dispositivo existe, la última lectura y el último
  error.

## Dispositivos

| Función          | Tipo            | Contenido                                                     |
| ---------------- | --------------- | ------------------------------------------------------------- |
| Próxima salida   | duración (min)  | minutos hasta la próxima salida que circula (0 = ahora)       |
| Salida siguiente | duración (min)  | minutos hasta la siguiente                                    |
| Retraso          | duración (min)  | retraso de la próxima salida (0 puntual o adelantada)         |
| Línea y destino  | texto           | `U79 → D-Wittlaer`                                            |
| Incidencia       | binario (sí/no) | una incidencia afecta a una salida conservada por los filtros |

Las salidas canceladas se saltan en las cuentas atrás. Sin salida anunciada, las cuentas atrás
muestran 1440 minutos. Solo cuentan las salidas que conservan los filtros.

Una **incidencia** es un mensaje en tiempo real sobre un viaje, un mensaje de prioridad alta o uno
escrito en las últimas 24 horas. Las redes también adjuntan avisos permanentes a cada salida de una
línea (obras, accesibilidad, a veces ofertas de temporada): no cuentan, para que la función no
quede encendida durante meses.

## Widget de panel

**Próximas salidas**: elija una parada. El widget muestra sus ocho próximas salidas (línea,
destino, hora estimada, minutos, retraso): verde en tiempo real, naranja con dos minutos de retraso
o más, rojo si se cancela, gris para una hora teórica. La leyenda muestra las incidencias. El título
es el nombre que dio al dispositivo en Gladys.

## Disparadores de escena

Cada disparador puede limitarse a una parada y a una línea (exactamente como en el vehículo).

- **Hora de salir**: una salida sale en el número de minutos elegido (1 a 20). Una vez por salida,
  cuando su cuenta atrás llega a ese número. Una salida vista por primera vez dentro de la ventana
  no dispara.
- **Salida con retraso**: una salida lleva al menos el retraso elegido (1 a 60 minutos). Una vez por
  salida y umbral.
- **Salida cancelada**: una próxima salida se cancela. Una vez por salida.
- **Nueva incidencia**: una nueva incidencia afecta a una salida de la parada. Una vez por mensaje y
  línea.

Variables enviadas a la escena: parada, línea, modo (`TRAIN`, `SUBURBAN`, `SUBWAY`, `TRAM`, `BUS`,
`FERRY`, `OTHER`), destino, andén, horas prevista y estimada, minutos, retraso; para una incidencia,
su resumen y detalles (en alemán). Lo que ya existe al arrancar la integración no se anuncia; las
cancelaciones y mensajes ya anunciados no se anuncian de nuevo tras un reinicio.

## Acciones de escena

**Leer las próximas salidas**: elija una parada y, si quiere, una línea. Salidas: una frase
(`U79 hacia D-Wittlaer en Düsseldorf Hbf: en 2 y 14 min`), la parada, la línea, el destino, los
minutos de espera, los minutos hasta la siguiente, el retraso, la hora estimada, el andén, tiempo
real (1/0), incidencia (1/0). La frase sigue el idioma de la configuración.

## Ejemplos de escenas

- **Salir hacia el tranvía**: disparador «Hora de salir», parada Düsseldorf Hbf (704), 7 min →
  enviar «Su tranvía sale en {{minutes}} min del andén {{platform}}» y hacer parpadear la luz del
  recibidor.
- **Resumen de la mañana**: a las 7:00 los días laborables, acción «Leer las próximas salidas» →
  enviar su frase al altavoz de la cocina.
- **Avisar de una S-Bahn cancelada**: disparador «Salida cancelada», parada Karlsruhe Marktplatz
  (S4) → enviar un mensaje con el destino y la hora prevista.

## Datos, actualización y cuotas

Los servidores EFA son los back-ends públicos de los planificadores de viaje y paneles de salidas
de las propias redes. No piden clave y ninguno publica condiciones escritas para aplicaciones de
terceros: varias redes (VRR, VVS, KVV, MVV…) publican sus horarios como datos abiertos, y los
paneles en tiempo real se muestran aquí como en sus sitios web. La integración es ligera: una
petición por dispositivo creado y actualización (como mucho una por minuto), las paradas una tras
otra, separadas medio segundo, una petición rechazada (HTTP 429 o 503) se reintenta dos veces; no se
lee nada de una parada sin dispositivo en Gladys. Las salidas son el tiempo real de la red cuando el
vehículo está localizado, si no el horario teórico. Datos © las redes correspondientes.

## Solución de problemas

- **Ningún dispositivo en Descubrir**: añada primero la parada con «Añadir una parada».
- **«No se puede contactar con el servidor de la red»**: el equipo de Gladys no tiene acceso a
  Internet o el servidor de la red está caído. La integración reintenta en cada actualización y
  avisa cuando vuelve.
- **Se rechaza un filtro de línea**: la respuesta lista las líneas de las próximas salidas; escriba
  la línea tal como aparece. Una línea poco frecuente puede no figurar en ese momento: inténtelo más
  tarde o añada la parada con un filtro de modo.
- **Varias paradas tienen el mismo nombre** (`Karlsruhe, Marktplatz (Pyramide U)` y
  `Karlsruhe, Marktplatz (Kaiserstraße U)`): use el identificador que da «Buscar una parada».
- **Un disparador no se activa**: compruebe la línea (exactamente como figura) y que el dispositivo
  existe en Gladys: solo se leen los dispositivos creados.

## Límites

- Desarrollada sin vivir en estas regiones, contra los servidores EFA reales de VRR, VVS y KVV: sus
  comentarios son bienvenidos.
- Los nombres de funciones se fijan al crear el dispositivo.
- Los mensajes están en alemán y nunca se traducen.
- Un servidor devuelve las 40 próximas salidas de una parada (100 con filtro): en un gran nudo son
  unos 15 a 40 minutos. Use un filtro de línea o de modo para una línea poco frecuente.
- El VGN (Núremberg) no figura: su servidor no da tiempo real; use **Bayern (BEG)**, que cubre
  Núremberg en tiempo real.

## Créditos

Datos: las redes de transporte indicadas arriba, mediante sus servidores EFA (Mentz). Inspirada en
las integraciones comunitarias de Home Assistant para salidas EFA y en la integración
`gladys-sl-stockholm`.
