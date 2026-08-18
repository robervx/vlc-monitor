import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsearRss, fetchGdeltValencia } from './mediatico';

const RSS_EJEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Ejemplo</title>
<item>
<guid isPermalink="true">https://example.com/noticia-1</guid>
<title>Rescatan a dos senderistas en el Montgó</title>
<link>https://example.com/noticia-1</link>
<description>Los dos hombres presentaban síntomas de agotamiento</description>
<pubDate>Tue, 18 Aug 2026 19:31:06 +0200</pubDate>
<media:content url="https://example.com/foto.jpg" type="image/jpeg" medium="image"/>
</item>
<item>
<title><![CDATA[El Ayuntamiento concede licencia para 164 viviendas]]></title>
<link><![CDATA[https://example.com/noticia-2]]></link>
<description><![CDATA[Tras concluir las obras de urbanizaci&oacute;n]]></description>
<pubDate>Tue, 18 Aug 2026 12:15:08 +0200</pubDate>
</item>
</channel>
</rss>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parsearRss', () => {
  it('extrae los items con título, url, resumen, imagen y fecha ISO', () => {
    const items = parsearRss(RSS_EJEMPLO, 'Las Provincias', '2026-08-18T20:00:00.000Z');

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'https://example.com/noticia-1',
      titulo: 'Rescatan a dos senderistas en el Montgó',
      url: 'https://example.com/noticia-1',
      fuente: 'Las Provincias',
      imagenUrl: 'https://example.com/foto.jpg',
      source: 'rss',
    });
    expect(items[0]?.publicadoEn).toBe('2026-08-18T17:31:06.000Z');
  });

  it('decodifica entidades HTML del CDATA y deja imagenUrl null si no hay media:content', () => {
    const items = parsearRss(RSS_EJEMPLO, 'Valencia Plaza', '2026-08-18T20:00:00.000Z');
    expect(items[1]?.titulo).toBe('El Ayuntamiento concede licencia para 164 viviendas');
    expect(items[1]?.resumen).toBe('Tras concluir las obras de urbanización');
    expect(items[1]?.imagenUrl).toBeNull();
  });

  it('devuelve array vacío si no hay <item>', () => {
    expect(parsearRss('<rss><channel></channel></rss>', 'Las Provincias', '2026-08-18T20:00:00.000Z')).toEqual([]);
  });
});

describe('fetchGdeltValencia', () => {
  it('normaliza fechas y filtra artículos cuyo título no menciona Valencia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            articles: [
              {
                url: 'https://example.com/a',
                title: 'El Ayuntamiento de Valencia anuncia obras',
                seendate: '20260818T171500Z',
                socialimage: 'https://example.com/img.jpg',
                domain: 'example.com',
              },
              {
                url: 'https://example.com/b',
                title: 'Un jugador de tenis gana un torneo en Zaragoza',
                seendate: '20260818T171500Z',
                domain: 'example.com',
              },
            ],
          }),
      }),
    );

    const items = await fetchGdeltValencia();
    expect(items).toHaveLength(1);
    expect(items[0]?.titulo).toContain('Valencia');
    expect(items[0]?.publicadoEn).toBe('2026-08-18T17:15:00Z');
  });

  it('lanza si GDELT responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchGdeltValencia()).rejects.toThrow('429');
  });
});
