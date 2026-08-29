// Gate de acceso — ver specs/018-acceso-protegido-dominio.md §4.
//
// Vercel Edge Middleware (framework-agnóstico): se ejecuta en el edge antes de
// servir cualquier ruta que encaje con `config.matcher`. Sin cookie de sesión
// válida:
//   - petición de navegación (Accept: text/html) → sirve la pantalla de login
//     en la MISMA URL, status 200, sin redirect (no ensucia el historial).
//   - petición a /api/*  → 401 JSON.
//
// Se excluyen del matcher: los assets que necesita la propia pantalla de login
// (/assets/*), los assets PWA (spec 028) y /api/auth/* (login/logout/estado).

import { verificarSesion, leerCookie, COOKIE_NOMBRE } from './api/_shared/auth';
import { paginaLogin } from './api/_shared/pagina-login';

export const config = {
  // Se dejan pasar sin gate: los assets del build, los iconos y ficheros PWA
  // (manifest, service worker, runtime de Workbox) y los endpoints de auth.
  matcher: [
    '/((?!assets/|icons/|favicon|robots\\.txt|manifest\\.webmanifest|sw\\.js|workbox-|registerSW\\.js|api/auth/).*)',
  ],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const secret = process.env.AUTH_SECRET;
  const esApi = new URL(request.url).pathname.startsWith('/api/');

  // Fail-closed: sin AUTH_SECRET la herramienta no se sirve.
  if (!secret) {
    return respuestaNoAutenticado(esApi, 'Servicio no configurado: falta AUTH_SECRET.');
  }

  const token = leerCookie(request.headers.get('cookie'), COOKIE_NOMBRE);
  const sesion = await verificarSesion(token, secret);
  if (sesion) return undefined; // sesión válida → deja pasar

  return respuestaNoAutenticado(esApi);
}

function respuestaNoAutenticado(esApi: boolean, mensaje = 'no autenticado'): Response {
  if (esApi) {
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return new Response(paginaLogin(), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
