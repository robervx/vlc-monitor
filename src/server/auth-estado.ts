// GET /api/auth/v1/estado — ver specs/018-acceso-protegido-dominio.md §3.
// { autenticado: boolean; usuario?: string }
// Excluido del matcher del middleware: siempre accesible, para que el
// frontend pinte "sesión de X · salir" sin quedar bloqueado.
import { verificarSesion, leerCookie, COOKIE_NOMBRE } from './_shared/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.AUTH_SECRET;
  const sesion = secret ? await verificarSesion(leerCookie(req.headers.get('cookie'), COOKIE_NOMBRE), secret) : null;
  return new Response(
    JSON.stringify(sesion ? { autenticado: true, usuario: sesion.u } : { autenticado: false }),
    { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
  );
}
