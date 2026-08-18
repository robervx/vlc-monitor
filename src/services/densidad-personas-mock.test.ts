import { describe, expect, it } from 'vitest';
import { generarDensidadMock } from './densidad-personas-mock';

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
