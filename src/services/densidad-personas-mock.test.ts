import { describe, expect, it } from 'vitest';
import { generarDensidadMock, generarHotspotsDensidadMock } from './densidad-personas-mock';

describe('generarDensidadMock', () => {
  it('devuelve los 19 distritos, todos marcados como sintéticos', () => {
    const resultado = generarDensidadMock('14:00');
    expect(resultado).toHaveLength(19);
    expect(resultado.every((d) => d.esSintetico === true)).toBe(true);
    expect(resultado.every((d) => d.intensidad >= 0 && d.intensidad <= 1)).toBe(true);
  });

  it('es determinista: misma hora produce el mismo resultado', () => {
    const a = generarDensidadMock('09:00');
    const b = generarDensidadMock('09:00');
    expect(a.map((d) => d.intensidad)).toEqual(b.map((d) => d.intensidad));
  });

  it('pondera por población: distrito 10 (más poblado) supera al 17 (menos poblado) a la misma hora', () => {
    const resultado = generarDensidadMock('12:00');
    const d10 = resultado.find((d) => d.distritoCodigo === '10');
    const d17 = resultado.find((d) => d.distritoCodigo === '17');
    expect(d10?.intensidad).toBeGreaterThan(d17?.intensidad ?? 1);
  });

  it('varía con la hora (patrón horario, no plano)', () => {
    const noche = generarDensidadMock('03:00');
    const tarde = generarDensidadMock('19:00');
    const totalNoche = noche.reduce((sum, d) => sum + d.intensidad, 0);
    const totalTarde = tarde.reduce((sum, d) => sum + d.intensidad, 0);
    expect(totalTarde).toBeGreaterThan(totalNoche);
  });

  it('rechaza una hora inválida', () => {
    expect(() => generarDensidadMock('25:00')).toThrow();
    expect(() => generarDensidadMock('no-es-una-hora')).toThrow();
  });
});

describe('generarHotspotsDensidadMock (v3)', () => {
  const hotspots = [
    { id: 'ajuntament', lat: 39.4699, lon: -0.3763 },
    { id: 'otro', lat: 39.48, lon: -0.38 },
  ];

  it('devuelve un punto por hotspot, con la misma posición y sintético', () => {
    const resultado = generarHotspotsDensidadMock('20:00', hotspots);
    expect(resultado).toHaveLength(2);
    expect(resultado[0]).toMatchObject({ lat: 39.4699, lon: -0.3763, esSintetico: true });
    expect(resultado.every((p) => p.intensidad >= 0 && p.intensidad <= 1)).toBe(true);
  });

  it('es determinista: mismo hotspot + hora produce la misma intensidad', () => {
    const a = generarHotspotsDensidadMock('20:00', hotspots);
    const b = generarHotspotsDensidadMock('20:00', hotspots);
    expect(a.map((p) => p.intensidad)).toEqual(b.map((p) => p.intensidad));
  });

  it('concentra más que la media de los distritos en horas de actividad', () => {
    const [punto] = generarHotspotsDensidadMock('20:00', [hotspots[0]!]);
    const distritos = generarDensidadMock('20:00');
    const mediaDistritos = distritos.reduce((s, d) => s + d.intensidad, 0) / distritos.length;
    expect(punto!.intensidad).toBeGreaterThan(mediaDistritos);
  });

  it('sin hotspots, devuelve un array vacío', () => {
    expect(generarHotspotsDensidadMock('12:00', [])).toEqual([]);
  });
});
