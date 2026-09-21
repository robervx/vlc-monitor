import { describe, expect, it, vi } from 'vitest';
import { escribirHistoricoSenales, escribirHistoricoRecomendaciones } from './historico-senales';
import type { SenalCorrelacionada } from './correlacion-senales';
import type { RecomendacionActuacion } from './sintesis-ia-v2';

function senal(overrides: Partial<SenalCorrelacionada> = {}): SenalCorrelacionada {
  return {
    id: 'trafico:487',
    tipo: 'trafico',
    distritoCodigo: '03',
    calle: 'Calle Colón',
    lat: 39.47,
    lon: -0.376,
    descripcion: 'Tráfico cortado en Calle Colón.',
    severidad: 'urgente',
    relacionadas: [],
    observedAt: '2026-09-17T12:00:00.000Z',
    fetchedAt: '2026-09-17T12:00:00.000Z',
    fuenteSpec: ['004'],
    fuenteId: 'ajuntament-valencia-geoportal',
    ...overrides,
  };
}

/** Tagged-template mock: inspecciona el primer fragmento de la plantilla para decidir qué responder. */
function crearSqlFalso(comportamiento: {
  select?: () => unknown[];
  insertSenal?: () => unknown[];
  insertAsociacion?: () => unknown[];
  insertRecomendacion?: () => unknown[];
  insertRecomendacionSenal?: () => unknown[];
}) {
  const llamadas: string[] = [];
  const fn = vi.fn((strings: TemplateStringsArray) => {
    const texto = strings.join('?');
    llamadas.push(texto);
    if (texto.includes('select id, severidad, descripcion from senal')) return Promise.resolve(comportamiento.select?.() ?? []);
    if (texto.includes('insert into senal')) return Promise.resolve(comportamiento.insertSenal?.() ?? []);
    if (texto.includes('insert into asociacion')) return Promise.resolve(comportamiento.insertAsociacion?.() ?? []);
    if (texto.includes('insert into recomendacion (')) return Promise.resolve(comportamiento.insertRecomendacion?.() ?? []);
    if (texto.includes('insert into recomendacion_senal')) return Promise.resolve(comportamiento.insertRecomendacionSenal?.() ?? []);
    return Promise.resolve([]);
  });
  return { fn: fn as any, llamadas };
}

describe('escribirHistoricoSenales', () => {
  it('sin sql (sin DATABASE_URL), no hace nada y no lanza', async () => {
    const resultado = await escribirHistoricoSenales(null, [senal()]);
    expect(resultado).toEqual({ escritas: 0, idsPersistidos: new Map() });
  });

  it('ignora señales informativo — nunca las consulta ni las inserta', async () => {
    const { fn, llamadas } = crearSqlFalso({});
    const resultado = await escribirHistoricoSenales(fn, [senal({ severidad: 'informativo' })]);
    expect(resultado.escritas).toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it('inserta una señal nueva (sin fila previa) y devuelve su id real', async () => {
    const { fn } = crearSqlFalso({
      select: () => [],
      insertSenal: () => [{ id: 'uuid-nuevo' }],
    });
    const resultado = await escribirHistoricoSenales(fn, [senal()]);
    expect(resultado.escritas).toBe(1);
    expect(resultado.idsPersistidos.get('trafico:487')).toBe('uuid-nuevo');
  });

  it('no inserta si la última fila conocida tiene la misma severidad y descripción (escritura por cambio de estado)', async () => {
    const { fn, llamadas } = crearSqlFalso({
      select: () => [{ id: 'uuid-existente', severidad: 'urgente', descripcion: 'Tráfico cortado en Calle Colón.' }],
    });
    const resultado = await escribirHistoricoSenales(fn, [senal()]);
    expect(resultado.escritas).toBe(0);
    expect(resultado.idsPersistidos.get('trafico:487')).toBe('uuid-existente');
    expect(llamadas.some((l) => l.includes('insert into senal'))).toBe(false);
  });

  it('sí inserta si la severidad cambió respecto a la última fila conocida', async () => {
    const { fn } = crearSqlFalso({
      select: () => [{ id: 'uuid-existente', severidad: 'aviso', descripcion: 'Tráfico cortado en Calle Colón.' }],
      insertSenal: () => [{ id: 'uuid-nuevo' }],
    });
    const resultado = await escribirHistoricoSenales(fn, [senal({ severidad: 'urgente' })]);
    expect(resultado.escritas).toBe(1);
    expect(resultado.idsPersistidos.get('trafico:487')).toBe('uuid-nuevo');
  });

  it('escribe una asociación entre dos señales persistidas relacionadas entre sí', async () => {
    let llamadaSenal = 0;
    const { fn, llamadas } = crearSqlFalso({
      select: () => [],
      insertSenal: () => {
        llamadaSenal++;
        return [{ id: `uuid-${llamadaSenal}` }];
      },
    });
    const a = senal({ id: 'trafico:487', relacionadas: ['incidencia:1'] });
    const b = senal({ id: 'incidencia:1', tipo: 'incidencia', severidad: 'aviso', relacionadas: ['trafico:487'] });
    await escribirHistoricoSenales(fn, [a, b]);
    expect(llamadas.some((l) => l.includes('insert into asociacion'))).toBe(true);
  });

  it('no falla si una consulta lanza — degrada en silencio (con log)', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('Neon caído')));
    const resultado = await escribirHistoricoSenales(fn as any, [senal()]);
    expect(resultado.escritas).toBe(0);
  });
});

describe('escribirHistoricoRecomendaciones', () => {
  function recomendacion(overrides: Partial<RecomendacionActuacion> = {}): RecomendacionActuacion {
    return {
      id: 'recomendacion:03:0',
      distritoCodigo: '03',
      zona: 'Extramurs',
      situacionAsociada: ['trafico:487'],
      texto: 'Podría valorarse revisar la zona.',
      tipoActuacionSugerida: 'revision-tecnica',
      fuenteSpec: ['004'],
      advertencia: 'aviso',
      ...overrides,
    };
  }

  it('sin sql, no hace nada', async () => {
    await expect(escribirHistoricoRecomendaciones(null, [recomendacion()], 'gemini-3-flash-preview', new Map())).resolves.toBeUndefined();
  });

  it('omite una recomendación si ninguna de sus señales motivadoras se persistió', async () => {
    const { fn, llamadas } = crearSqlFalso({});
    await escribirHistoricoRecomendaciones(fn, [recomendacion()], 'gemini-3-flash-preview', new Map());
    expect(llamadas.some((l) => l.includes('insert into recomendacion ('))).toBe(false);
  });

  it('inserta la recomendación y su enlace a la señal cuando sí está persistida', async () => {
    const { fn, llamadas } = crearSqlFalso({
      insertRecomendacion: () => [{ id: 'uuid-recomendacion' }],
    });
    const idsPersistidos = new Map([['trafico:487', 'uuid-senal']]);
    await escribirHistoricoRecomendaciones(fn, [recomendacion()], 'gemini-3-flash-preview', idsPersistidos);
    expect(llamadas.some((l) => l.includes('insert into recomendacion ('))).toBe(true);
    expect(llamadas.some((l) => l.includes('insert into recomendacion_senal'))).toBe(true);
  });
});
