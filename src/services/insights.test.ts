import { describe, expect, it } from 'vitest';
import { calcularInsights } from './insights';
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { PulsoDistrito } from './pulso-distrito';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';

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
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const AIRE_BUENA: CalidadAire = {
  id: 'valencia',
  lat: 39.4699,
  lon: -0.3763,
  pm10: 15,
  pm25: 8,
  monoxidoCarbono: 200,
  dioxidoNitrogeno: 10,
  dioxidoAzufre: 2,
  ozono: 40,
  indiceEuropeo: 15,
  indiceUS: 20,
  categoria: 'Buena',
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const PREDICCION_SIN_LLUVIA: PrediccionCortoPlazo = {
  id: 'valencia',
  ventanaHoras: 2,
  predicciones: [
    {
      horaObjetivo: '2026-08-18T11:00:00.000Z',
      temperatura: 23,
      probabilidadPrecipitacion: 0,
      precipitacion: 0,
      weatherCode: 0,
      descripcion: 'Cielo despejado',
    },
  ],
  observedAt: '2026-08-18T11:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'open-meteo',
};

const DISTRITO_TRANQUILO: PulsoDistrito = {
  distritoCodigo: '01',
  distritoNombre: 'Ciutat Vella',
  indice: 10,
  categoria: 'Tranquilo',
  componentes: { trafico: 0, aire: 0.1, meteo: 0 },
  observedAt: '2026-08-18T10:00:00.000Z',
  fetchedAt: '2026-08-18T10:01:00.000Z',
  source: 'vlc-monitor-compuesto',
};

describe('calcularInsights', () => {
  it('no genera ningún insight cuando todo está dentro de los umbrales normales', () => {
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, [DISTRITO_TRANQUILO], PREDICCION_SIN_LLUVIA);
    expect(resultado.insights).toHaveLength(0);
    expect(resultado.source).toBe('vlc-monitor-insights');
  });

  it('genera calor-extremo cuando la temperatura alcanza el umbral (38°C)', () => {
    const resultado = calcularInsights(
      { ...METEO_NEUTRA, temperatura: 38, sensacionTermica: 39 },
      AIRE_BUENA,
      null,
      null,
    );
    expect(resultado.insights).toHaveLength(1);
    expect(resultado.insights[0]?.tipo).toBe('calor-extremo');
    expect(resultado.insights[0]?.severidad).toBe('urgente');
    expect(resultado.insights[0]?.protocoloSugerido.cuerpo).not.toMatch(/@/); // sin destinatarios/emails
  });

  it('no genera calor-extremo un grado por debajo del umbral', () => {
    const resultado = calcularInsights(
      { ...METEO_NEUTRA, temperatura: 37.9, sensacionTermica: 37.9 },
      AIRE_BUENA,
      null,
      null,
    );
    expect(resultado.insights.filter((i) => i.tipo === 'calor-extremo')).toHaveLength(0);
  });

  it('genera frio-extremo cuando la temperatura llega a 0°C', () => {
    const resultado = calcularInsights({ ...METEO_NEUTRA, temperatura: 0 }, AIRE_BUENA, null, null);
    expect(resultado.insights.map((i) => i.tipo)).toContain('frio-extremo');
    expect(resultado.insights.find((i) => i.tipo === 'frio-extremo')?.severidad).toBe('aviso');
  });

  it('genera aire-mala-calidad con severidad urgente si la categoría es Muy mala', () => {
    const resultado = calcularInsights(METEO_NEUTRA, { ...AIRE_BUENA, categoria: 'Muy mala', indiceEuropeo: 95 }, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'aire-mala-calidad');
    expect(insight?.severidad).toBe('urgente');
  });

  it('genera aire-mala-calidad con severidad aviso si la categoría es Mala', () => {
    const resultado = calcularInsights(METEO_NEUTRA, { ...AIRE_BUENA, categoria: 'Mala', indiceEuropeo: 65 }, null, null);
    const insight = resultado.insights.find((i) => i.tipo === 'aire-mala-calidad');
    expect(insight?.severidad).toBe('aviso');
  });

  it('genera lluvia-intensa-prevista por cada tramo con precipitación >= 5mm', () => {
    const prediccion: PrediccionCortoPlazo = {
      ...PREDICCION_SIN_LLUVIA,
      predicciones: [
        { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 6, horaObjetivo: '2026-08-18T11:00:00.000Z' },
        { ...PREDICCION_SIN_LLUVIA.predicciones[0]!, precipitacion: 1, horaObjetivo: '2026-08-18T12:00:00.000Z' },
      ],
    };
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, prediccion);
    const lluvia = resultado.insights.filter((i) => i.tipo === 'lluvia-intensa-prevista');
    expect(lluvia).toHaveLength(1);
    expect(lluvia[0]?.detectedAt).toBe('2026-08-18T11:00:00.000Z');
  });

  it('genera distrito-critico solo para distritos en categoría Crítico', () => {
    const distritos: PulsoDistrito[] = [
      DISTRITO_TRANQUILO,
      { ...DISTRITO_TRANQUILO, distritoCodigo: '05', distritoNombre: 'Extramurs', indice: 80, categoria: 'Crítico' },
    ];
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, distritos, null);
    expect(resultado.insights).toHaveLength(1);
    expect(resultado.insights[0]?.distritoCodigo).toBe('05');
    expect(resultado.insights[0]?.severidad).toBe('urgente');
  });

  it('no revienta si distritos o predicción no están disponibles (null)', () => {
    const resultado = calcularInsights(METEO_NEUTRA, AIRE_BUENA, null, null);
    expect(resultado.insights).toHaveLength(0);
  });
});
