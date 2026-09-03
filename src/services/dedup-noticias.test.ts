import { describe, expect, it } from 'vitest';
import { deduplicarNoticias, esMismaNoticiaCrossIdioma } from './dedup-noticias';
import type { ItemMediatico } from './mediatico';

function item(over: Partial<ItemMediatico> = {}): ItemMediatico {
  return {
    id: over.url ?? 'https://example.com/' + Math.random(),
    titulo: 'Titular',
    resumen: null,
    url: 'https://example.com/' + Math.random(),
    fuente: 'Levante-EMV',
    fuenteTipo: 'google-news',
    imagenUrl: null,
    publicadoEn: '2026-09-03T10:00:00.000Z',
    fetchedAt: '2026-09-03T10:05:00.000Z',
    source: 'rss',
    distritosMencionados: [],
    ambitoCiudad: 'confirmado',
    categoria: 'general',
    motivoAmbito: 'test',
    ...over,
  };
}

// Par real observado el 2026-09-03 en el feed de Google News de Levante-EMV.
const TITULO_VA = 'Arqueologia dona el vistiplau a la climatització del Mercat Central a través del soterrani';
const TITULO_ES = 'Arqueología da el visto bueno a la climatización del Mercado Central';

describe('esMismaNoticiaCrossIdioma', () => {
  it('reconoce el par valenciano/castellano del mismo medio', () => {
    const a = item({ titulo: TITULO_VA, publicadoEn: '2026-09-03T09:00:00.000Z' });
    const b = item({ titulo: TITULO_ES, publicadoEn: '2026-09-03T11:30:00.000Z' });
    expect(esMismaNoticiaCrossIdioma(a, b)).toBe(true);
  });

  it('NO junta el par si viene de medios distintos', () => {
    const a = item({ titulo: TITULO_VA, fuente: 'Levante-EMV' });
    const b = item({ titulo: TITULO_ES, fuente: 'Las Provincias' });
    expect(esMismaNoticiaCrossIdioma(a, b)).toBe(false);
  });

  it('NO junta el par si están a más de 36 h', () => {
    const a = item({ titulo: TITULO_VA, publicadoEn: '2026-09-01T09:00:00.000Z' });
    const b = item({ titulo: TITULO_ES, publicadoEn: '2026-09-03T09:00:00.000Z' });
    expect(esMismaNoticiaCrossIdioma(a, b)).toBe(false);
  });

  it('NO junta dos noticias distintas del mismo medio', () => {
    const a = item({ titulo: 'El Bioparc celebra el nacimiento de un antílope' });
    const b = item({ titulo: 'La Malvarrosa contará con una nueva plaza ajardinada' });
    expect(esMismaNoticiaCrossIdioma(a, b)).toBe(false);
  });
});

describe('deduplicarNoticias', () => {
  it('colapsa el par VA/ES de Levante y deja una sola entrada', () => {
    const salida = deduplicarNoticias([
      item({ titulo: TITULO_ES, url: 'https://news.google.com/es' }),
      item({ titulo: TITULO_VA, url: 'https://news.google.com/va' }),
    ]);
    expect(salida).toHaveLength(1);
  });

  it('cuando hay par VA/ES se queda con la versión en castellano', () => {
    const va = 'Més de 340 estudiants de 55 països estudiaran a Berklee València';
    const es = 'Más de 340 estudiantes de 55 países estudiarán en Berklee València';
    // La VA llega primero (más reciente); la ES debe sustituirla.
    const salida = deduplicarNoticias([
      item({ titulo: va, url: 'https://n/va', publicadoEn: '2026-09-03T12:00:00.000Z' }),
      item({ titulo: es, url: 'https://n/es', publicadoEn: '2026-09-03T11:00:00.000Z' }),
    ]);
    expect(salida).toHaveLength(1);
    expect(salida[0]?.titulo).toBe(es);
  });

  it('descarta por URL repetida y por titular idéntico', () => {
    const salida = deduplicarNoticias([
      item({ titulo: 'A', url: 'https://x/1' }),
      item({ titulo: 'A', url: 'https://x/1' }), // misma URL
      item({ titulo: 'A', url: 'https://x/2' }), // mismo titular
      item({ titulo: 'B', url: 'https://x/3' }),
    ]);
    expect(salida.map((i) => i.titulo)).toEqual(['A', 'B']);
  });

  it('mantiene noticias distintas del mismo medio', () => {
    const salida = deduplicarNoticias([
      item({ titulo: 'El Bioparc celebra el nacimiento de un antílope', url: 'https://x/1' }),
      item({ titulo: 'La Malvarrosa contará con una nueva plaza ajardinada', url: 'https://x/2' }),
      item({ titulo: 'Detenido un hombre por un robo en el Mercat Central', url: 'https://x/3' }),
    ]);
    expect(salida).toHaveLength(3);
  });
});
