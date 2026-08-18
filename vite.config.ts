import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect, type Plugin, type ViteDevServer } from 'vite';

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

// Config mínima de arranque (fase F0), ampliada en la spec 000 con el plugin
// de arriba para poder verificar GET /api/geo/v1/distritos en local.
export default defineConfig({
  plugins: [apiDevPlugin()],
  server: {
    port: Number(process.env.DEV_PORT) || 3000,
  },
});
