# 018 — Acceso protegido (gate propio en middleware) + dominio propio

```yaml
id: 018
titulo: "Barrera de acceso con usuario + PIN antes de la app y de /api/*, y publicación en dominio propio"
estado: Implemented
tipo: infraestructura
depende_de: [019]
propietario: ""
version: 3
```

## 0. Contexto de la decisión

`ROADMAP.md` F5 y `docs/decisiones/ADR-001-linea-producto-seguridad-publica.md`: el producto es una herramienta de despacho con identidad institucional de Policía Local de València, desplegada en internet público (Vercel Hobby). La spec `019` §7 ya señala el riesgo: publicar la identidad institucional sin control de acceso es un problema antes de ser un problema de diseño. Esta spec lo resuelve.

Petición explícita del propietario (2026-08-28): poder abrir la herramienta desde su móvil "en cualquier lado, con contraseña", con UX ágil — es decir, la barrera no puede obligar a re-autenticarse en cada apertura.

### Por qué un gate propio y no la protección nativa de Vercel

Verificado antes de redactar (lo pedía la fila `Planned` original de esta spec):

- **Password Protection** de Vercel (contraseña única para ver el deployment) es un **add-on de pago**, no disponible en el plan Hobby.
- **Vercel Authentication** (gratis en todos los planes) exige que **cada visitante tenga una cuenta de Vercel con acceso al equipo** — inservible para un mando que no está en el equipo de Vercel.

Conclusión: no se puede prometer protección nativa en Hobby. Se implementa un gate propio con **Vercel Middleware** (`middleware.ts` en la raíz, runtime edge, incluido en Hobby), que ya es el runtime que usan todos los endpoints de `api/` (`export const config = { runtime: 'edge' }`).

## 1. Problema / motivación

Cualquiera que dé con la URL del despliegue ve hoy el mapa completo, la identidad de Policía Local y todos los endpoints `/api/*`. Hace falta una pantalla de acceso con credenciales antes de servir nada, que en el móvil recuerde la sesión ~30 días para no ser un incordio, y que también proteja los endpoints de datos (no solo el HTML).

## 2. Fuente(s) de datos

No aplica — no es una capa, no consume ninguna fuente externa. La "fuente" son las credenciales, que viven en variables de entorno de Vercel:

| Variable | Contenido | Formato |
|---|---|---|
| `APP_USERS` | Lista de accesos (persona o turno). El PIN va **hasheado**, nunca en claro. | JSON: `[{"u":"rcerdan","h":"<pbkdf2-sha256 hex>","s":"<salt hex>"}]` |
| `AUTH_SECRET` | Secreto para firmar la cookie de sesión (HMAC). ≥ 32 bytes aleatorios. | hex |

El hash es **PBKDF2-SHA256** (disponible en `crypto.subtle` del runtime edge), 100 000 iteraciones, sal de 16 bytes por usuario. Se elige PBKDF2 sobre SHA-256 a secas porque WebCrypto lo ofrece en edge sin dependencias y encarece el ataque por diccionario; se elige sobre bcrypt/argon2 porque esos no están en WebCrypto y añadirían una dependencia nativa incompatible con edge. Trade-off aceptado: con rate-limit + PIN de ≥ 6 dígitos el margen es suficiente para v1.

## 3. Contrato de datos (normalizado)

### Cookie de sesión

```
imc_session = base64url(payload) "." base64url(HMAC-SHA256(payload, AUTH_SECRET))

payload = { "u": string,   // usuario
            "iat": number,  // epoch ms de emisión
            "exp": number }  // epoch ms de expiración
```

- Atributos: `HttpOnly; Secure; SameSite=Lax; Path=/`.
- "Recordar este dispositivo" marcado (por defecto) → `Max-Age` = 30 días y `exp` a 30 días.
- Desmarcado → sin `Max-Age` (cookie de sesión del navegador), `exp` a 12 h.
- Verificación: firma HMAC válida **y** `exp > Date.now()`. Cualquier fallo = no autenticado.

### Endpoints (formato edge, igual patrón que `api/meteo/v1/actual.ts`)

```typescript
// POST /api/auth/v1/login
//   req  { usuario: string; pin: string; recordar?: boolean }
//   200  { ok: true }                + Set-Cookie: imc_session=...
//   401  { ok: false }                 (mensaje genérico, no distingue usuario vs PIN)
//   429  { ok: false; retryAfterS: number } + Retry-After

// POST /api/auth/v1/logout
//   200  { ok: true }                + Set-Cookie: imc_session=; Max-Age=0

// GET /api/auth/v1/estado
//   200  { autenticado: boolean; usuario?: string }
```

Comparación del PIN en **tiempo constante** (`crypto.subtle` + comparación byte a byte sin cortocircuito). Nunca se registra el PIN ni el `usuario` fallido en logs.

