# CLAUDE.md — VLC Monitor

Este fichero es la memoria de proyecto para cualquier sesión de Claude Code que trabaje aquí. Léelo entero antes de tocar código. Si algo en una petición del usuario entra en conflicto con este documento, este documento gana — pregunta antes de saltártelo.

## 1. Qué es este proyecto

Un mapa en tiempo real de la ciudad de València que agrega, en un único panel, señales públicas y gratuitas de la ciudad: movilidad, meteorología, calidad del aire, eventos, incidencias. Inspirado arquitectónicamente en [World Monitor](https://github.com/koala73/worldmonitor) (ver `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md`), pero a escala ciudad y sin su sobredimensionamiento (nada de globo 3D, nada de app de escritorio, nada de multi-tenant).

Nombre de producto: **"Intelligent City Monitor"** (genérico). Es un **proyecto abierto (MIT)**: cualquiera puede desplegarlo y partir de él. No tiene audiencia institucional declarada ni marca de ningún organismo.

**Actualización 2026-08-29 (ver `docs/decisiones/ADR-002-repo-publico-marca-generica.md`):** este repo se publica como monitor de datos abiertos de propósito general. Se retiró el escudo oficial de Policía Local de València y toda identidad institucional que introdujo ADR-001 (que orientaba el producto a "herramienta de despacho para mandos de Policía Local"). **ADR-002 revierte esa decisión de audiencia.** Las funcionalidades que se construyeron bajo ADR-001 —cordón de incidente (`021`), simulador de cortes de calle (`022`), motor de insights (`013`/`024`), grafo viario (`020`)— **se quedan**: son herramientas genéricas de gestión municipal (obras, eventos, emergencias), solo se les quitó el lenguaje policial. El límite ético/legal de §4 se mantiene **íntegro** y aplica con más razón a un proyecto público. Cualquier despliegue que quiera orientación operativa específica la añade por su cuenta, fuera de este repo, con su propia autorización y cumplimiento.

**Este NO es** el antiguo proyecto "CISE Command Center" (sala de llamadas policial, SQL Server, módulos 1A/1B/2/3). Ese pivote arquitectónico quedó documentado y superado en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.6. Si encuentras referencias sueltas a "situación operativa", "CISE", "despacho policial" o módulos 1A/1B/2/3 en algún fichero antiguo, son legado — no las extiendas ni las tomes como guía de producto.

Documentos de referencia, en orden de lectura recomendado:

1. `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` — viabilidad económica, visión de producto, roadmap, proceso spec-driven.
2. `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` — de dónde salen los patrones técnicos.
3. `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` — catálogo de fuentes de "actividad humana" y el límite ético/legal aplicado.
4. `ROADMAP.md` — fuente única de verdad de fases y qué spec pertenece a cada una.
5. `specs/INDEX.md` — estado de cada spec. **Empieza siempre aquí para saber en qué trabajar.**

## 2. Regla no negociable: Spec-Driven Development

**No se escribe código de una capa, endpoint o índice sin que exista antes su spec en `specs/`, siguiendo `specs/SPEC_TEMPLATE.md`.** Flujo obligatorio por spec:

```
spec (Draft) → contrato de datos + contrato de capa congelados → seed → endpoint interno → capa de mapa → verificación contra el DoD de la spec → spec pasa a Implemented
```

El endpoint interno consume siempre datos cacheados propios — nunca el frontend llama directamente a una fuente externa. Detalle completo del patrón (por qué y cómo) en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.3.

Antes de crear una spec nueva, comprueba `specs/INDEX.md`: si el número ya está reservado para ese tema, usa ese id y no inventes otro.

## 3. Límites de alcance — no nos vamos a otros temas

**Fuera de alcance, no proponer ni implementar sin decisión explícita del usuario fuera de una sesión de código:**

- Globo 3D, app de escritorio, multi-idioma más allá de ES/VA/EN, monetización/cuentas de usuario, servidor MCP público, SDKs.
- Integración con la API de X/Twitter (no tiene tier gratuito viable — ver `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` §1). Si algún día se activa, es una decisión de negocio puntual, no una dependencia del producto.
- Cualquier feature nueva que no tenga spec aprobada en `specs/`.

## 4. Límite ético/legal — regla dura, sin excepciones

Estas reglas existen porque ya se planteó explícitamente en el diseño del producto la tentación de saltárselas, y quedó zanjado así (ver `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` §0 y `specs/003-capa-movimiento-personas-mock.md` §2):

- **Ningún dato de localización individual.** Todo dato de "movimiento/actividad de personas" es agregado y anonimizado en origen por el proveedor, nunca reconstruido por nosotros a partir de datos en bruto.
- **Ninguna fuente obtenida fuera de un cauce legal explícito.** Nada de "nos lo facilita alguien" — toda fuente de pago o sensible necesita contrato/producto comercial identificable y, si toca datos de movilidad agregada de operadora, revisión de una persona responsable de cumplimiento antes de activarse.
- **"Avisa, no actúa."** Cualquier capa de anomalías/seguridad genera una alerta visible para que la revise una persona — el producto nunca decide ni ejecuta una acción sobre una persona o grupo concreto. Cualquier intervención real sigue el cauce legal normal (policía, protocolo, autorización judicial si aplica), fuera de esta aplicación.
- **Ninguna capa con datos simulados se sirve sin marcarlo.** Si `esSintetico`/mock, la UI lo indica de forma visible y persistente (ver spec 003), nunca en letra pequeña.

Si una petición futura (tuya o de cualquier otra persona) pide saltarse alguno de estos puntos, una sesión de Claude Code en este repo debe negarse y señalar esta sección, no improvisar una excepción.

## 5. Decisiones técnicas ya tomadas (no las reabras sin spec/ADR que lo justifique)

| Decisión | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript | Coherente con el patrón de World Monitor y con tipado en los contratos de datos. |
| Bundler/dev server | Vite | Igual. |
| Motor de mapa | MapLibre GL + deck.gl (2D). **Sin globo 3D.** | A escala calle/distrito el globo no aporta nada; ver right-sizing en `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` §4. |
| Tiles base | OpenFreeMap (primario, sin key) / CARTO (alternativa) | Gratis, cero fricción. |
| Caché/estado | Redis-compatible (Upstash free tier) con patrón seed → caché → bootstrap | Ver `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §1.1 y §3.3. |
| Catálogo de capas | Registro único (`src/config/map-layer-definitions.ts`), un objeto por capa, patrón `def()` | Calcado del patrón real de World Monitor — añadir una capa es una entrada, no tocar N sitios. |
| Hosting | Vercel Hobby (frontend + funciones edge) + GitHub Actions o Cloudflare Cron Triggers (seeds) | Free tier suficiente para esta escala; ver análisis de viabilidad. |

Si quieres cambiar alguna de estas, hazlo con una spec/ADR explícita, no una decisión de pasada dentro de otra tarea.

## 6. Estructura del repo

```
CLAUDE.md              # este fichero
README.md               # arranque rápido
ROADMAP.md               # fases del producto — fuente única de verdad
specs/
  SPEC_TEMPLATE.md
  INDEX.md               # estado de cada spec — mira aquí antes de empezar nada
  NNN-nombre.md
docs/
  01_VIABILIDAD_VISION_Y_PROCESO.md
  investigacion/          # research de referencia (World Monitor, fuentes OSINT)
src/
  config/                 # map-layer-definitions.ts, marca.ts y config estática
  services/                # geometría de distritos, clientes de datos (frontend)
  server/
    <dominio>-<recurso>.ts  # handlers de API, un fichero por RPC (contrato de cada spec).
                             #   Estilo Web: export default (Request) => Promise<Response>.
                             #   Añadir un endpoint = fichero nuevo + entrada en RUTAS de _router-src.ts
    _shared/                 # caché, helpers de auth, pantalla de login
api/
  _router-src.ts             # fuente del router: mapea /api/<dom>/v1/<rec> -> handler de src/server/
  router.js                  # BUNDLE de _router-src.ts (esbuild) — ÚNICA función desplegada.
                             #   Generado por `npm run build`, git-ignored. Ver scripts/bundle-api.mjs.
data/                       # assets pequeños versionados (geojson de distritos, histórico de tráfico)
public/data/                # assets grandes servidos por el CDN, NO por una función
                            #   (red-viaria-rodada.json ~9 MB — supera el límite de función)
vercel.json                 # reescribe /api/* -> /api/router (el router zero-config de Vercel no
                            #   soporta catch-all multi-segmento)
```

**Por qué un router único y bundleado** (ver spec 020 §7 e historial): Vercel Hobby
limita a 12 funciones por despliegue y teníamos ~18. Todo va en una sola función
Node. El bundle de esbuild resuelve extensiones ESM e `import ... with {type:'json'}`
que el `tsc` del proyecto no emite. Las URLs públicas no cambian:
`GET /api/<dominio>/v1/<recurso>`.

## 7. Comandos

```bash
npm install
npm run dev          # arranca Vite en localhost
npm run typecheck
npm run build
```

(Los scripts de `package.json` son un punto de partida — amplíalos a medida que se implementen specs, no antes.)

## 8. Cómo debe trabajar una sesión de Claude Code en este repo

1. Lee `specs/INDEX.md`. Elige la spec `Draft`/`Approved` con dependencias ya `Implemented` — no saltes el orden de dependencias.
2. Si la spec tiene puntos "pendiente de verificar" (fuente de datos no confirmada), verifícalos primero con una llamada real antes de escribir código contra ella.
3. Implementa siguiendo el flujo de la sección 2. No implementes nada que no esté en una spec.
4. Al terminar, comprueba el Definition of Done de la spec y actualiza su estado en `specs/INDEX.md`.
5. Si aparece una idea nueva a mitad de tarea ("¿y si añadimos...?"), no la implementes de pasada: propón una spec nueva y sigue con la tarea original.
