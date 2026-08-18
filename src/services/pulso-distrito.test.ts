import { describe, expect, it } from 'vitest';
import {
  calcularPulsoDistrito,
  categoriaPulso,
  componenteAire,
  componenteMeteo,
  componenteTrafico,
} from './pulso-distrito';
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { TramoTrafico } from './trafico';

function tramo(distrito: string, estado: TramoTrafico['estado']): TramoTrafico {
  return {
    id: '1',
    nombre: 'test',
    geometry: { type: 'LineString', coordinates: [[0, 0]] },
    estadoCodigo: 0,
    estado,
    esPasoInferior: false,
    distrito,
    observedAt: '2026-08-18T10:00:00.000Z',
    fetchedAt: '2026-08-18T10:00:00.000Z',
    source: 'ajuntament-valencia-geoportal',
  };
}

const METEO_NEUTRA: EstadoMeteo = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  temperatura: 22,
  sensacionTermica: 22,
  humedad: 50,
  precipitacion: 0,
  weatherCode: 0,
  descripcion: 'Cielo despejado',
  vientoVelocidad: 10,
  vientoDireccion: 90,
  vientoRachas: 15,
  presion: 1015,
  uvIndex: 3,
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:00:00.000Z',
  source: 'open-meteo',
};

const AIRE_BUENA: CalidadAire = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  pm10: 10,
  pm25: 5,
  monoxidoCarbono: 100,
  dioxidoNitrogeno: 5,
  dioxidoAzufre: 1,
  ozono: 50,
  indiceEuropeo: 10,
  indiceUS: 20,
  categoria: 'Buena',
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:00:00.000Z',
  source: 'open-meteo',
};

describe('componenteTrafico', () => {
  it('es 0 cuando todos los tramos son fluidos', () => {
    expect(componenteTrafico([tramo('01', 'fluido'), tramo('01', 'fluido')])).toBe(0);
  });

  it('es 1 cuando todos los tramos están cortados', () => {
    expect(componenteTrafico([tramo('01', 'cortado')])).toBe(1);
  });

  it('promedia estados mixtos y excluye sin-datos', () => {
    const tramos = [tramo('01', 'fluido'), tramo('01', 'cortado'), tramo('01', 'sin-datos')];
    expect(componenteTrafico(tramos)).toBeCloseTo(0.5, 5); // (0 + 1) / 2, sin-datos excluido
  });

  it('es 0 (neutro) cuando no hay tramos', () => {
    expect(componenteTrafico([])).toBe(0);
  });
});

describe('componenteAire', () => {
  it('normaliza el European AQI a 0-1', () => {
    expect(componenteAire(AIRE_BUENA)).toBeCloseTo(0.1, 5);
    expect(componenteAire({ ...AIRE_BUENA, indiceEuropeo: 150 })).toBe(1); // clamp
  });
});

describe('componenteMeteo', () => {
  it('es 0 con tiempo neutro', () => {
    expect(componenteMeteo(METEO_NEUTRA)).toBe(0);
  });

  it('detecta calor extremo', () => {
    expect(componenteMeteo({ ...METEO_NEUTRA, temperatura: 42 })).toBe(1);
    expect(componenteMeteo({ ...METEO_NEUTRA, temperatura: 38.5 })).toBeCloseTo(0.5, 1);
  });

  it('detecta viento extremo sin que el calor lo enmascare', () => {
    expect(componenteMeteo({ ...METEO_NEUTRA, vientoRachas: 90 })).toBe(1);
  });

  it('toma el máximo, no la media, de los factores adversos', () => {
    const extremo = { ...METEO_NEUTRA, temperatura: 42, vientoRachas: 10 };
    expect(componenteMeteo(extremo)).toBe(1); // no se diluye por el viento normal
  });
});

describe('categoriaPulso', () => {
  it('mapea las bandas', () => {
    expect(categoriaPulso(0)).toBe('Tranquilo');
    expect(categoriaPulso(30)).toBe('Moderado');
    expect(categoriaPulso(60)).toBe('Tenso');
    expect(categoriaPulso(90)).toBe('Crítico');
  });
});

describe('calcularPulsoDistrito', () => {
  it('produce una entrada por distrito con el tráfico de su propio distrito', () => {
    const distritos = [
      { codigo: '01', nombre: 'Ciutat Vella' },
      { codigo: '02', nombre: "L'Eixample" },
    ];
    const tramos = [tramo('01', 'cortado'), tramo('02', 'fluido')];

    const resultado = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, tramos);

    expect(resultado).toHaveLength(2);
    const d01 = resultado.find((r) => r.distritoCodigo === '01')!;
    const d02 = resultado.find((r) => r.distritoCodigo === '02')!;
    expect(d01.componentes.trafico).toBe(1);
    expect(d02.componentes.trafico).toBe(0);
    expect(d01.indice).toBeGreaterThan(d02.indice); // mismo aire/meteo, distinto tráfico
    expect(d01.componentes.aire).toBe(d02.componentes.aire); // componente de ciudad, igual en ambos
    expect(d01.source).toBe('vlc-monitor-compuesto');
  });

  it('usa la observación más antigua de las tres fuentes como observedAt', () => {
    const distritos = [{ codigo: '01', nombre: 'Ciutat Vella' }];
    const tramoAntiguo = { ...tramo('01', 'fluido'), observedAt: '2026-08-18T09:00:00.000Z' };
    const resultado = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, [tramoAntiguo]);
    expect(resultado[0]?.observedAt).toBe('2026-08-18T09:00:00.000Z');
  });
});
