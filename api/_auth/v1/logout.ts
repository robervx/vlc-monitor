// POST /api/auth/v1/logout — ver specs/018-acceso-protegido-dominio.md §3.
// Borra la cookie de sesión. Idempotente.
import { SET_COOKIE_BORRAR } from '../../_shared/auth';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  const status = req.method === 'POST' ? 200 : 405;
  return new Response(JSON.stringify({ ok: status === 200 }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(status === 200 ? { 'set-cookie': SET_COOKIE_BORRAR } : {}),
    },
  });
}
