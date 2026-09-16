# 043 — Cámaras urbanas externas (red viaria que rodea Valencia)

```yaml
id: 043
titulo: "Bloque de cámaras de tráfico externas (red viaria de acceso a Valencia), separado de las cámaras internas de spec 038"
estado: Draft
tipo: panel
depende_de: [038, 040]
propietario: ""
version: 1
```

> **Estado:** `Draft`, sin empezar — **segundo punto** de la tanda de trabajo post-V1 (ver
> `docs/03_PLAN_POST_V1.md`), después de spec `027` v4. Due-diligence ligera hecha esta
> sesión (solo `robots.txt` de la referencia dada por el usuario, no la fuente real de las
> cámaras) — falta la investigación de verdad antes de escribir código.

## 1. Problema / motivación

Spec `038` cubre cámaras **dentro** de Valencia ciudad (Xarxa de Webcams de Turisme CV:
Plaça de l'Ajuntament, playa, Jardín del Turia, El Saler). El usuario quiere además un
bloque **separado**, con cámaras de tráfico de las vías que **rodean** la ciudad (accesos,
rondas, autovías) — para ver de un vistazo el estado de las entradas/salidas antes de que
llegue a las calles internas. Referencia que el usuario dio como ejemplo de lo que quiere
lograr: `https://livetrafik.com/es/camaras/comunidad-valenciana` (agregador de cámaras de
tráfico de la Comunitat Valenciana). **Uso previsto: personal/interno del usuario**, no
necesariamente público por defecto — mismo mecanismo de fuente "personal" gateada por env
var que ya usa spec `038` (`ADR-003`), si la fuente real resulta no tener permiso de reuso
explícito.

## 2. Fuente(s) de datos

**No verificada todavía — due-diligence pendiente, el trabajo real de esta spec antes de
tocar código.**

| Fuente candidata | `robots.txt` | Nota |
|---|---|---|
| `livetrafik.com` (agregador, la referencia del usuario) | **200** — permisivo para bots generales (`Allow: /`), bloquea expresamente bots de SEO/scraping masivo (AhrefsBot, SemrushBot, MJ12bot, DotBot, BLEXBot, DataForSeoBot, PetalBot) | Es un **agregador de terceros**, no la fuente primaria — hay que identificar de dónde saca las imágenes (hipótesis más probable: la red pública de cámaras de tráfico de la **DGT**, `infocar.dgt.es` o equivalente, que existe para varias autovías/rondas de España) antes de decidir si se integra directo con esa fuente primaria o se descarta por no ser la fuente original. |
| DGT — cámaras de tráfico (`infocar.dgt.es/etraffic/` o portal equivalente) | **302** en la comprobación rápida de esta sesión (redirección — no investigado a fondo) | Hipótesis principal de fuente primaria real. La DGT publica cámaras de su red de carreteras; hace falta verificar cobertura real en los accesos a Valencia (V-30, V-21, A-3, A-7, CV-35...), mecanismo técnico (imagen estática que se refresca, stream, iframe) y condiciones de reuso — **mismo criterio ético/legal que spec 038 (`CLAUDE.md` §4)**: si no hay permiso escrito explícito, va como fuente "personal", no pública por defecto. |

## 3. Contrato de datos (normalizado)

Mismo espíritu que spec `038` §3 — config estática, no pipeline seed→caché→endpoint (sin
dato que transformar, solo qué cámaras embeber). A confirmar tras la investigación de
fuente — probablemente una extensión del mismo `CamaraUrbana` de spec 038 con un campo que
distinga el bloque ("interna" vs "externa/accesos") en vez de un tipo nuevo, para no
duplicar el patrón de UI ya construido (tarjeta clic-para-reproducir, fallback de error).

## 4. Pipeline (seed → caché → endpoint)

A definir tras la investigación de fuente (§2) — depende por completo de si el mecanismo
técnico real es imagen JPEG que se refresca, stream DASH/HLS, o iframe de un visor de
terceros; cada uno tiene un patrón distinto ya usado en este repo (spec 038 usa DASH vía
`dashjs`).

## 5. Contrato de capa de mapa

No aplica una capa de mapa nueva — vive como **bloque separado** dentro del panel de
cámaras de la vista `/inteligencia` (spec `040`), distinguible visualmente del bloque de
cámaras internas de spec `038` ("estas son de Valencia ciudad" vs "estas son de los
accesos"), tal como pidió el usuario explícitamente.

## 6. Criterios de aceptación (Definition of Done)

- [ ] Fuente primaria real identificada y verificada con llamada directa (no solo
      `livetrafik.com` como referencia de inspiración) — mismo estándar de due-diligence
      que el resto del repo (`CLAUDE.md` §8.2).
- [ ] Clasificación `ADR-003` (pública/personal) decidida con evidencia, no asumida.
- [ ] El mayor número de puntos posible alrededor de Valencia que la fuente real permita —
      el usuario pidió explícitamente maximizar cobertura, no solo 2-3 cámaras simbólicas.
- [ ] Bloque visualmente separado de las cámaras internas (spec 038) dentro de
      `/inteligencia`, con su propia atribución de fuente.
- [ ] `npm run typecheck` / `npm run test` / `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal**: `livetrafik.com` es un intermediario — si resulta ser la única vía
  práctica de acceso (la fuente primaria no permite hotlinking/embebido directo, como pasó
  con `meteo365.es` en spec 038 v5), esta spec podría quedar bloqueada o reducida a un
  enlace externo en vez de cámaras embebidas de verdad. No asumir que "si lo hace
  livetrafik.com, lo podemos hacer nosotros" sin verificar los términos de la fuente
  primaria.
- **Límite ético/legal, igual que spec 038 (`CLAUDE.md` §4)**: sin permiso escrito
  explícito de reuso, la fuente va como "personal" (gateada por env var), nunca pública
  por defecto en el repo público.
- **Fuera de alcance v1**: cualquier cámara fuera del área metropolitana de Valencia
  (esto es sobre los accesos a la ciudad, no una red genérica de toda España).

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-17 | Creación (Draft), a petición explícita del usuario — segundo punto de la tanda de trabajo post-V1. Due-diligence ligera de `robots.txt` de `livetrafik.com` (permisivo) y primer intento de localizar la fuente primaria probable (DGT) — sin verificar en profundidad. Pendiente de investigación real antes de implementar. |
