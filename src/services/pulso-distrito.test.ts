import { describe, expect, it } from 'vitest';
import {
  calcularPulsoDistrito,
  categoriaPulso,
  componenteAire,
  componenteIncidencias,
  componenteMeteo,
  componenteTrafico,
} from './pulso-distrito';
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { TramoTrafico } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';

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

function incidencia(distrito: string, tipo: IncidenciaViaPublica['tipo']): IncidenciaViaPublica {
  return {
    id: Math.random().toString(),
    descripcion: 'test',
    tipo,
    calle: 'Calle test',
    afectacion: 'corte',
    lat: 39.47,
    lon: -0.38,
    distritoCodigo: distrito,
    vigenciaDesde: '2026-08-18T00:00:00.000Z',
    vigenciaHasta: '2026-12-31T00:00:00.000Z',
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

describe('componenteTrafico (media ponderada 0-1, sin amplificar)', () => {
  it('es 0 cuando todos los tramos son fluidos', () => {
    expect(componenteTrafico([tramo('01', 'fluido'), tramo('01', 'fluido')])).toBe(0);
  });

  it('es 1 cuando todos los tramos están cortados', () => {
    expect(componenteTrafico([tramo('01', 'cortado')])).toBe(1);
  });

  it('promedia estados mixtos y excluye sin-datos', () => {
    const tramos = [tramo('01', 'fluido'), tramo('01', 'cortado'), tramo('01', 'sin-datos')];
    expect(componenteTrafico(tramos)).toBeCloseTo(0.5, 5); // (0 + 1) / 2
  });

  it('es 0 (neutro) cuando no hay tramos con dato', () => {
    expect(componenteTrafico([])).toBe(0);
    expect(componenteTrafico([tramo('01', 'sin-datos')])).toBe(0);
  });
});

describe('componenteIncidencias (v3)', () => {
  it('es 0 sin incidencias', () => {
    expect(componenteIncidencias([])).toBe(0);
  });

  it('las incidencias pesan mucho más que las obras', () => {
    const soloObras = Array.from({ length: 10 }, () => incidencia('01', 'obras'));
    const conIncidencias = Array.from({ length: 10 }, () => incidencia('01', 'incidencias'));
    expect(componenteIncidencias(conIncidencias)).toBeGreaterThan(componenteIncidencias(soloObras) * 4);
  });

  it('satura a 1 con carga muy alta', () => {
    const muchas = Array.from({ length: 80 }, () => incidencia('01', 'incidencias'));
    expect(componenteIncidencias(muchas)).toBe(1);
  });

  it('un puñado de obras apenas suma', () => {
    const pocasObras = Array.from({ length: 5 }, () => incidencia('01', 'obras'));
    expect(componenteIncidencias(pocasObras)).toBeLessThan(0.05);
  });
});

describe('componenteAire (v3 — arranque más alto)', () => {
  it('aire limpio (AQI bajo) no aporta tensión', () => {
    expect(componenteAire(AIRE_BUENA)).toBe(0); // (10 - 15) / 65 < 0 -> clamp 0
  });

  it('"Moderada" (AQI 40) ya se nota', () => {
    expect(componenteAire({ ...AIRE_BUENA, indiceEuropeo: 40 })).toBeCloseTo(0.385, 2);
  });

  it('clamp a 1 con AQI muy alto', () => {
    expect(componenteAire({ ...AIRE_BUENA, indiceEuropeo: 150 })).toBe(1);
  });
});

describe('componenteMeteo (v3 — arranque a 28 °C, usa sensación)', () => {
  it('es 0 con tiempo neutro', () => {
    expect(componenteMeteo(METEO_NEUTRA)).toBe(0);
  });

  it('un día de calor (35 °C) ya aporta', () => {
    // (35 - 28) / 12 = 0.583
    expect(componenteMeteo({ ...METEO_NEUTRA, temperatura: 35, sensacionTermica: 35 })).toBeCloseTo(0.583, 2);
  });

  it('usa la sensación térmica si es mayor que la temperatura', () => {
    const conBochorno = { ...METEO_NEUTRA, temperatura: 30, sensacionTermica: 38 };
    expect(componenteMeteo(conBochorno)).toBeCloseTo((38 - 28) / 12, 5);
  });

  it('toma el máximo, no la media, de los factores adversos', () => {
    const extremo = { ...METEO_NEUTRA, temperatura: 42, sensacionTermica: 42, vientoRachas: 10 };
    expect(componenteMeteo(extremo)).toBe(1);
  });

  it('detecta viento fuerte (rachas 90 km/h) sin que el calor lo enmascare', () => {
    expect(componenteMeteo({ ...METEO_NEUTRA, vientoRachas: 90 })).toBe(1);
  });
});

describe('categoriaPulso (v3 — bandas 18/38/62)', () => {
  it('mapea las bandas', () => {
    expect(categoriaPulso(0)).toBe('Tranquilo');
    expect(categoriaPulso(17)).toBe('Tranquilo');
    expect(categoriaPulso(18)).toBe('Moderado');
    expect(categoriaPulso(37)).toBe('Moderado');
    expect(categoriaPulso(38)).toBe('Tenso');
    expect(categoriaPulso(61)).toBe('Tenso');
    expect(categoriaPulso(62)).toBe('Crítico');
  });
});

describe('calcularPulsoDistrito', () => {
  it('produce una entrada por distrito con tráfico e incidencias de su propio distrito', () => {
    const distritos = [
      { codigo: '01', nombre: 'Ciutat Vella' },
      { codigo: '02', nombre: "L'Eixample" },
    ];
    const tramos = [tramo('01', 'cortado'), tramo('02', 'fluido')];
    const incidencias = [incidencia('01', 'incidencias'), incidencia('01', 'incidencias')];

    const resultado = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, tramos, incidencias);

    expect(resultado).toHaveLength(2);
    const d01 = resultado.find((r) => r.distritoCodigo === '01')!;
    const d02 = resultado.find((r) => r.distritoCodigo === '02')!;
    expect(d01.componentes.trafico).toBe(1); // cortado -> media 1, ×2.5 -> clamp 1
    expect(d02.componentes.trafico).toBe(0);
    expect(d01.componentes.incidencias).toBeGreaterThan(0);
    expect(d02.componentes.incidencias).toBe(0);
    expect(d01.indice).toBeGreaterThan(d02.indice);
    expect(d01.componentes.aire).toBe(d02.componentes.aire); // componente de ciudad
    expect(d01.source).toBe('vlc-monitor-compuesto');
  });

  it('amplifica: un solo tramo congestionado entre 5 mueve el índice (con la v2 se enterraba)', () => {
    const distritos = [{ codigo: '01', nombre: 'Ciutat Vella' }];
    const tramos = [
      tramo('01', 'congestionado'),
      tramo('01', 'fluido'),
      tramo('01', 'fluido'),
      tramo('01', 'fluido'),
      tramo('01', 'fluido'),
    ];
    const r = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, tramos);
    // media = 0.6/5 = 0.12; ×2.5 = 0.3
    expect(r[0]!.componentes.trafico).toBeCloseTo(0.3, 5);
  });

  it('funciona sin incidencias (parámetro opcional, degradación)', () => {
    const distritos = [{ codigo: '01', nombre: 'Ciutat Vella' }];
    const resultado = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, [tramo('01', 'fluido')]);
    expect(resultado[0]?.componentes.incidencias).toBe(0);
  });

  it('usa la observación más antigua de las fuentes como observedAt', () => {
    const distritos = [{ codigo: '01', nombre: 'Ciutat Vella' }];
    const tramoAntiguo = { ...tramo('01', 'fluido'), observedAt: '2026-08-18T09:00:00.000Z' };
    const resultado = calcularPulsoDistrito(distritos, METEO_NEUTRA, AIRE_BUENA, [tramoAntiguo]);
    expect(resultado[0]?.observedAt).toBe('2026-08-18T09:00:00.000Z');
  });
});
