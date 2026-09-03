# 030 — Re-marca genérica + repo público

```yaml
id: 030
titulo: "Quitar identidad institucional, placeholder de logo neutro, gate opcional, licencia MIT y README público"
estado: Implemented
tipo: fundacional
depende_de: [019, 018]
propietario: ""
version: 3
```

## 0. Contexto de la decisión

`docs/decisiones/ADR-002-repo-publico-marca-generica.md` (Aceptado, 2026-08-29). El repo se publica como monitor de datos abiertos de València de propósito general; se retira el escudo oficial de Policía Local de València y toda marca institucional; la versión aumentada para toma de decisiones del product owner es un proyecto privado aparte. El límite ético/legal de `CLAUDE.md` §4 se mantiene íntegro.

## 1. Problema / motivación

Hoy la app lleva el escudo oficial de Policía Local de València, la tagline "Policía Local de València" y el pie "Uso interno — no es un servicio público", y el middleware es fail-closed (sin `AUTH_SECRET` no arranca). Para poder publicar el repo y ofrecer una demo abierta hace falta: sin marca de ningún cuerpo, con un logo neutro, y que arranque sin configuración de acceso.

## 2. Fuente(s) de datos

No aplica — no consume ninguna fuente externa. Sustituye un asset estático y cambia copy/config.

**Asset de marca**: se retira `public/assets/policia-local-valencia-logo.png` (escudo oficial). Se genera un **placeholder neutro** con `scripts/generar-marca.ts` (Node puro, sin dependencias: dibuja la marca y la codifica a PNG). Diseño: anillos concéntricos tipo radar + punto central + un "blip" de acento, sobre transparente para la cabecera y sobre el navy `#0b1f33` para los iconos PWA. Es un placeholder explícito: cualquiera que despliegue el repo pone el suyo.

## 3. Contrato de datos (normalizado)

No hay dato de dominio. Constantes de marca (un único sitio, `src/config/marca.ts` nuevo):

```typescript
export const MARCA = {
  nombre: 'Intelligent City Monitor',
  tagline: 'Datos abiertos de València',
  // Pie visible siempre en la app (sustituye "Uso interno — no es un servicio público")
  pie: 'Proyecto de datos abiertos · sin relación con ningún organismo oficial',
} as const;
```

`src/ui/chasis.ts` y la pantalla de login (`api/_shared/pagina-login.ts`) consumen estas constantes en vez de literales.

## 4. Pipeline (seed → caché → endpoint)

No aplica. Cambios de configuración:

- **`middleware.ts` (spec 018 v3):** sin `AUTH_SECRET` → `return undefined` (app abierta). Con `AUTH_SECRET` + `APP_USERS` → gate como hasta ahora. El `authDevPlugin` de `vite.config.ts` ya era opt-in; sin cambios.
- **`LICENSE`** nuevo — MIT, titular "Roberto Cerdán" / colaboradores.
- **`.env.example`** — aclara que `AUTH_SECRET`/`APP_USERS` son opcionales (solo para desplegar en privado con acceso restringido).

## 5. Contrato de capa de mapa

No es una capa. Cambios de chasis (spec 019):

- Cabecera: logo = placeholder neutro; nombre = `MARCA.nombre`; tagline = `MARCA.tagline`.
- Pie del sidebar: `MARCA.pie` (el bloque de sesión + "Cerrar sesión" de la spec 018 se mantiene, solo aparece si el gate está activo).
- Iconos PWA (spec 028): regenerados desde el placeholder neutro.
- `index.html` `<title>` y `apple-mobile-web-app-title`: coherentes con `MARCA.nombre`.

## 6. Criterios de aceptación (Definition of Done)

