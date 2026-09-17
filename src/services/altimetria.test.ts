import { describe, expect, it } from 'vitest';
import { resumenAltimetriaPorDistrito, NODATA_IGN, type MuestraElevacion } from './altimetria';

describe('resumenAltimetriaPorDistrito', () => {
  const nombres = new Map([
    ['01', 'Ciutat Vella'],
    ['05', "L'Eixample"],
  ]);

  it('calcula min/max/media por distrito', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 10, distritoCodigo: '01' },
      { lat: 39.471, lon: -0.371, elevacionM: 14, distritoCodigo: '01' },
      { lat: 39.472, lon: -0.372, elevacionM: 12, distritoCodigo: '01' },
      { lat: 39.48, lon: -0.38, elevacionM: 25, distritoCodigo: '05' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    const ciutatVella = resumen.find((r) => r.distritoCodigo === '01')!;
    expect(ciutatVella).toMatchObject({ elevacionMinM: 10, elevacionMaxM: 14, muestras: 3 });
    expect(ciutatVella.elevacionMediaM).toBeCloseTo(12, 5);
  });

  it('descarta muestras NODATA del IGN (mar/sin cobertura)', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 10, distritoCodigo: '01' },
      { lat: 39.471, lon: -0.371, elevacionM: NODATA_IGN, distritoCodigo: '01' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    expect(resumen.find((r) => r.distritoCodigo === '01')!.muestras).toBe(1);
  });

  it('ordena de más alto a más bajo (media)', () => {
    const muestras: MuestraElevacion[] = [
      { lat: 39.47, lon: -0.37, elevacionM: 5, distritoCodigo: '01' },
      { lat: 39.48, lon: -0.38, elevacionM: 25, distritoCodigo: '05' },
    ];
    const resumen = resumenAltimetriaPorDistrito(muestras, nombres);
    expect(resumen.map((r) => r.distritoCodigo)).toEqual(['05', '01']);
  });
});
