# 028 — PWA instalable + shell offline

```yaml
id: 028
titulo: "Web App Manifest + service worker: instalable en el móvil, abre al instante y funciona con red mala"
estado: Implemented
tipo: infraestructura
depende_de: [019, 018]
propietario: ""
version: 2
```

## 0. Contexto de la decisión

`ROADMAP.md` F5 ("PWA instalable") — mencionado en la fase pero sin spec propia hasta ahora. Petición explícita del propietario (2026-08-28): llevarse la herramienta en el móvil "a cualquier lado", con UX ágil, como si fuera una app.

No hace falta app nativa ni tienda: la app ya es un SPA de Vite/TypeScript. Una PWA da el 100 % de lo pedido (icono en pantalla de inicio, pantalla completa sin barra de navegador, apertura instantánea, tolerancia a red mala) sin salir del stack de `CLAUDE.md` §5.

## 1. Problema / motivación

El propietario quiere abrir la herramienta desde el móvil, en cualquier sitio, al instante — icono propio en la pantalla de inicio, a pantalla completa, y que **abra aunque la cobertura sea mala** (metro, sótano de comisaría, evento saturado con la red colapsada). Hoy es una pestaña de navegador que se recarga entera y falla sin red.

## 2. Fuente(s) de datos

No aplica — no consume ninguna fuente externa. Genera dos artefactos estáticos (manifest + service worker) en el build.

## 3. Contrato de datos (normalizado)

### `manifest.webmanifest` (generado en build)

```jsonc
{
  "name": "Intelligent City Monitor",
  "short_name": "IC Monitor",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "lang": "es",
  "background_color": "#0b1f33",
  "theme_color": "#0b1f33",
  "categories": ["utilities", "government"],
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Iconos (`public/icons/`, assets versionados)

Generados con `npm run marca` (spec `030`) del logo `public/assets/logo.png`, sobre fondo navy `#0b1f33`, con zona segura para la variante `maskable`. Versionados — no hay pipeline en runtime.

### `<head>` de `index.html`

- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" content="#0b1f33">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<meta name="apple-mobile-web-app-title" content="IC Monitor">`
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` (180×180, fondo navy — iOS no aplica máscara)
- `viewport` ampliado con `viewport-fit=cover` (el resto del layout móvil lo cubre la spec 029).

Los iconos (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png`) se generan con `npm run marca` (`scripts/generar-marca.ts`, Node puro — sin `sips` ni dependencias) y se **versionan** en `public/icons/`. No es una dependencia de build.

### Service worker (Workbox vía `vite-plugin-pwa`, `strategies: generateSW`, `registerType: 'prompt'`)

| Recurso | Estrategia | Parámetros |
|---|---|---|
| Assets del build (JS/CSS/SVG/woff2) | Precache con revisión por hash (`globPatterns`) | `index.html` **NO** se precachea (ver abajo) |
| Navegación (`request.mode === 'navigate'`) | **NetworkFirst** (`cacheName: icm-shell`) | `networkTimeoutSeconds: 3`, `maxEntries: 2`, `statuses: [200]` |
| Tiles de OpenFreeMap (`*.openfreemap.org`) | CacheFirst (`icm-tiles`) | `maxEntries: 300`, `maxAgeSeconds: 1209600` (14 d), `statuses: [0, 200]` |
| Datos `/api/*/v1/*` | StaleWhileRevalidate (`icm-datos`) | `maxEntries: 60`, `maxAgeSeconds: 3600`, `statuses: [200]` |
| `/api/auth/*` | **NetworkOnly** (nunca en caché) | — |

**Por qué `index.html` no se precachea y la navegación va por NetworkFirst:** con `navigateFallback` a un `index.html` precacheado, el SW serviría *siempre* la app —incluso a una sesión caducada—, saltándose el gate de la spec 018, que decide en el servidor si toca app o pantalla de login. Con NetworkFirst la navegación pasa por el gate en cada carga (y recoge versiones nuevas del HTML); solo cae a la última copia buena cuando de verdad no hay red.

### Interacción con el gate de acceso (spec 018)

- `/api/auth/*` → `NetworkOnly`, nunca entra en caché del SW. La pantalla de login la sirve el middleware ante una navegación sin sesión, y NetworkFirst la deja pasar sin cachearla como "app".
- `/api/*/v1/*` con **401**: `cacheableResponse.statuses: [200]` impide cachearlo; el 401 se propaga y `src/pwa.ts` (interceptor de `window.fetch`) fuerza `location.reload()` → el gate sirve el login. `/api/auth/*` se excluye del interceptor.
- En `logout`, `src/ui/chasis.ts` llama a `limpiarCacheDatos()` (`src/pwa.ts` → `caches.delete('icm-datos')`) antes de recargar.

### UX de actualización

`registerType: 'prompt'` + import de `virtual:pwa-register` en `src/pwa.ts`: cuando hay un SW nuevo en espera, `onNeedRefresh` muestra un toast **"Nueva versión disponible · Actualizar"** (con botón de descartar). Al pulsar "Actualizar": `updateSW(true)` (`skipWaiting` + reload). **Nunca** se recarga sin avisar.

## 4. Pipeline (seed → caché → endpoint)

No aplica — no hay pipeline de datos. `initPwa()` (`src/pwa.ts`) se llama al principio de `main()` (`src/main.ts`). En `npm run dev` el SW está **desactivado** (`devOptions.enabled: false`) y `initPwa()` solo instala el interceptor de 401 (no registra SW).

El middleware de la spec 018 se amplía para **no** cerrar el paso a los ficheros PWA: `matcher` excluye `manifest.webmanifest`, `sw.js`, `workbox-*`, `registerSW.js`, `icons/` (además de `assets/` y `api/auth/`).