- [x] No queda "Policía Local" / "escudo" / "uso interno" como identidad del producto en `src/`, `index.html`, `api/`, `README.md` ni `CLAUDE.md` §1 — verificado con `grep -ri`. (El contexto histórico de ADR-001 en las specs `019`/`012`/`021` se conserva como registro, marcado como tal.)
- [x] `public/assets/policia-local-valencia-logo.png` y `scripts/generar-iconos-pwa.ts` eliminados; `public/assets/logo.png` (placeholder radar, transparente) + `public/icons/*` (incl. `favicon-32.png`) generados por `npm run marca` (`scripts/generar-marca.ts`, Node puro — rasterizador SDF + codificador PNG, sin `sips` ni dependencias). Verificados visualmente.
- [x] `src/config/marca.ts` — único sitio con nombre/tagline/pie; `src/ui/chasis.ts` y `api/_shared/pagina-login.ts` lo consumen.
- [x] `middleware.ts`: sin `AUTH_SECRET` → `return undefined` (app abierta). Con `AUTH_SECRET`+`APP_USERS` → gate de la spec 018. Verificado con `curl` en ambos modos y en navegador.
- [x] `LICENSE` (MIT) en la raíz; `package.json` `"license": "MIT"`, descripción neutra, `vercel` movido a `devDependencies`, script `marca` (sustituye `iconos:pwa`).
- [x] `README.md` reescrito para audiencia pública (qué es, arranque, despliegue con/sin acceso restringido, PWA, cómo cambiar el logo, licencia, resumen de `CLAUDE.md` §4). `.env.example` aclara que el gate es opcional.
- [x] `CLAUDE.md` §1 reescrito según ADR-002; §4 intacto. `ROADMAP.md` F5/F8 desmarcados.
- [x] Specs `019` (v4) y `018` (v3) actualizadas.
- [x] `npm run typecheck`, `npm run test` y `npm run build` sin regresiones; app verificada en navegador (logo nuevo en cabecera, tagline y pie nuevos, sin gate; y con gate vía `.env`).

## 7. Riesgos y fuera de alcance

- **El nombre "Intelligent City Monitor" se hereda de ADR-001** (donde era la marca del producto policial). Se mantiene por ser genérico y por no re-cablear todo; si el product owner quiere otro nombre, es cambiar `src/config/marca.ts` y este documento.
- **Historial de git**: el escudo oficial seguirá existiendo en commits antiguos aunque se borre el fichero. Reescribir historia (`git filter-repo`) es desproporcionado y arriesgado para un asset que era de acceso público de todas formas; se decide **no** hacerlo. Si en el futuro se considera necesario, es su propia tarea con backup previo.
- **Fuera de alcance**: la versión privada aumentada (otro repo/proyecto), cualquier rediseño visual más allá de sustituir marca y logo, i18n del copy nuevo (sigue en ES como el resto).
- **Demo en Vercel**: que "se vea potente" es fuera del alcance estricto de esta spec (la app ya renderiza mapa + capas + datos reales). Un pulido de la vista por defecto de la demo, si se quiere, es fast-follow con su nota propia.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-29 | Creación + implementación. Deriva de ADR-002. `scripts/generar-marca.ts` (marca radar en Node puro) + `public/assets/logo.png` + `public/icons/*`; `src/config/marca.ts`; `chasis.ts` y `pagina-login.ts` consumen la marca; `middleware.ts` fail-open; `LICENSE` MIT; README y `CLAUDE.md` §1 reescritos; specs `018`/`019` actualizadas. Escudo oficial y `generar-iconos-pwa.ts` eliminados. `typecheck` + `test` + `build` verdes, verificado en navegador. Pasa a `Implemented`. |
| 3 | 2026-09-04 | **Pieza de portfolio.** `README.md` reescrito como presentación pública (ES + resumen EN): demo en vivo enlazada (`vlc-monitor.vercel.app`), 4 capturas reales en `docs/capturas/`, diagrama del patrón `seed→caché→endpoint`, tabla de decisiones técnicas, el proceso spec-driven como argumento, y bloque de ética. Nuevo `docs/FUENTES_Y_LICENCIAS.md` — inventario completo por capa (fuente, spec, licencia CC BY 4.0 / ODbL / etc., atribución requerida), mapa base, infraestructura (coste 0 €) y licencias de las dependencias de software. Nuevo `docs/PRESENTACION_LINKEDIN.md` con los textos de publicación. Cierra el fast-follow anotado en §7 ("un pulido de la vista por defecto de la demo / que se vea potente"). Sin cambios de código ni de comportamiento de la app. |
| 2 | 2026-08-31 | **Primer despliegue real a Vercel** (repo hecho público). Tres límites de Hobby resueltos por el camino: (1) el grafo viario ~9 MB no cabe en función → estático del CDN (spec `020` v3); (2) ~18 funciones > límite de 12 → toda la API pasa a **una sola función**: handlers movidos a `src/server/<dominio>-<recurso>.ts`, router en `api/_router-src.ts` bundleado con esbuild a `api/router.js` (`scripts/bundle-api.mjs`, corre en `npm run build`), `vercel.json` reescribe `/api/*` → `/api/router`; (3) el runtime Node de Vercel ignora `export default` de estilo Web → el router exporta métodos HTTP con nombre (`export const GET/POST/... = dispatch`). Añadidos import attributes `with { type: 'json' }` a todos los imports de JSON (ESM estricto). Env vars `AUTH_SECRET`/`APP_USERS` retiradas del proyecto Vercel → demo abierta. 14 endpoints verificados 200 en producción + app en navegador. Arquitectura documentada en `CLAUDE.md` §6. |
