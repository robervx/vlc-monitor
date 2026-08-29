import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(rootDir, 'api');

/**
 * Sirve las funciones de api/ (formato Vercel Edge: `export default (req: Request) =>
 * Promise<Response>`, `export const config = { runtime: 'edge' }`) durante
 * `npm run dev`, traduciendo IncomingMessage/ServerResponse de Node a la Fetch API.
 *
 * En producción (Vercel) estas mismas funciones se despliegan tal cual — este
 * plugin es solo la réplica local del router de api/ de Vercel, no un sustituto
 * de su runtime real. Ver vite.config.ts (comentario original) y CLAUDE.md §2:
 * el frontend siempre habla con /api/..., nunca con la fuente externa.
 */
function apiDevPlugin(): Plugin {
  return {
    name: 'vlc-monitor-api-dev',
    configureServer(server: ViteDevServer) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          next();
          return;
        }

        const url = new URL(req.url, 'http://localhost');
        const relativePath = url.pathname.replace(/^\/api\//, '');
        const resolvedPath = path.normalize(path.join(apiDir, relativePath));
        if (!resolvedPath.startsWith(apiDir)) {
          res.statusCode = 400;
          res.end('Ruta de API inválida');
          return;
        }

        try {
          const mod = await server.ssrLoadModule(`${resolvedPath}.ts`);
          const handler = mod.default;
          if (typeof handler !== 'function') {
            next();
            return;
          }

          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(url, {
            method: req.method,
            headers: req.headers as HeadersInit,
            body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream) : undefined,
            duplex: hasBody ? 'half' : undefined,
          } as RequestInit);

          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          next(err instanceof Error ? err : new Error(String(err)));
        }
      };

      server.middlewares.use(middleware);
    },
  };
}

/**
 * Réplica local del gate de `middleware.ts` (spec 018) para `npm run dev`.
 * Vite no ejecuta el Edge Middleware de Vercel, así que sin esto el gate no
 * se puede verificar en local. Solo se activa si `AUTH_SECRET` está definido
 * — sin esa variable, `npm run dev` sigue funcionando sin barrera (para no
 * estorbar a quien trabaja en otras specs), igual que en producción es
 * fail-closed pero en local es opt-in.
 */
function authDevPlugin(): Plugin {
  return {
    name: 'vlc-monitor-auth-dev',
    configureServer(server: ViteDevServer) {
      const authModule = path.join(apiDir, '_shared/auth.ts');
      const loginModule = path.join(apiDir, '_shared/pagina-login.ts');

      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        const secret = process.env.AUTH_SECRET;
        if (!secret) {
          next();
          return;
        }

        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        const esRutaApp = pathname === '/' || pathname === '/index.html';
        const esApiProtegida = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/');
        if (!esRutaApp && !esApiProtegida) {
          next();
          return;
        }

        try {
          const { verificarSesion, leerCookie, COOKIE_NOMBRE } = await server.ssrLoadModule(authModule);
          const token = leerCookie(req.headers.cookie, COOKIE_NOMBRE);
          const sesion = await verificarSesion(token, secret);
          if (sesion) {
            next();
            return;
          }
          if (esApiProtegida) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'no autenticado' }));
            return;
          }
          const { paginaLogin } = await server.ssrLoadModule(loginModule);
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          res.end(paginaLogin());
        } catch (err) {
          next(err instanceof Error ? err : new Error(String(err)));
        }
      };

      server.middlewares.use(middleware);
    },
  };
}

/**
 * PWA — spec 028. Manifest + service worker (Workbox vía generateSW).
 * `registerType: 'prompt'`: nunca recarga sola, muestra un aviso (src/pwa.ts).
 * `devOptions.enabled: false`: en `npm run dev` no se registra ningún SW.
 */
function pwaPlugin(): Plugin[] {
  return VitePWA({
    registerType: 'prompt',
    includeAssets: ['icons/apple-touch-icon.png', 'assets/policia-local-valencia-logo.png'],
    manifest: {
      name: 'Intelligent City Monitor',
      short_name: 'IC Monitor',
      description: 'Monitor de ciudad para mandos de Policía Local de València — uso interno.',
      lang: 'es',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: '#0b1f33',
      theme_color: '#0b1f33',
      categories: ['utilities', 'government'],
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // El shell (index.html) NO se precachea: la navegación va por NetworkFirst
      // (abajo) para que el gate de acceso (spec 018) decida en cada carga si
      // sirve la app o la pantalla de login. El precache solo lleva los assets.
      globPatterns: ['**/*.{js,css,svg,woff2}'],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // Nunca cachear autenticación ni la pantalla de login.
          urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/auth/'),
          handler: 'NetworkOnly',
        },
        {
          // Navegación: red primero (recoge login/app según sesión y versiones
          // nuevas); si no hay red, sirve la última carga buena.
          urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'icm-shell',
            networkTimeoutSeconds: 3,
            expiration: { maxEntries: 2 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // Datos: pinta al instante desde caché y refresca en segundo plano.
          // Un 401 NO se cachea (statuses: [200]) y se propaga al frontend.
          urlPattern: ({ url }: { url: URL }) => /^\/api\/.+\/v1\//.test(url.pathname),
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'icm-datos',
            expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          // Tiles del mapa base.
          urlPattern: ({ url }: { url: URL }) => url.hostname.endsWith('openfreemap.org'),
          handler: 'CacheFirst',
          options: {
            cacheName: 'icm-tiles',
            expiration: { maxEntries: 300, maxAgeSeconds: 14 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    devOptions: { enabled: false },
  }) as Plugin[];
}

// Config mínima de arranque (fase F0), ampliada en la spec 000 con el plugin
// de API, en la spec 018 con el gate de acceso local y en la 028 con la PWA.
export default defineConfig(({ mode }) => {
  // En dev, propaga a process.env las variables de servidor definidas en .env,
  // para que tanto el gate local (authDevPlugin) como las funciones de api/
  // — que leen process.env directamente, igual que en Vercel — las vean.
  // Vite solo expone al cliente las VITE_*; estas nunca llegan al bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const clave of ['AUTH_SECRET', 'APP_USERS']) {
    if (env[clave] && !process.env[clave]) process.env[clave] = env[clave];
  }

  return {
    plugins: [authDevPlugin(), apiDevPlugin(), ...pwaPlugin()],
    server: {
      port: Number(process.env.DEV_PORT) || 3000,
    },
  };
});
