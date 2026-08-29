# VLC Monitor

Mapa en tiempo real de la ciudad de Valencia: movilidad, meteorología, calidad del aire, eventos e incidencias, agregados en un único panel a partir de fuentes públicas y gratuitas.

Este proyecto se desarrolla con **Spec-Driven Development**: ninguna capa o endpoint se escribe sin una spec previa en `specs/`. Si vas a trabajar en este repo con Claude Code, **lee primero `CLAUDE.md`** — define las reglas del proyecto, sus límites de alcance y sus límites éticos/legales, que son innegociables.

## Empezar

```bash
npm install
npm run dev
```

## Acceso protegido (spec 018)

La app se sirve detrás de un gate de usuario + PIN (`middleware.ts`, edge). En
producción es **fail-closed**: sin `AUTH_SECRET` no se sirve nada.

1. Genera un secreto de firma: `openssl rand -hex 32` → variable `AUTH_SECRET`.
2. Genera una entrada por cada acceso (persona o turno):

   ```bash
   npm run auth:hash -- rcerdan
   ```

   Pide el PIN por consola (sin eco, mínimo 6 dígitos) e imprime un objeto
   `{u,h,s}`. Junta todas las entradas en un array JSON → variable `APP_USERS`.
3. En Vercel: **Settings → Environment Variables** → añade `AUTH_SECRET` y
   `APP_USERS`. Alta/baja de un acceso = editar `APP_USERS` y redeployar.
4. En local, para probar el gate: crea un `.env` (git-ignored) con esas dos
   variables. Sin `.env`, `npm run dev` funciona sin barrera.

## Instalar en el móvil (PWA, spec 028)

La app es una PWA instalable. Tras entrar una vez con sesión válida:

- **Android / Chrome**: menú → "Añadir a pantalla de inicio" (o el aviso de instalación).
- **iOS / Safari**: Compartir → "Añadir a pantalla de inicio".

Abre a pantalla completa, con icono propio, y sigue abriendo con red mala
(sirve los últimos datos cacheados, marcados como no en vivo). Cuando hay una
versión nueva desplegada aparece un aviso "Nueva versión · Actualizar" — nunca
se recarga sola.

Los iconos se regeneran del escudo oficial con `npm run iconos:pwa` (requiere
macOS por `sips`); su salida está versionada en `public/icons/`.

Para depurar la caché del service worker: DevTools → Application → Clear storage.

## Layout escritorio / móvil (spec 029)

La misma app se adapta sola: en móvil (pantalla ≤ 640 px + táctil) la cabecera
se compacta, el sidebar pasa a hoja a pantalla completa y los paneles a un
bottom sheet arrastrable de 3 alturas. En escritorio no cambia nada. El pie del
sidebar tiene un enlace "Ver versión de escritorio / móvil" para forzar uno.

## Dónde está cada cosa

| Quiero... | Voy a... |
|---|---|
| Entender el producto y por qué existe | `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` |
| Ver de dónde salen los patrones técnicos | `docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md` |
| Ver el catálogo de fuentes de "actividad humana" y el límite ético aplicado | `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` |
| Saber en qué fase estamos y qué toca ahora | `ROADMAP.md` |
| Saber el estado de cada pieza concreta | `specs/INDEX.md` |
| Escribir una spec nueva | Copiar `specs/SPEC_TEMPLATE.md` |
| Reglas del proyecto para cualquier sesión de Claude Code | `CLAUDE.md` |

## Estado actual

Fases **F0 (Cimientos)**, **F1 (MVP — 3 capas)**, la mayor parte de **F2 (Movilidad completa)**, **F3 (Índice de Pulso de Distrito)**, **F3.5 (Agenda y aglomeraciones previsibles)** y **F4 (Contexto mediático)** completas: mapa base + distritos (`000`), meteorología (`001`), calidad del aire (`002`), tráfico en tiempo real (`004`), Valenbisi (`005`), aparcamiento (`006`), el índice compuesto Pulso de Distrito (`010`, combina tráfico+aire+meteo sin fuente propia), Fallas (`008`, v1 acotada — monumentos, carpas y zonas de movilidad reducida) y contexto mediático (`009`, RSS de Las Provincias + Valencia Plaza + GDELT, con resiliencia por fuente individual), todas `Implemented` — ver `specs/INDEX.md`. Dos piezas quedan `Planned` por falta de fuente limpia: la capa EMT (`007`, paradas confirmadas pero sin API de llegadas en tiempo real) y Reddit como señal secundaria dentro de `009` (bloqueado 403 sin autenticación — necesita que el usuario registre su propia app gratuita en `reddit.com/prefs/apps`). La agenda cultural general (más allá de Fallas) también queda como fast-follow de `008` por el mismo motivo. También hay un prototipo paralelo de capa con datos sintéticos (`003-capa-movimiento-personas-mock.md`) para validar la UI de choropleth antes de tener ninguna fuente real de movilidad agregada.

## Licencia y datos

Todas las fuentes de datos usadas son de acceso público/gratuito — ver la tabla de fuentes en `docs/investigacion/PULSO_HUMANO_FUENTES_OSINT.md` y en cada spec individual. Ninguna capa usa datos de localización individual (ver `CLAUDE.md` §4).
