import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './mediatico-tendencia';

const RSS_OK = `<rss><channel><item>
<title>Incendio forestal cerca de Valencia</title>
<link>https://example.com/1</link>
<description>Incendio controlado tras varias horas</description>
<pubDate>${new Date().toUTCString()}</pubDate>
</item></channel></rss>`;

const GDELT_OK = { articles: [] };

function respuestaPorUrl(url: string): unknown {
  if (url.includes('gdeltproject.org')) {
    return { ok: true, json: () => Promise.resolve(GDELT_OK) };
  }
  return { ok: true, text: () => Promise.resolve(RSS_OK) };
}

function request(ventana?: string): Request {
  const qs = ventana ? `?ventana=${ventana}` : '';
  return new Request(`http://localhost/api/mediatico/v1/tendencia${qs}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Orden importa: la caché del módulo empieza vacía — ver api/meteo/v1/actual.test.ts.
describe('GET /api/mediatico/v1/tendencia', () => {
  it('devuelve 502 si todas las fuentes fallan sin caché previa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const res = await handler(request());
    expect(res.status).toBe(502);
  });

  it('por defecto usa ventana "hora" y devuelve el término esperado', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(respuestaPorUrl(url))));

    const res = await handler(request());
    const body = (await res.json()) as { panel: { ventana: string; terminos: Array<{ termino: string }> }; fresh: boolean };

    expect(res.status).toBe(200);
    expect(body.panel.ventana).toBe('hora');
    expect(body.panel.terminos.map((t) => t.termino)).toContain('incendio');
  });

  it('acepta ?ventana=dia', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(respuestaPorUrl(url))));

    const res = await handler(request('dia'));
    const body = (await res.json()) as { panel: { ventana: string } };

    expect(body.panel.ventana).toBe('dia');
  });
});
