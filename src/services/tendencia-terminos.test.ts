import { describe, expect, it } from 'vitest';
import { calcularTendenciaTerminos } from './tendencia-terminos';
import type { ItemMediatico } from './mediatico';
import type { DistritoMencion } from './geolocalizacion-texto';

const AHORA = new Date('2026-08-26T18:00:00.000Z');

function mencion(distritoCodigo: string): DistritoMencion {
  return { distritoCodigo, distritoNombre: 'Ejemplo', coincidencia: 'distrito', textoCoincidente: 'Ejemplo', bajaConfianza: false };
}

function item(overrides: Partial<ItemMediatico> = {}): ItemMediatico {
  return {
    id: 'id-' + Math.random(),
    titulo: 'Titular de prueba',
    resumen: null,
    url: 'https://example.com',
    fuente: 'Las Provincias',
    imagenUrl: null,
    publicadoEn: AHORA.toISOString(),
    fetchedAt: AHORA.toISOString(),
    source: 'rss',
    distritosMencionados: [],
    ...overrides,
  };
}

describe('calcularTendenciaTerminos', () => {
  it('cuenta cada término una sola vez por ítem aunque se repita en el texto', () => {
    const items = [item({ titulo: 'Tráfico denso en Valencia, tráfico complicado hoy' })];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    const trafico = panel.terminos.find((t) => t.termino === 'trafico');
    expect(trafico?.frecuencia).toBe(1);
  });

  it('descarta stopwords y palabras de menos de 4 caracteres', () => {
    const items = [item({ titulo: 'El PP y el PSOE van a la sede el lunes' })];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    expect(panel.terminos.map((t) => t.termino)).not.toContain('van'); // 3 letras
    expect(panel.terminos.map((t) => t.termino)).toContain('sede'); // 4 letras, no es stopword -> sí debe aparecer
  });

  it('descarta términos estructurales del dominio (valencia, ayuntamiento)', () => {
    const items = [item({ titulo: 'El Ayuntamiento de Valencia anuncia obras en la ciudad' })];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    const terminos = panel.terminos.map((t) => t.termino);
    expect(terminos).not.toContain('valencia');
    expect(terminos).not.toContain('ayuntamiento');
    expect(terminos).toContain('anuncia');
  });

  it('incluye ítems justo en el borde inferior de la ventana y excluye los anteriores', () => {
    const items = [
      item({ id: 'borde', titulo: 'Justo en el borde municipal', publicadoEn: new Date(AHORA.getTime() - 60 * 60 * 1000).toISOString() }),
      item({ id: 'fuera', titulo: 'Justo fuera del corte semanal', publicadoEn: new Date(AHORA.getTime() - 60 * 60 * 1000 - 1).toISOString() }),
    ];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    expect(panel.totalItems).toBe(1);
    expect(panel.terminos.map((t) => t.termino)).toContain('borde');
    expect(panel.terminos.map((t) => t.termino)).not.toContain('fuera');
  });

  it('la ventana "dia" cubre 24h y descarta lo que quede fuera', () => {
    const items = [
      item({ id: 'dentro', titulo: 'Evento dentro del rango horario', publicadoEn: new Date(AHORA.getTime() - 20 * 60 * 60 * 1000).toISOString() }),
      item({ id: 'fuera', titulo: 'Suceso fuera del rango temporal', publicadoEn: new Date(AHORA.getTime() - 25 * 60 * 60 * 1000).toISOString() }),
    ];
    const panel = calcularTendenciaTerminos(items, 'dia', AHORA);
    expect(panel.totalItems).toBe(1);
  });

  it('ordena por frecuencia descendente y limita a 20 términos', () => {
    const items = [
      item({ titulo: 'Incendio forestal cerca de la sierra' }),
      item({ titulo: 'Incendio controlado tras seis horas' }),
      item({ titulo: 'Concierto benéfico este sábado' }),
    ];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    expect(panel.terminos[0]?.termino).toBe('incendio');
    expect(panel.terminos[0]?.frecuencia).toBe(2);
    expect(panel.terminos.length).toBeLessThanOrEqual(20);
  });

  it('agrega los distritos mencionados por los ítems que contienen el término', () => {
    const items = [
      item({ titulo: 'Obras en Benimaclet esta semana', distritosMencionados: [mencion('14')] }),
      item({ titulo: 'Más obras previstas en Patraix', distritosMencionados: [mencion('08')] }),
    ];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    const obras = panel.terminos.find((t) => t.termino === 'obras');
    expect(obras?.distritosAsociados.sort()).toEqual(['08', '14']);
  });

  it('conserva la forma original (con mayúsculas/acentos) de la primera aparición', () => {
    const items = [item({ titulo: 'Tráfico complicado y después Trafico denso' })];
    const panel = calcularTendenciaTerminos(items, 'hora', AHORA);
    expect(panel.terminos.find((t) => t.termino === 'trafico')?.formaOriginal).toBe('Tráfico');
  });

  it('devuelve totalItems 0 y terminos [] sin ítems en la ventana', () => {
    const panel = calcularTendenciaTerminos([], 'hora', AHORA);
    expect(panel.totalItems).toBe(0);
    expect(panel.terminos).toEqual([]);
  });
});
