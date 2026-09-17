# 044 — Panel de emergencia meteorológica avanzada

```yaml
id: 044
titulo: "Pestaña de días de emergencia/alerta: lluvia y viento por zona, pluviómetros vs. capacidad de absorción, altimetría de la ciudad"
estado: Implemented
tipo: indice-compuesto
depende_de: [001, 040]
propietario: ""
version: 4
```

> **Estado:** `Implemented` (v4, 2026-09-17) — al final **no hizo falta dividir en specs
> separadas**: las sub-señales viables (altimetría, lluvia/viento por zona, pluviómetros,
> y ahora estaciones AVAMET) tienen contrato y pipeline propios. "Capacidad de absorción"
> se descarta explícitamente — sin fuente oficial, ver §7. Detalle completo en §2/§6.
> **v3**: dos cajas de UI (altimetría / lluvia+viento+pluviómetros) — ver §5. **v4**: el
> usuario compartió capturas de AVAMET pidiendo explícitamente integrar
> **temperatura por zona** — se resolvió el bloqueante que quedaba abierto desde v2 ("sin
> lat/lon por estación"): la página `mxo-mxo.php?territori=c15` embebe un array JSON con
> lat/lon + temperatura + humedad + viento + lluvia de 15 estaciones reales dentro de
> Valencia ciudad. Nuevo bloque "Temperatura y lluvia por zona (AVAMET)" en el mismo panel
> de lluvia/viento. Ver §2/§9.

## 1. Problema / motivación

Spec `001` da el tiempo "ahora mismo" a nivel ciudad (un único punto). El usuario quiere
una **pestaña/vista específica para días de emergencia declarada** (lluvia intensa,
alertas activas) con más detalle del que hace falta un día normal:

1. **Cantidad de lluvia por zona de la ciudad** (no un único dato de ciudad).
2. **Rachas de viento por zona.**
3. **Pluviómetros — litros/hora acumulados, en relación a la capacidad de absorción** de
   cada zona (para saber dónde el agua puede empezar a acumularse antes de que se vea).
4. **Plano de altimetría de Valencia** — qué zonas son más altas y cuáles más bajas, para
   anticipar dónde se acumula el agua por gravedad.

## 2. Fuente(s) de datos

**Verificada en vivo el 2026-09-17**, llamada real por sub-señal:

| Sub-señal | Fuente real | Verificación |
|---|---|---|
| Altimetría por distrito | **IGN** (Instituto Geográfico Nacional) — WMS INSPIRE del Modelo Digital del Terreno, `servicios.idee.es/wms-inspire/mdt`, capa `EL.ElevationGridCoverage` | `GetFeatureInfo` verificado con puntos reales de Valencia: centro (12,6 m), zona oeste (29,7 m), coste/Albufera (1,7 m) y un punto sobre el puerto que devolvió el sentinel `-32767` (NODATA, agua/sin cobertura) — coherente con la topografía real conocida de la ciudad (prácticamente plana, 0-50 m). Dato geográfico oficial de libre reutilización, sin autenticación. |
| Lluvia/viento por distrito | **Open-Meteo** (misma fuente que spec 001/016, sin API key) — soporta varias coordenadas en una sola llamada (`latitude`/`longitude` con listas separadas por comas) | Confirmado con llamada real: la respuesta es un array en el mismo orden que las coordenadas pedidas. Es un **modelo** interpolado, no una estación real — se etiqueta así en la UI, distinto del dato medido de la fila siguiente. |
| Pluviómetros reales | **SAIH Júcar** (Confederación Hidrográfica del Júcar, organismo público) — `saih.chj.es/mapa-lluvias` | El array `estaciones` viene embebido en el HTML de esa página (sin autenticación, sin API JSON separada) con litros/m² acumulados en 1h/4h/12h/24h por estación — **dato medido real**, no modelo. Coordenadas en UTM ETRS89 huso 30N (EPSG:25830), convertidas a lat/lon con una fórmula de Mercator transversa inversa verificada contra dos estaciones reales ("VALENCIA" → 39.4763,-0.3579, dentro de la ciudad; "TANCAT DE LA PIPA" → 39.3604,-0.3469, Albufera al sur — ambas coherentes geográficamente). Solo 2 estaciones caen literalmente dentro del término municipal; se amplía a un radio de 20 km (mismo criterio que spec 043) para dar señal útil de lluvia aguas arriba, 8 estaciones en total. |
| Temperatura/humedad/viento/lluvia por estación real | **AVAMET** (`avamet.org/mxo-mxo.php?territori=c15`) — ya es fuente del proyecto (spec 039) | **Bloqueante de v2 resuelto en v4**: la página embebe un array JSON (`var data = [...]`) directamente en el HTML con `lati`/`logi` (lat/lon reales) además de temperatura actual/mín/máx, humedad, viento (velocidad/dirección/racha) y precipitación (día/mes/año) — **15 estaciones reales dentro de Valencia ciudad** (Carpesa, el Saler, Albors, Altocúmulo, Benimaclet, Camins al Grau, 2 colegios, En Corts, l'Albufera ×2, l'Olivereta, Micalet, Patraix, Penya-roja). No hace falta la página separada de precipitación (`mxo-mxo-prec.php`) — este mismo array ya la trae. `robots.txt` permisivo (solo excluye `/_mxarxa/`, `/_gestor/`). |
| Capacidad de absorción del terreno | — | **Descartada explícitamente.** Ninguna fuente pública conocida publica esto para Valencia (mismo criterio que EMT en spec 007 o Waze en spec 015) — no se inventa una heurística sin base. |

## 3. Contrato de datos (normalizado)

Tres contratos, uno por sub-señal — todas viven en el mismo panel por cohesión, pero cada
una tiene su propio pipeline (§4):

```typescript
// src/services/altimetria.ts
interface ResumenAltimetriaDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  elevacionMinM: number;
  elevacionMaxM: number;
  elevacionMediaM: number;
  muestras: number;
}

// src/services/meteo-zona.ts
interface LluviaVientoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  precipitacionMm: number;
  vientoKmh: number;
  rachaKmh: number;
  fecha: string;
}

// src/services/pluviometros-saih.ts
interface PluviometroSaih {
  id: string;
  nombre: string;
  poblacion: string;
  lat: number;
  lon: number;
  litrosM2_1h: number;
  litrosM2_4h: number;
  litrosM2_12h: number;
  litrosM2_24h: number;
  fecha: string;
}

// src/services/avamet-estaciones.ts
interface EstacionAvamet {
  id: string;
  nombre: string;
  altitudM: number;
  lat: number;
  lon: number;
  temperaturaC: number;
  temperaturaMinC: number;
  temperaturaMaxC: number;
  humedadPct: number;
  vientoKmh: number;
  vientoDireccion: string;
  vientoMaxKmh: number;
  precipitacionDiaMm: number;
  precipitacionMesMm: number;
  precipitacionAnyMm: number;
  observadoEn: string;
}
```

## 4. Pipeline (seed → caché → endpoint)

| Sub-señal | Patrón | Detalle |
|---|---|---|
| Altimetría | **Seed único versionado** (como el grafo viario de spec 020) | `npm run seed:altimetria` → `scripts/seed-altimetria.ts`: rejilla de ~600 m sobre el bbox de la ciudad (mismo bbox que spec 020), filtrada a puntos dentro de un distrito real (`getDistrictAtCoordinates`), consulta el IGN por lotes de 6 con pausa, agrega min/max/media por distrito → `data/altimetria-valencia.json` (19 distritos, 198 muestras válidas de 202 consultadas). `GET /api/emergencia/v1/altimetria` solo lee ese snapshot, sin caché con TTL (dato estático). |
| Lluvia/viento por distrito | Caché con TTL 15 min (igual que spec 001) | `GET /api/emergencia/v1/meteo-zona` — pide los centroides de los 19 distritos a Open-Meteo en una sola llamada. |
| Pluviómetros | Caché con TTL 15 min | `GET /api/emergencia/v1/pluviometros` — hace `fetch` a `saih.chj.es/mapa-lluvias`, extrae el array embebido con una expresión regular sobre el HTML (no hay JSON API separada), normaliza y filtra por radio. |
| Estaciones AVAMET | Caché con TTL 15 min | `GET /api/emergencia/v1/avamet` — hace `fetch` a `avamet.org/mxo-mxo.php?territori=c15`, extrae el array `data` embebido con una expresión regular, decodifica entidades HTML de los nombres y normaliza comas decimales. |

## 5. Contrato de capa de mapa

No es una capa de mapa (`tipo: indice-compuesto` en el yaml) — dos cajas propias dentro
de la vista `/inteligencia` (spec `040`), siempre visibles (como protocolos/apoyo a
decisión): **"Altimetría por distrito"** (`#altimetria-panel`, dato estático) y
**"Lluvia y viento por distrito"** (`#meteo-zona-panel`, modelo + pluviómetros SAIH +
estaciones AVAMET, todos medidos salvo el primer bloque) — separadas a petición explícita
del usuario v3 (2026-09-17), colocadas una al lado de la otra (`order: 5`/`order: 6` en
`/inteligencia`). El bloque AVAMET (v4) vive dentro de `#meteo-zona-panel` como tercer
sub-bloque, no como panel nuevo — mismo tema (lluvia/viento/temperatura por zona), mismo
sitio. Se descarta mostrarlo solo condicionado a una alerta activa por simplicidad de v1 —
documentado como simplificación consciente, fast-follow si se quiere ese comportamiento.

## 6. Criterios de aceptación (Definition of Done)

- [x] Cada sub-señal con su fuente real verificada por llamada directa (`CLAUDE.md`
      §8.2): IGN (`GetFeatureInfo` real, puntos coherentes con la topografía conocida),
      Open-Meteo multi-coordenada (respuesta real en array), SAIH Júcar (HTML real con el
      array `estaciones` embebido), AVAMET (HTML real con el array `data` embebido, 15
      estaciones con lat/lon real dentro de Valencia ciudad).
- [x] Bloqueante de v2 resuelto: geocodificación de estaciones AVAMET (antes descartada
      por falta de lat/lon) — el array embebido de `mxo-mxo.php` ya lo trae, no hacía
      falta ningún endpoint/KML de estaciones aparte como se sospechaba en v2.
- [x] "Capacidad de absorción" descartada explícitamente por falta de fuente oficial — no
      se implementó ninguna heurística inventada.
- [x] Altimetría verificada contra datos reales del IGN (no interpolada a ojo): 19
      distritos, de "Poblats de l'Oest" (40,9 m, más alto) a "Poblats Marítims" (2,5 m,
      más bajo) — orden geográficamente coherente (oeste alto → costa baja).
- [x] `src/services/{altimetria,meteo-zona,pluviometros-saih,utm,avamet-estaciones}.ts`
      (funciones puras) + 17 tests con datos/coordenadas reales.
- [x] 4 endpoints (`GET /api/emergencia/v1/{altimetria,meteo-zona,pluviometros,avamet}`)
      registrados en el router, verificados con llamada real desde el navegador.
- [x] Panel (`src/ui/emergencia-meteo-panel.ts`) con altimetría + lluvia/viento por
      distrito + pluviómetros SAIH + estaciones AVAMET, montado en `/inteligencia`.
      Verificado en navegador: 19 filas de altimetría (barras con degradado), 19 de
      lluvia/viento por distrito, 8 pluviómetros reales con litros/m² acumulados (ej.
      "AZUD REPARTIMENT, Quart de Poblet — 24h: 58,0 l/m²") y **15 estaciones AVAMET
      reales** con temperatura/viento/lluvia (ej. "Albors 23,6°C", "Benimaclet 23,4°C").
- [x] `npm run typecheck` / `npm run test` (406/406) / `npm run build` verdes.

## 7. Riesgos y fuera de alcance

- **Decisión — no se dividió en specs separadas**: aunque se anticipaba (v1 de esta
  spec), las 3 sub-señales viables comparten panel y ciclo de vida (todas nacen y se
  verifican juntas en la misma sesión) — dividir habría sido papeleo sin beneficio real.
  Cada una sí tiene su propio contrato/pipeline/endpoint, que es lo que pedía el espíritu
  de `CLAUDE.md` §2.
- **Cobertura de pluviómetros dentro de la ciudad, mejorada en v4**: solo 2 estaciones SAIH
  caen literalmente en el término municipal (el radio de 20 km trae 8 en total, mayoría en
  municipios vecinos) — con las 15 estaciones AVAMET añadidas en v4, ahora sí hay una
  rejilla densa de verdad dentro de Valencia ciudad, con temperatura además de lluvia.
- **Riesgo — el feed de `saih.chj.es` es informal** (HTML con un array embebido, no una
  API JSON documentada) — si el sitio cambia de estructura, el regex de extracción deja
  de encontrar el array y el endpoint devuelve 502 (visible como "no disponible", nunca
  como dato inventado).
- **Fuera de alcance v1-v4**: cualquier modelo predictivo de inundación (esto es
  visualización de datos ya medidos, no una simulación hidrológica nueva); mostrar el
  panel solo en días de alerta (queda siempre visible, ver §5).

## 9. Investigación de continuación — escorrentía urbana e hidrología (2026-09-17)

El usuario compartió, en la misma sesión que integró AVAMET, una investigación extensa
sobre cómo ir más allá de "cuánto llueve" hacia "qué zona corre más riesgo de
acumular agua" — pluviómetros municipales (14 más, del Ciclo Integral del Agua del
Ayuntamiento, no solo los de AVAMET/SAIH), coeficientes de escorrentía normativos, SIRA
(alcantarillado municipal), LiDAR de 0,5 m, PATRICOVA/SNCZI y el concepto HAND. Es
sustancialmente más grande que esta spec (cruza topografía + hidráulica de red +
normativa de saneamiento, no solo "leer una fuente meteorológica más") — se documenta
íntegra en `docs/investigacion/ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md` y se reserva como
spec `046` (`Planned`, `specs/INDEX.md`) en vez de mezclarla aquí. No se ha escrito
código para esto — es investigación guardada para cuando se aborde esa spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft), a petición explícita del usuario — tercer punto de la tanda de trabajo post-V1. Due-diligence ligera: SAIH Júcar (`saih.chj.es`) alcanzable, candidato fuerte para pluviometría; IGN como candidato para altimetría, sin confirmar endpoint; "lluvia/viento por zona" probablemente extensible desde Open-Meteo (ya en uso, spec 001) pidiendo varias coordenadas. "Capacidad de absorción" sin fuente identificada. Pendiente de investigación real antes de implementar — probable división en varias specs (§7). |
| 2 | 2026-09-17 | Añadido AVAMET (`avamet.org`) como candidato fuerte para "lluvia por zona", a raíz de un enlace compartido por el usuario. Verificado con petición real (200, `robots.txt` permisivo) — tabla de precipitación en vivo por estación, con estaciones reales dentro de término de València. Pendiente: lat/lon por estación, necesario para colocar cada dato en su zona sobre el mapa (§2). |
| 2 | 2026-09-17 | **Implemented.** Investigación real de las 3 sub-señales viables (altimetría, lluvia/viento, pluviómetros); "capacidad de absorción" descartada por falta de fuente. IGN (WMS `GetFeatureInfo`, verificado con puntos reales) para altimetría — seedeada una vez (`scripts/seed-altimetria.ts`, 19 distritos, `data/altimetria-valencia.json`). Open-Meteo multi-coordenada (misma fuente que spec 001/016) para lluvia/viento por distrito. SAIH Júcar (HTML con array `estaciones` embebido, sin API JSON separada) para pluviómetros reales — coordenadas UTM ETRS89 huso 30N convertidas a lat/lon con una fórmula propia (`src/services/utm.ts`), verificada contra 2 estaciones reales. AVAMET descartado para esta versión (geocodificación por estación sin resolver). 3 endpoints nuevos (`GET /api/emergencia/v1/{altimetria,meteo-zona,pluviometros}`), panel nuevo (`src/ui/emergencia-meteo-panel.ts`) en `/inteligencia`. 12 tests nuevos (394/394 en total), verificado en navegador con datos reales de las 3 fuentes. |
| 3 | 2026-09-17 | Reestructuración de UI pedida por el usuario: el panel único se divide en dos cajas — `montarAltimetriaPanel()` (`#altimetria-panel`) y `montarMeteoZonaPanel()` (`#meteo-zona-panel`, lluvia/viento + pluviómetros juntos) — para poder colocarlas una al lado de la otra en `/inteligencia`. Sin cambio en contratos, endpoints ni contenido — solo en `src/ui/emergencia-meteo-panel.ts` (mismo fichero, dos funciones `montar*` en vez de una) y en `main.ts`/`index.html` (registro, CSS, `order`). Verificado en navegador (escritorio y móvil). |
| 4 | 2026-09-17 | **Bloqueante de v2 resuelto: AVAMET sí se integra.** El usuario compartió capturas de `mxo-mxo.php`/`mxo-mxo-prec.php` pidiendo explícitamente integrar temperatura por zona. Investigación real: la página `mxo-mxo.php?territori=c15` embebe un array JSON completo (`var data = [...]`) con lat/lon reales por estación — el bloqueante de v2 ("nunca se localizó el lat/lon") se resuelve sin necesitar `mxo-mxo-prec.php` aparte, ese mismo array ya trae precipitación día/mes/año. `src/services/avamet-estaciones.ts` (normalización + decodificador de entidades HTML, 5 tests), `src/server/avamet-estaciones.ts` (`GET /api/emergencia/v1/avamet`, caché TTL 15 min), nuevo bloque "Temperatura y lluvia por zona (AVAMET)" en `#meteo-zona-panel` (tercer sub-bloque). Verificado en navegador con datos reales: 15 estaciones (Carpesa, el Saler, Albors, Benimaclet, Micalet, Patraix...) con temperatura/viento/lluvia reales. Investigación adicional del usuario sobre SIRA (alcantarillado municipal) y escorrentía urbana guardada como documento de referencia para una spec futura — ver `docs/investigacion/ESCORRENTIA_HIDROLOGIA_URBANA_VLC.md` y spec `046` (reservada, `Planned`). 406/406 tests, `typecheck`/`build` verdes. |