### Rate-limit

Por IP (`x-forwarded-for`, primer valor) **y** por `usuario`: 5 intentos fallidos por ventana de 15 min → 429 con `Retry-After`. Implementado con el `Map` en memoria de proceso del mismo patrón que `api/_shared/cache.ts` (documentar en el código la misma limitación: en edge multi-región es best-effort; se sustituye por Upstash cuando existan `UPSTASH_REDIS_REST_*`, sin cambiar la firma).

## 4. Pipeline (seed → caché → endpoint)

No hay pipeline de datos. El "endpoint interno" son los tres de `/api/auth/v1/*` descritos arriba. El middleware no cachea nada.

### `middleware.ts` (raíz del repo)

```typescript
export const config = {
  // Todo excepto: los estáticos que necesita la propia pantalla de login,
  // los assets PWA (spec 028) y los endpoints de auth.
  matcher: ['/((?!assets/|icons/|favicon|manifest\\.webmanifest|sw\\.js|api/auth/).*)'],
};
```

Lógica:

1. Sin `AUTH_SECRET` configurado → **el gate NO se activa** (spec `030` / ADR-002: la app se sirve abierta, modo repo público / demo). El gate solo entra en juego si existe `AUTH_SECRET` (+ `APP_USERS`). Igual en `npm run dev` (opt-in vía `.env`).
2. Lee `imc_session`. Si firma HMAC + `exp` válidos → continúa (`return undefined`).
3. Si no:
   - Petición a `/api/*` → `401 { error: 'no autenticado' }` en JSON.
   - Resto (navegación) → sirve la **pantalla de login en la misma URL**, `200`, sin redirect (no ensucia el historial; tras entrar, `location.reload()` muestra la página pedida). Se eligió servir en la misma URL en vez de `rewrite` a `/login` para no depender de `@vercel/edge` ni de una ruta estática extra.

## 5. Contrato de capa de mapa

No es una capa. La pantalla de login es una página propia (`api/_shared/pagina-login.ts`, string HTML que sirve el middleware):

- HTML autocontenido, **sin dependencias de frontend** ni bundle de la app.
- Marca: logo `/assets/logo.png` (`onerror` lo oculta), `MARCA.nombre` + `MARCA.tagline` (`src/config/marca.ts`), fondo navy `#0b1f33`.
- Formulario: `usuario` (text) + `pin` (`inputmode="numeric"`, `autocomplete="current-password"`), checkbox "Recordar este dispositivo" marcado por defecto, botón "Entrar".
- Al enviar: `fetch('/api/auth/v1/login', …)`; si `ok` → `location.reload()` (la cookie ya está puesta, el middleware deja pasar); si 401 → "Usuario o PIN incorrectos"; si 429 → "Demasiados intentos. Espera N s".
- Mobile-first, `viewport-fit=cover`, `env(safe-area-inset-*)`, `<meta name="robots" content="noindex">`.
- Indicador de sesión: "Sesión: <usuario>" + botón "Cerrar sesión" en el pie del sidebar (`src/ui/chasis.ts`), que consulta `GET /api/auth/v1/estado` y se oculta si no hay sesión (p. ej. dev sin gate).

## 6. Criterios de aceptación (Definition of Done)

