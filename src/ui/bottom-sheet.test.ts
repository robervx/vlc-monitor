import { describe, expect, it } from 'vitest';
import { ESTADOS_SHEET, estadoMasCercano, esEstadoSheet, siguienteEstado } from './bottom-sheet';

describe('estadoMasCercano', () => {
  it('mapea fracciones de altura al estado más próximo', () => {
    expect(estadoMasCercano(0)).toBe('oculto');
    expect(estadoMasCercano(0.05)).toBe('oculto');
    expect(estadoMasCercano(0.35)).toBe('medio');
    expect(estadoMasCercano(0.5)).toBe('medio');
    expect(estadoMasCercano(0.8)).toBe('expandido');
    expect(estadoMasCercano(1)).toBe('expandido');
  });
});

describe('siguienteEstado', () => {
  it('cicla oculto → medio → expandido → oculto', () => {
    expect(siguienteEstado('oculto')).toBe('medio');
    expect(siguienteEstado('medio')).toBe('expandido');
    expect(siguienteEstado('expandido')).toBe('oculto');
  });

  it('un ciclo completo vuelve al inicio', () => {
    let e = ESTADOS_SHEET[0]!;
    for (let i = 0; i < ESTADOS_SHEET.length; i++) e = siguienteEstado(e);
    expect(e).toBe(ESTADOS_SHEET[0]);
  });
});

describe('esEstadoSheet', () => {
  it('valida el valor persistido en localStorage', () => {
    expect(esEstadoSheet('medio')).toBe(true);
    expect(esEstadoSheet('expandido')).toBe(true);
    expect(esEstadoSheet(null)).toBe(false);
    expect(esEstadoSheet('grande')).toBe(false);
  });
});