## 5. Contrato de capa de mapa

No aplica — no cambia ninguna capa ni panel.

## 6. Criterios de aceptación (Definition of Done)

- [x] `npm run build` genera `dist/manifest.webmanifest` (válido: `name`, `short_name`, `display: standalone`, `scope`, `lang`, `theme/background_color`, 3 iconos incl. `maskable`), `dist/sw.js` + `dist/workbox-*.js`, y precache de 9 entradas (~1,6 MiB, dominado por el bundle JS ya existente — el SW no añade peso al primer render).
- [x] `index.html` inyecta `<link rel="manifest">` (vite-plugin-pwa) y lleva `theme-color`, `apple-mobile-web-app-capable/-status-bar-style/-title`, `apple-touch-icon` y `viewport-fit=cover` — verificado en el HTML emitido.
- [x] Iconos generados (`npm run marca`), fondo navy y zona segura para el `maskable` — verificados visualmente. Versionados en `public/icons/`. (v2 usaba el escudo oficial; spec `030` lo sustituyó por el logo neutro.)
- [x] Rutas del SW correctas en `dist/sw.js`: `NetworkFirst` para navegación (`icm-shell`), `StaleWhileRevalidate` para `/api/**/v1/**` (`icm-datos`, solo `200`), `CacheFirst` para `openfreemap.org` (`icm-tiles`), `NetworkOnly` para `/api/auth/*`.
- [x] `src/pwa.ts`: interceptor de `window.fetch` que ante un `401` en `/api/*` (excepto `/api/auth/*`) fuerza `location.reload()`; `limpiarCacheDatos()` conectado al botón "Cerrar sesión". Cookie `HttpOnly` confirmada (JS no puede leerla/borrarla).
- [x] `vite-plugin-pwa` es la única dependencia nueva. `npm run typecheck`, `npm run test` (224/224) y `npm run build` sin regresiones. App verificada tras login en `npm run dev` sin errores de consola.
- [ ] **Pendiente de un despliegue real** (el runtime de service worker no se puede ejercitar en el navegador de esta sesión — SW deshabilitado en el sandbox): Lighthouse PWA/Performance en móvil, "Añadir a pantalla de inicio" en Android Chrome + iOS Safari (`standalone`, icono, status bar), apertura offline tras primera carga, ausencia de `/api/auth/*` en `caches`, y el toast de actualización con dos despliegues consecutivos. Se cierran en la primera subida a Vercel.

## 7. Riesgos y fuera de alcance

- **"No veo la versión nueva"** por SW/caché mal invalidada — mitigado con `registerType: 'prompt'` + navegación NetworkFirst + `cleanupOutdatedCaches` + toast explícito. Documentado en README cómo forzar limpieza (DevTools → Application → Clear storage) para depurar.
- **Verificación de runtime pendiente de despliegue**: el navegador de las sesiones de Claude Code no permite registrar service workers, así que el comportamiento en vivo del SW (precache, offline, toast, cachés) se valida en la primera subida a Vercel. Todo lo estático (artefactos del build, manifest, rutas del SW, iconos, cabeceras) sí está verificado.
- **iOS**: sin push, sin background sync, sin `beforeinstallprompt` (instalación manual: Compartir → Añadir a pantalla de inicio). Se documenta con captura; no se puede automatizar.
- **No se precachea toda Valencia** offline (descarga grande y que envejece mal) — solo lo ya visitado. Un "modo offline preparado" (precarga de un área elegida) es fast-follow con su propia decisión.
- **Notificaciones push sobre alertas** (spec 014) siguen siendo otra spec — la 028 solo deja el SW registrado, que la 014 podrá reutilizar.
- **`vite-plugin-pwa` arrastra el toolchain de Workbox** (~318 paquetes transitivos, solo `devDependencies`); `npm audit` marca vulnerabilidades en dependencias transitivas de build (glob antiguo, etc.) que no llegan al runtime servido. No se corre `npm audit fix --force` (rompería). Revisar al subir de versión el plugin.
- **Depende de la spec 018** (ya `Implemented`): la navegación NetworkFirst y la exclusión de `/api/auth/*` solo tienen sentido con el gate delante.
- **El layout móvil** (cabecera/sidebar/paneles adaptados al dedo, safe-area en todo el chasis) es la spec **029**, no esta — la 028 solo añade `viewport-fit=cover` y la instalabilidad.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-28 | Creación, `Draft`. Contrato de manifest, iconos, meta tags y estrategias de service worker congelado. |
| 2 | 2026-08-28 | Implementado. `vite-plugin-pwa` (única dependencia nueva) en `vite.config.ts` (`generateSW`, `registerType: 'prompt'`, `devOptions.enabled: false`); `scripts/generar-iconos-pwa.ts` + `public/icons/*` (`npm run iconos:pwa`); `src/pwa.ts` (registro del SW, toast de actualización, interceptor de 401, `limpiarCacheDatos`) llamado desde `main()`; cabeceras PWA + `viewport-fit=cover` en `index.html`; `src/vite-env.d.ts`; matcher del middleware (spec 018) ampliado para dejar pasar los ficheros PWA. Cambio respecto a v1: la navegación pasa de `navigateFallback` a **NetworkFirst** e `index.html` deja de precachearse, para que el gate de la spec 018 decida app vs. login en cada carga. `typecheck` + `test` (224/224) + `build` verdes; app verificada tras login en `npm run dev`. Pasa a `Implemented`; los criterios de runtime del SW quedan para cerrar en el primer despliegue (el navegador de la sesión no registra SW). |
