// GET /api/mock/v1/densidad-personas — endpoint definido en
// specs/003-capa-movimiento-personas-mock.md §4.
// Genera datos 100% sintéticos (ponderados por población oficial por
// distrito). Nunca debe conectarse a ninguna fuente externa real — ver el
// guardarraíl de la spec 003 §2 antes de tocar este fichero.
import { generarDensidadMock } from '../../../src/services/densidad-personas-mock';

export const config = { runtime: 'edge' };

function horaActualSimulada(): string {
  const horas = new Date().getUTCHours() + 2; // aproximación CEST, sin dependencias de tz
  return `${String(horas % 24).padStart(2, '0')}:00`;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const hora = url.searchParams.get('hora') ?? horaActualSimulada();

  try {
    const densidad = generarDensidadMock(hora);
    return new Response(JSON.stringify({ densidad }), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // Determinista por (distrito, hora) — cacheable, pero de corta duración
        // porque la UI cambia la hora simulada con frecuencia.
        'cache-control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
}
