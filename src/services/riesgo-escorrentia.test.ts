import { describe, expect, it } from 'vitest';
import {
  areaDistritoKm2,
  resumenImbornalesPorDistrito,
  calcularRiesgoEscorrentia,
  UMBRAL_LLUVIA_ACTIVACION_MM,
  type ImbornalesDistrito,
} from './riesgo-escorrentia';
import { UMBRAL_LLUVIA_MM } from './insights';

describe('areaDistritoKm2', () => {
  it('calcula el área aproximada de un cuadrado ~1km de lado', () => {
    // ~0.009 grados de lat/lon en Valencia (39.47N) equivalen a ~1 km en cada eje.
    const cuadrado: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-0.375, 39.47],
          [-0.366, 39.47],
          [-0.366, 39.479],
          [-0.375, 39.479],
          [-0.375, 39.47],
        ],
      ],
    };
    expect(areaDistritoKm2(cuadrado)).toBeCloseTo(1, 0);
  });

  it('resta los huecos (islas interiores) de un polígono', () => {
    const conHueco: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0.02, 0],
          [0.02, 0.02],
          [0, 0.02],
          [0, 0],
        ],
        [
          [0.005, 0.005],
          [0.015, 0.005],
          [0.015, 0.015],
          [0.005, 0.015],
          [0.005, 0.005],
        ],
      ],
    };
    const sinHueco: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [conHueco.coordinates[0]!],
    };
    expect(areaDistritoKm2(conHueco)).toBeLessThan(areaDistritoKm2(sinHueco));
  });

  it('suma las partes de un MultiPolygon', () => {
    const parte: GeoJSON.Position[] = [
      [0, 0],
      [0.01, 0],
      [0.01, 0.01],
      [0, 0.01],
      [0, 0],
    ];
    const multi: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [parte],
        [parte.map((p) => [p[0]! + 1, p[1]! + 1] as GeoJSON.Position)],
      ],
    };
    const single: GeoJSON.Polygon = { type: 'Polygon', coordinates: [parte] };
    expect(areaDistritoKm2(multi)).toBeCloseTo(areaDistritoKm2(single) * 2, 3);
  });
});

describe('resumenImbornalesPorDistrito', () => {
  it('calcula densidad = conteo / área y ordena de menor a mayor densidad', () => {
    const puntos = new Map([
      ['01', 10],
      ['02', 40],
    ]);
    const areas = new Map([
      ['01', 2],
      ['02', 2],
    ]);
    const nombres = new Map([
      ['01', 'Ciutat Vella'],
      ['02', 'Eixample'],
    ]);
    const resumen = resumenImbornalesPorDistrito(puntos, areas, nombres);
    expect(resumen.map((r) => r.distritoCodigo)).toEqual(['01', '02']);
    expect(resumen[0]).toMatchObject({ densidadImbornalesPorKm2: 5, distritoNombre: 'Ciutat Vella' });
    expect(resumen[1]).toMatchObject({ densidadImbornalesPorKm2: 20 });
  });

  it('distrito sin imbornales conocidos entra con conteo 0, no se omite', () => {
    const resumen = resumenImbornalesPorDistrito(
      new Map(),
      new Map([['09', 3]]),
      new Map([['09', 'Jesús']]),
    );
    expect(resumen).toEqual([
      {
        distritoCodigo: '09',
        distritoNombre: 'Jesús',
        imbornalesCount: 0,
        areaKm2: 3,
        densidadImbornalesPorKm2: 0,
        vulnerabilidadPercentil: 100,
      },
    ]);
  });

  it('vulnerabilidadPercentil: el distrito menos denso saca 100, el más denso 0', () => {
    const puntos = new Map([
      ['01', 10], // menos denso -> más vulnerable
      ['02', 20],
      ['03', 30], // más denso -> menos vulnerable
    ]);
    const areas = new Map([
      ['01', 1],
      ['02', 1],
      ['03', 1],
    ]);
    const nombres = new Map([
      ['01', 'A'],
      ['02', 'B'],
      ['03', 'C'],
    ]);
    const resumen = resumenImbornalesPorDistrito(puntos, areas, nombres);
    expect(resumen.find((r) => r.distritoCodigo === '01')!.vulnerabilidadPercentil).toBe(100);
    expect(resumen.find((r) => r.distritoCodigo === '02')!.vulnerabilidadPercentil).toBe(50);
    expect(resumen.find((r) => r.distritoCodigo === '03')!.vulnerabilidadPercentil).toBe(0);
  });

  it('un distrito atípico no deforma la escala de los otros (percentil por rango, no min-max)', () => {
    // 18 distritos con densidades muy parecidas (10-27) + 1 outlier extremo (500).
    const entries = Array.from({ length: 18 }, (_, i) => [String(i + 1).padStart(2, '0'), 10 + i] as const);
    entries.push(['19', 500]);
    const puntos = new Map(entries);
    const areas = new Map(entries.map(([codigo]) => [codigo, 1]));
    const nombres = new Map(entries.map(([codigo]) => [codigo, codigo]));
    const resumen = resumenImbornalesPorDistrito(puntos, areas, nombres);
    // El segundo menos denso (densidad 11) debería seguir cerca de 100, no comprimido por el outlier.
    const segundoMenosDenso = resumen.find((r) => r.densidadImbornalesPorKm2 === 11)!;
    expect(segundoMenosDenso.vulnerabilidadPercentil).toBeGreaterThan(90);
  });
});

