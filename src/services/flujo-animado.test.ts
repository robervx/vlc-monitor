import { describe, expect, it } from 'vitest';
import { construirInterpoladorRuta, puntosFlujoParaTramo } from './flujo-animado';
import { distanciaMetros } from './proximidad';

describe('construirInterpoladorRuta', () => {
  it('t=0 devuelve el primer punto, t=1 el último', () => {
    const coords: [number, number][] = [[-0.38, 39.47], [-0.37, 39.48]];
    const interpolar = construirInterpoladorRuta(coords);
    expect(interpolar(0)).toEqual(coords[0]);
    expect(interpolar(1)).toEqual(coords[1]);
  });

  it('t=0.5 en una línea recta de dos puntos cae en el punto medio geométrico', () => {
    const coords: [number, number][] = [[-0.38, 39.47], [-0.36, 39.47]];
    const interpolar = construirInterpoladorRuta(coords);
    const medio = interpolar(0.5);
    expect(medio[0]).toBeCloseTo(-0.37, 5);
    expect(medio[1]).toBeCloseTo(39.47, 5);
  });

  it('recorre correctamente una polilínea de varios segmentos (respeta distancia real, no solo índice)', () => {
    // Un segmento mucho más largo que el otro: el punto a t=0.5 debe caer
    // dentro del segmento largo, no a medio camino entre los 3 vértices.
    const coords: [number, number][] = [
      [-0.38, 39.47], // A
      [-0.3795, 39.47], // B, muy cerca de A
      [-0.30, 39.47], // C, mucho más lejos
    ];
    const [a, b, c] = coords as [[number, number], [number, number], [number, number]];
    const interpolar = construirInterpoladorRuta(coords);
    const total = distanciaMetros(a, b) + distanciaMetros(b, c);
    const mitad = interpolar(0.5);
    // El punto medio por distancia real debe estar bastante más allá de B
    // (que solo cubre una fracción pequeña de la distancia total).
    const distanciaHastaB = distanciaMetros(a, b);
    expect(distanciaHastaB / total).toBeLessThan(0.1);
    expect(mitad[0]).toBeGreaterThan(b[0]);
  });

  it('no revienta con un único punto (caso degenerado)', () => {
    const interpolar = construirInterpoladorRuta([[-0.38, 39.47]]);
    expect(interpolar(0.5)).toEqual([-0.38, 39.47]);
  });
});

describe('puntosFlujoParaTramo', () => {
  const coords: [number, number][] = [[-0.38, 39.47], [-0.37, 39.48]];
  const [p0, p1] = coords as [[number, number], [number, number]];

  it('unidireccional genera exactamente n puntos', () => {
    const puntos = puntosFlujoParaTramo(coords, 'unidireccional', { fase: 0.2, puntosPorSentido: 3 });
    expect(puntos).toHaveLength(3);
  });

  it('bidireccional genera el doble de puntos (ambos sentidos)', () => {
    const puntos = puntosFlujoParaTramo(coords, 'bidireccional', { fase: 0.2, puntosPorSentido: 3 });
    expect(puntos).toHaveLength(6);
  });

  it('la fase envuelve correctamente (fase 0.9 + avance no rompe el rango [0,1])', () => {
    const puntos = puntosFlujoParaTramo(coords, 'unidireccional', { fase: 0.9, puntosPorSentido: 3 });
    expect(puntos).toHaveLength(3);
    for (const p of puntos) {
      expect(p[0]).toBeGreaterThanOrEqual(Math.min(p0[0], p1[0]));
      expect(p[0]).toBeLessThanOrEqual(Math.max(p0[0], p1[0]));
    }
  });
});
