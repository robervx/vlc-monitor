import { describe, expect, it } from 'vitest';
import {
  construirPromptRecomendaciones,
  esTextoCondicional,
  contieneIdentificadorPersonal,
  filtrarRecomendacionesValidas,
  type RecomendacionActuacionModelo,
} from './sintesis-ia-v2';
import type { SenalCorrelacionada } from './correlacion-senales';

function senal(overrides: Partial<SenalCorrelacionada> = {}): SenalCorrelacionada {
  return {
    id: 's1',
    tipo: 'trafico',
    distritoCodigo: '01',
    calle: 'Calle Colón',
    lat: 39.47,
    lon: -0.376,
    descripcion: 'Tráfico congestionado en Calle Colón.',
    severidad: 'aviso',
    relacionadas: [],
    observedAt: '2026-09-17T12:00:00.000Z',
    fetchedAt: '2026-09-17T12:00:00.000Z',
    fuenteSpec: ['004'],
    ...overrides,
  };
}

describe('esTextoCondicional', () => {
  it('acepta fórmulas condicionales', () => {
    expect(esTextoCondicional('Podría valorarse una revisión del tráfico.')).toBe(true);
    expect(esTextoCondicional('Conviene monitorizar la zona.')).toBe(true);
    expect(esTextoCondicional('Cabría revisar los semáforos.')).toBe(true);
  });

  it('rechaza texto imperativo', () => {
    expect(esTextoCondicional('Hay que cortar la calle inmediatamente.')).toBe(false);
    expect(esTextoCondicional('Envíen una unidad ahora.')).toBe(false);
  });
});

describe('contieneIdentificadorPersonal', () => {
  it('detecta matrícula española y DNI-like', () => {
    expect(contieneIdentificadorPersonal('El vehículo 1234 BCD estaba implicado.')).toBe(true);
    expect(contieneIdentificadorPersonal('El titular con DNI 12345678Z fue informado.')).toBe(true);
  });

  it('no marca texto normal', () => {
    expect(contieneIdentificadorPersonal('Podría valorarse reforzar la zona de Extramurs.')).toBe(false);
  });
});

describe('construirPromptRecomendaciones', () => {
  it('agrupa por distrito y omite los que solo tienen señales informativas', () => {
    const senales = [
      senal({ id: 'a', distritoCodigo: '01', severidad: 'aviso' }),
      senal({ id: 'b', distritoCodigo: '02', severidad: 'informativo' }),
    ];
    const prompt = construirPromptRecomendaciones(senales);
    expect(prompt).toContain('Distrito 01');
    expect(prompt).not.toContain('Distrito 02');
  });

  it('devuelve instrucción de lista vacía si no hay señales relevantes', () => {
    const prompt = construirPromptRecomendaciones([senal({ severidad: 'informativo' })]);
    expect(prompt).toContain('recomendaciones": []');
  });

  it('excluye señales de tipo cámara y acota a las 8 más severas por distrito, resumiendo el resto', () => {
    const muchas = Array.from({ length: 12 }, (_, i) => senal({ id: `s${i}`, severidad: 'aviso' }));
    const camara = senal({ id: 'cam1', tipo: 'camara', severidad: 'informativo' });
    const prompt = construirPromptRecomendaciones([...muchas, camara]);
    expect(prompt).not.toContain('cam1');
    expect(prompt).toContain('+ 4 señal(es) más');
  });
});

describe('filtrarRecomendacionesValidas', () => {
  const senalesPorId = new Map<string, SenalCorrelacionada>([['a', senal({ id: 'a' })]]);

  function recomendacion(overrides: Partial<RecomendacionActuacionModelo> = {}): RecomendacionActuacionModelo {
    return {
      distritoCodigo: '01',
      zona: 'Ciutat Vella',
      situacionAsociada: ['a'],
      texto: 'Podría valorarse reforzar la zona.',
      tipoActuacionSugerida: 'refuerzo-preventivo',
      ...overrides,
    };
  }

  it('acepta una recomendación válida', () => {
    const validas = filtrarRecomendacionesValidas([recomendacion()], senalesPorId);
    expect(validas).toHaveLength(1);
  });

  it('descarta texto no condicional', () => {
    const validas = filtrarRecomendacionesValidas([recomendacion({ texto: 'Hay que cortar la calle.' })], senalesPorId);
    expect(validas).toHaveLength(0);
  });

  it('descarta si referencia un id de señal no existente (posible invención del modelo)', () => {
    const validas = filtrarRecomendacionesValidas([recomendacion({ situacionAsociada: ['inventado'] })], senalesPorId);
    expect(validas).toHaveLength(0);
  });

  it('descarta si contiene un identificador personal', () => {
    const validas = filtrarRecomendacionesValidas(
      [recomendacion({ texto: 'Podría valorarse identificar el vehículo 1234 BCD.' })],
      senalesPorId,
    );
    expect(validas).toHaveLength(0);
  });
});
