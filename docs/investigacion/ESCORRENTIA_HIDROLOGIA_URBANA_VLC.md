# VLC Monitor — Escorrentía e hidrología urbana: qué sabemos de la lluvia por zona y cómo llegar a un indicador de riesgo real

**Fecha:** 2026-09-17
**Pregunta que responde:** más allá de "cuánto llueve en Valencia" (ya cubierto en `044`), ¿podemos saber **cuánta agua le cae a cada zona concreta de la ciudad** y **qué tan bien la evacúa esa zona**, para llegar a un indicador de riesgo de acumulación de agua por distrito/barrio — no solo un dato meteorológico, sino una lectura cruzada con la red de saneamiento y la topografía real?

Origen: conversación de sesión sobre integrar temperatura por zona de AVAMET en `044` (ver
`specs/044-panel-emergencia-meteorologica.md` v4), que llevó a compartir una investigación
más amplia sobre lluvia, escorrentía y alcantarillado. Se documenta aquí como investigación
de referencia — **no es una spec todavía**. Reservado como spec `046` (`Planned`) en
`specs/INDEX.md`, pendiente de su propia due-diligence antes de implementar nada (ver
`CLAUDE.md` §2).

---

## 0. La pregunta real detrás de esto

Un dato de "está lloviendo X mm/h en tu zona" (ya cubierto por `044`) no dice si esa lluvia
se va a acumular en la calle o no. Dos zonas con la misma lluvia pueden tener un resultado
completamente distinto según:

- **La topografía** — si la zona está en una vaguada o en una zona elevada.
- **La red de saneamiento** — si el alcantarillado de esa zona tiene capacidad de evacuación
  suficiente para ese caudal, o si ya va al límite en circunstancias normales.
- **El sellado del suelo** — asfalto/hormigón vs zona verde permeable (coeficiente de
  escorrentía).

El objetivo de esta investigación es identificar qué fuentes existen, gratuitas y
oficiales, para aproximar esas tres piezas — y qué haría falta modelar nosotros mismos
cuando no hay una fuente que ya lo dé resuelto.

---

## 1. Lluvia por zona: lo que ya tenemos y lo que falta

`044` ya resuelve "cuánto llueve por distrito" con dos fuentes combinadas:

- **Open-Meteo** (modelo, multi-coordenada por distrito) — cobertura completa pero es
  predicción/reanálisis, no medición directa en el punto.
- **SAIH Júcar** (pluviómetros reales, pero pensados para cuenca fluvial, no para el
  interior de la trama urbana) y **AVAMET** (v4, 15 estaciones reales dentro de la propia
  ciudad, con lat/lon, temperatura y precipitación día/mes/año).

Lo que queda por confirmar es si hay **más pluviómetros municipales** además de los ya
integrados — el Ayuntamiento de Valencia, a través del Ciclo Integral del Agua, mantiene
una red propia de estaciones (del orden de 14 adicionales) pensada específicamente para la
gestión del alcantarillado urbano, no para uso meteorológico general. Si esa red tiene un
canal de datos abierto (portal de datos abiertos del Ayuntamiento, o un feed propio),
sería la pieza que más directamente conecta lluvia con capacidad de la red de
saneamiento — a verificar con la misma disciplina que cualquier otra fuente nueva de este
repo (¿hay API o solo visor?, ¿`robots.txt`?, ¿licencia?).

---

## 2. SIRA — Sistema de Información de la Red de Alcantarillado

SIRA es el sistema municipal que modela y gestiona la red de saneamiento de Valencia:
capacidad de los colectores, puntos de vertido, zonas de riesgo de sobrecarga conocidas por
el propio Ayuntamiento. Es, en teoría, la pieza que le falta al cálculo de "cuánta agua cae"
para convertirlo en "cuánta agua se acumula": cruzar el caudal de entrada (lluvia +
escorrentía) contra el caudal de evacuación (capacidad real del tramo de red en esa zona).

**Estado de la integración: sin verificar todavía.** No se ha comprobado si SIRA expone
algún dato públicamente (portal de datos abiertos, capas WMS/WFS, dataset descargable) o si
es una herramienta interna de gestión sin cara pública. Es el primer punto a resolver antes
de escribir la due-diligence de la spec `046` — puede que la respuesta sea "no hay canal
público", en cuyo caso el indicador de riesgo tendría que aproximarse solo con topografía +
lluvia (ver §4), marcando explícitamente esa limitación en la UI (coherente con `CLAUDE.md`
§4: si es una aproximación sin la pieza de red real, se dice así, no se presenta como si
fuera el dato de SIRA).

---

## 3. Coeficiente de escorrentía — cuánta de esa lluvia se convierte en agua superficial

No toda la lluvia que cae se convierte en escorrentía: una parte se infiltra, otra se
evapora, y el resto corre por la superficie. La proporción que corre depende del **grado de
sellado del suelo** (asfalto y edificación vs zona verde/permeable) y está normalizada en
la literatura técnica española de drenaje urbano (documentos de referencia tipo la
Instrucción de Drenaje Urbano) con coeficientes por tipo de superficie — típicamente
próximos a 0,9 en zonas muy urbanizadas/impermeables y bastante más bajos en zonas
verdes o suelo permeable.

Valencia tiene datos abiertos de **usos del suelo y planeamiento urbanístico** (catastro,
capas de zonas verdes del Ayuntamiento) que permitirían aproximar, por zona/distrito, qué
proporción de superficie es impermeable — y de ahí derivar un coeficiente de escorrentía
agregado por zona sin necesitar campaña de campo propia. Es una aproximación razonable,
consistente con el principio de "agregado, no reconstruido a mano" de `CLAUDE.md` §4,
siempre que quede marcado como estimación derivada, no medición directa.

