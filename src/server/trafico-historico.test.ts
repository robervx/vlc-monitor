import { describe, expect, it } from 'vitest';
import handler from './trafico-historico';

function req(query = ''): Request {
  return new Request(`https://vlc-monitor.example/api/trafico/v1/historico${query}`);
}

describe('GET /api/trafico/v1/historico', () => {
  it('devuelve la serie de ciudad por defecto (sin ?distrito), últimos 7 días', async () => {
    const res = await handler(req());
    const body = (await res.json()) as { historico: { distritoCodigo: string; puntos: unknown[]; source: string } };

    expect(res.status).toBe(200);
    expect(body.historico.distritoCodigo).toBe('ciudad');
    expect(body.historico.source).toBe('vlc-monitor-historico');
    expect(Array.isArray(body.historico.puntos)).toBe(true);
  });

  it('devuelve la serie de un distrito concreto cuando se pasa ?distrito=', async () => {
    const res = await handler(req('?distrito=01'));
    const body = (await res.json()) as { historico: { distritoCodigo: string } };

    expect(body.historico.distritoCodigo).toBe('01');
  });

  it('acota ?dias= a un mínimo válido, ignorando valores absurdos', async () => {
    const res = await handler(req('?dias=-5'));
    expect(res.status).toBe(200); // no revienta con un valor inválido, usa el valor por defecto
  });
});