- [x] `middleware.ts` bloquea el HTML de la app **y toda ruta `/api/*` salvo `/api/auth/*`** sin cookie válida — verificado con `curl` sin cookie (pantalla de login servida en la misma URL con 200 para navegación, `401 {"error":"no autenticado"}` para `/api/*`) y con cookie válida (`index.html` real y `200` en `/api/meteo/v1/actual`). Réplica local del gate en `vite.config.ts` (`authDevPlugin`) para poder verificar en `npm run dev`; en producción Vercel ejecuta `middleware.ts` directamente.
- [x] `POST /api/auth/v1/login`: credencial correcta → `Set-Cookie` firmada (`HttpOnly; Secure; SameSite=Lax`); incorrecta → `401 {"ok":false}`, cuerpo idéntico para usuario inexistente y PIN erróneo (verificado en `api/auth/v1/login.test.ts`).
- [x] Tests: `api/_shared/auth.test.ts` (19) — firma/verificación de cookie (válida, `exp` caducado, payload manipulado con firma reusada → rechazado), `timingSafeEqual`, `parseAppUsers`, rate-limit con reloj inyectado; `api/auth/v1/login.test.ts` (7) — 200+cookie, 401 genérico, 429 tras 5 fallos con `Retry-After`, 400/405/503. **Total 224/224.**
- [x] PIN nunca en claro: `APP_USERS` solo lleva `h` (PBKDF2-SHA256, 100 000 iteraciones) + `s`; `middleware.ts` y `login.ts` no registran PIN ni credenciales en ningún log; comparación en tiempo constante (`timingSafeEqual`) y PBKDF2 ejecutado siempre (aunque el usuario no exista) para no filtrar por tiempo.
- [x] Cookie de 30 días con "recordar" marcado (por defecto); cookie de sesión (12 h, sin `Max-Age`) sin marcarlo — verificado en test y en navegador. *Pendiente de cerrar contra un despliegue real:* persistencia en iOS Safari tras "Añadir a pantalla de inicio" — se verifica junto con la spec 028 (PWA), que es la que habilita ese modo.
- [x] `POST /api/auth/v1/logout` borra la cookie (`Max-Age=0`) y la siguiente navegación vuelve a la pantalla de login — verificado en navegador (botón "Cerrar sesión" del pie del sidebar).
- [x] Pantalla de login (`api/_shared/pagina-login.ts`, servida por el middleware) con la marca (`src/config/marca.ts`), responsive (verificada a 1280px y 375×812), `inputmode="numeric"` en el PIN, sin dependencias de frontend ni bundle de la app. Indicador "Sesión: <usuario>" + "Cerrar sesión" añadido al pie del sidebar (`src/ui/chasis.ts`), oculto si el gate no está activo.
- [x] `npm run auth:hash -- <usuario>` (`scripts/auth-hash.ts`): pide el PIN por stdin sin eco, reutiliza el `pbkdf2` del runtime, imprime `{u,h,s}` — documentado en README.
- [x] `npm run typecheck`, `npm run test` (224/224) y `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Gestión de usuarios**: alta/baja se hace editando `APP_USERS` en Vercel (redeploy o cambio de env var). **No hay UI de administración** en v1 — es deliberado, no hace falta para el caso "me lo llevo yo / mi turno".
- **Sin auditoría de accesos** (quién entró y cuándo), **sin 2FA, sin recuperación de PIN**. Si la herramienta pasa a contener dato operativo real (más allá de agregados públicos ya abiertos), esto pasa a ser obligatorio y es **otra spec** (IdP real / SSO del cuerpo). Anotado también en `CLAUDE.md` §4 como límite.
- **Rate-limit en memoria de proceso**: best-effort en edge multi-región, igual que la caché actual. Mitiga fuerza bruta casual, no un ataque distribuido — de ahí el mínimo de 6 dígitos de PIN, documentado.
- **Dominio propio**: la compra y el apuntado (CNAME a Vercel) los hace el propietario. No bloquea nada: un `*.vercel.app` funciona igual, y la cookie `Secure` host-only sirve para ambos. Se documenta el paso en el README cuando el dominio exista.
- **Fuera de alcance**: CSP y cabeceras de seguridad (`X-Frame-Options`, `Strict-Transport-Security`, etc.) — fast-follow razonable en el mismo `middleware.ts`, no en esta versión. Cifrado de datos en reposo (no hay datos sensibles en reposo hoy).
- **Interacción con la PWA (spec 028)**: el service worker no debe cachear respuestas de `/api/auth/*` ni la página `/login`, y ante un 401 en `/api/*` debe dejar pasar el error para que el frontend redirija. Contrato recogido en el DoD de la 028; recomendable implementar **esta spec antes** que la 028.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-28 | Creación, `Draft`. Sustituye la fila `Planned` "Publicación con contraseña en dominio propio". Verificado que Vercel no ofrece password-protection en Hobby → se opta por gate propio en middleware. Contrato de cookie, endpoints y rate-limit congelados. |
| 2 | 2026-08-28 | Implementado. `api/_shared/auth.ts` (PBKDF2, HMAC de cookie, rate-limit en memoria), `api/_shared/pagina-login.ts`, `middleware.ts` + `authDevPlugin` en `vite.config.ts` para dev, `api/auth/v1/{login,logout,estado}.ts`, `scripts/auth-hash.ts` (`npm run auth:hash`), indicador de sesión + logout en `src/ui/chasis.ts`. 26 tests nuevos (224/224), `typecheck` y `build` verdes, flujo completo verificado con `curl` y en navegador (login, gate de `/api/*`, logout, responsive 375×812). Cambio de diseño respecto a v1: la pantalla de login se sirve en la misma URL desde el middleware (no `rewrite` a `/login`), evitando la dependencia `@vercel/edge` y una ruta estática extra. Pasa a `Implemented`; único punto abierto: persistencia de sesión en PWA iOS, que se cierra con la spec 028. |
| 3 | 2026-08-29 | Spec `030` / ADR-002: el gate pasa de **fail-closed a fail-open**. Sin `AUTH_SECRET`, `middleware.ts` hace `return undefined` (app abierta, repo público / demo); con `AUTH_SECRET` + `APP_USERS`, el gate funciona igual que en v2. Marca de la pantalla de login desde `src/config/marca.ts` (sin escudo institucional). Verificado con `curl` (sin `.env`: `/` y `/api/*` a 200; con `.env`: gate). |