---

## 4. Topografía — por dónde va el agua cuando ya no cabe en la red

Cuando la red de saneamiento se satura (o no tenemos ese dato porque SIRA no es público),
la topografía por sí sola ya dice mucho: el agua busca las cotas más bajas. El plan técnico
que se plantea para esta pieza, si se llega a implementar como spec propia, sería:

1. Descargar el **Modelo Digital del Terreno (MDT) de 50 cm de resolución del PNOA** (Plan
   Nacional de Ortofotografía Aérea, IGN — gratuito, LiDAR de alta resolución) para el
   término municipal de Valencia.
2. Recortar al término municipal y generar un **mapa hipsométrico** (altitud coloreada).
3. Detectar **depresiones del terreno y rutas de escorrentía** con las herramientas
   estándar de hidrología GIS (relleno de sumideros, dirección de flujo, acumulación de
   flujo) — el método conocido como **HAND** (*Height Above Nearest Drainage*, altura sobre
   el drenaje más cercano) es el estándar de referencia para esto: en vez de la altitud
   absoluta, mide cuánto más alto está cada punto respecto al cauce/drenaje más próximo, lo
   que correlaciona mucho mejor con el riesgo real de inundación que la cota absoluta sola.
4. Superponer sobre ese mapa los pluviómetros disponibles (SAIH, AVAMET, y los
   municipales si se confirman en §1), y las capas de riesgo ya publicadas oficialmente:
   **PATRICOVA** (Plan de Acción Territorial de carácter sectorial sobre Prevención del
   Riesgo de Inundación en la Comunitat Valenciana) y **SNCZI** (Sistema Nacional de
   Cartografía de Zonas Inundables, a nivel estatal) — ambos son mapas de riesgo de
   inundación ya calculados y publicados por la administración, gratuitos y reutilizables,
   que sirven como validación independiente de cualquier modelo propio que se construya.

Este es, con diferencia, el bloque de trabajo más grande de los cuatro — cruza un dataset
LiDAR de varios GB, procesamiento GIS no trivial (relleno de sumideros, direcciones de
flujo) y georreferenciación fina, muy por encima del patrón habitual de spec de este repo
(fetch + normalizar + cachear). Si se aborda, probablemente necesite su propio script de
seed offline (no un endpoint en vivo) que precalcule una rejilla de riesgo relativo (p.ej.
25×25 m) una única vez, y sirva el resultado ya resuelto — coherente con el patrón
seed → caché → endpoint de `CLAUDE.md` §3.3, solo que el "seed" aquí es un pipeline GIS
offline en vez de un scraping periódico.

---

## 5. Hacia un índice de riesgo combinado (ISH)

La idea final que plantea esta investigación es un **Índice de Saturación Hidráulica**
(ISH) por zona, expresado conceptualmente como:

```
ISH = Q_entrada / Q_evacuación
```

Donde `Q_entrada` combina lluvia medida/estimada por zona (§1) ajustada por el coeficiente
de escorrentía de esa zona (§3), y `Q_evacuación` es la capacidad real de la red de
saneamiento en ese tramo (§2, si SIRA resulta accesible) — o, a falta de ese dato, una
aproximación basada solo en topografía (§4: cuanto más baja sea la posición HAND de una
zona respecto a su entorno, menor su capacidad efectiva de evacuar por gravedad).

Un ISH > 1 indicaría que entra más agua de la que la zona puede evacuar en ese momento —
exactamente el tipo de alerta "avisa, no actúa" que ya sigue el resto del proyecto
(`CLAUDE.md` §4): un indicador visible para que alguien lo revise, nunca una decisión
automática.

---

## 6. Qué haría falta antes de escribir la spec `046`

Siguiendo el mismo patrón de due-diligence que ya se ha aplicado a cada spec `Implemented`
de este repo (`CLAUDE.md` §8.2), antes de congelar un contrato de datos para `046` hay que
verificar, con llamadas/descargas reales, no solo por lectura de documentación:

1. **SIRA**: ¿existe algún canal público (API, WMS/WFS, dataset descargable) o es una
   herramienta interna sin cara pública? Esto condiciona si el ISH puede tener la pieza de
   red real o solo la aproximación topográfica.
2. **Pluviómetros municipales adicionales** (Ciclo Integral del Agua): ¿hay portal de datos
   abiertos o feed propio, más allá de SAIH/AVAMET ya integrados en `044`?
3. **Usos del suelo / zonas verdes**: ¿qué capa de datos abiertos del Ayuntamiento o
   catastro sirve para derivar el coeficiente de escorrentía por zona sin campaña de campo?
4. **MDT PNOA 0,5 m**: confirmar el punto de descarga real (Centro de Descargas del CNIG/
   IGN), el tamaño del fichero para el término municipal de Valencia, y si hace falta algo
   más que `fetch()` (herramientas GIS del lado del seed, no del endpoint en vivo).
5. **PATRICOVA/SNCZI**: confirmar si publican capas WMS reutilizables directamente o solo
   visores, para usarlas como validación del modelo propio.

Hasta que estos cinco puntos estén verificados, `046` se queda en `Planned` — es
deliberadamente el paso siguiente después de dejar la investigación documental, no un
trabajo que se empieza a mitad de otra spec (`CLAUDE.md` §8.5).