describe('calcularRiesgoEscorrentia', () => {
  const imbornales: ImbornalesDistrito[] = [
    { distritoCodigo: '01', distritoNombre: 'Muy vulnerable', imbornalesCount: 1, areaKm2: 1, densidadImbornalesPorKm2: 1, vulnerabilidadPercentil: 100 },
    { distritoCodigo: '02', distritoNombre: 'Poco vulnerable', imbornalesCount: 100, areaKm2: 1, densidadImbornalesPorKm2: 100, vulnerabilidadPercentil: 0 },
  ];

  it('sin lluvia activa (< umbral), el índice es 0 en todos los distritos aunque la vulnerabilidad sea alta', () => {
    const lluvia = new Map([
      ['01', 0],
      ['02', 0],
    ]);
    const resultado = calcularRiesgoEscorrentia(imbornales, lluvia, '2026-09-23T10:00:00Z', '2026-09-23T10:00:00Z');
    expect(resultado.every((r) => r.indiceRelativo === 0 && r.activo === false)).toBe(true);
  });

  it('lectura residual del modelo (justo por debajo del umbral de activación) no activa el índice', () => {
    const lluvia = new Map([['01', UMBRAL_LLUVIA_ACTIVACION_MM - 0.01]]);
    const resultado = calcularRiesgoEscorrentia([imbornales[0]!], lluvia, 'x', 'x');
    expect(resultado[0]!.activo).toBe(false);
    expect(resultado[0]!.indiceRelativo).toBe(0);
  });

  it('con lluvia intensa (>= UMBRAL_LLUVIA_MM), el índice satura al 100% de la vulnerabilidad estructural', () => {
    const lluvia = new Map([
      ['01', UMBRAL_LLUVIA_MM],
      ['02', UMBRAL_LLUVIA_MM * 2], // por encima del umbral, sigue saturado en 1 (no se dispara más allá)
    ]);
    const resultado = calcularRiesgoEscorrentia(imbornales, lluvia, 'x', 'x');
    expect(resultado.find((r) => r.distritoCodigo === '01')!.indiceRelativo).toBe(100);
    expect(resultado.find((r) => r.distritoCodigo === '02')!.indiceRelativo).toBe(0); // vulnerabilidad 0 * cualquier factor = 0
  });

  it('con lluvia moderada entre el umbral de activación y el de intensidad, el índice escala proporcionalmente', () => {
    const puntoMedio = (UMBRAL_LLUVIA_ACTIVACION_MM + UMBRAL_LLUVIA_MM) / 2;
    const lluvia = new Map([['01', puntoMedio]]);
    const resultado = calcularRiesgoEscorrentia([imbornales[0]!], lluvia, 'x', 'x');
    expect(resultado[0]!.activo).toBe(true);
    expect(resultado[0]!.indiceRelativo).toBeCloseTo(50, 0);
  });

  it('siempre reporta ambas fuentes y la advertencia fija', () => {
    const resultado = calcularRiesgoEscorrentia([imbornales[0]!], new Map([['01', 10]]), 'x', 'x');
    expect(resultado[0]!.source).toEqual(['geoportal-valencia-imbornales', '044']);
    expect(resultado[0]!.advertencia).toMatch(/no sustituye avisos oficiales/i);
  });

  it('redondea el índice a entero (evita falsa precisión con n=19)', () => {
    const resultado = calcularRiesgoEscorrentia(
      [{ ...imbornales[0]!, vulnerabilidadPercentil: 55.5 }],
      new Map([['01', UMBRAL_LLUVIA_MM]]),
      'x',
      'x',
    );
    expect(Number.isInteger(resultado[0]!.indiceRelativo)).toBe(true);
  });
});
