import { describe, expect, it } from 'vitest';
import {
  construirParametrosOpenMeteo,
  normalizarLluviaVientoPorDistrito,
  type DistritoConCentroide,
  type RespuestaOpenMeteoPunto,
} from './meteo-zona';

const distritos: DistritoConCentroide[] = [
  { codigo: '01', nombre: 'Ciutat Vella', centroide: [-0.3763, 39.4746] },
  { codigo: '05', nombre: "L'Eixample", centroide: [-0.365, 39.465] },
];

describe('construirParametrosOpenMeteo', () => {
  it('construye listas lat/lon separadas por comas en el mismo orden que los distritos', () => {
    expect(construirParametrosOpenMeteo(distritos)).toEqual({
      latitude: '39.4746,39.465',
      longitude: '-0.3763,-0.365',
    });
  });
});

describe('normalizarLluviaVientoPorDistrito', () => {
  it('empareja la respuesta (array en el mismo orden) con cada distrito', () => {
    const respuesta: RespuestaOpenMeteoPunto[] = [
      { latitude: 39.47, longitude: -0.38, current: { time: '2026-09-17T12:30', precipitation: 0.2, wind_speed_10m: 8.3, wind_gusts_10m: 18 } },
      { latitude: 39.46, longitude: -0.36, current: { time: '2026-09-17T12:30', precipitation: 0, wind_speed_10m: 6.7, wind_gusts_10m: 14.4 } },
    ];
    const resultado = normalizarLluviaVientoPorDistrito(distritos, respuesta);
    expect(resultado).toEqual([
      { distritoCodigo: '01', distritoNombre: 'Ciutat Vella', precipitacionMm: 0.2, vientoKmh: 8.3, rachaKmh: 18, fecha: '2026-09-17T12:30' },
      { distritoCodigo: '05', distritoNombre: "L'Eixample", precipitacionMm: 0, vientoKmh: 6.7, rachaKmh: 14.4, fecha: '2026-09-17T12:30' },
    ]);
  });

  it('ignora distritos sin respuesta correspondiente (estructura cambiada)', () => {
    const resultado = normalizarLluviaVientoPorDistrito(distritos, [
      { latitude: 39.47, longitude: -0.38, current: { time: 't', precipitation: 0, wind_speed_10m: 0, wind_gusts_10m: 0 } },
    ]);
    expect(resultado).toHaveLength(1);
  });
});
