/**
 * Interpolación de puntos a lo largo de la geometría de un tramo, para el
 * efecto visual de "flujo" del simulador de cortes (spec 022) — puntos que
 * se desplazan sobre la calle en su sentido real, sin necesitar `TripsLayer`
 * de `@deck.gl/geo-layers` (esa dependencia arrastra una cadena de
 * vulnerabilidades reales en parsers de texturas/3D-tiles que esta app no
 * usa para nada — ver historial de spec 022). Función pura de geometría,
 * reutiliza `distanciaMetros` de proximidad.ts.
 */
import { distanciaMetros, type Coordenada } from './proximidad';

/** t=0 → primer punto de `coords`, t=1 → último. Interpola linealmente por distancia real, no por índice de vértice. */
export function construirInterpoladorRuta(coords: Coordenada[]): (t: number) => Coordenada {
  if (coords.length < 2) {
    const unico = coords[0] ?? [0, 0];
    return () => unico;
  }

  const distanciasAcumuladas: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    distanciasAcumuladas.push(distanciasAcumuladas[i]! + distanciaMetros(coords[i]!, coords[i + 1]!));
  }
  const longitudTotal = distanciasAcumuladas[distanciasAcumuladas.length - 1]!;

  return (t: number): Coordenada => {
    if (longitudTotal === 0) return coords[0]!;
    const objetivo = Math.max(0, Math.min(1, t)) * longitudTotal;
    let i = 0;
    while (i < distanciasAcumuladas.length - 2 && distanciasAcumuladas[i + 1]! < objetivo) i++;
    const inicioSegmento = distanciasAcumuladas[i]!;
    const finSegmento = distanciasAcumuladas[i + 1]!;
    const tSegmento = finSegmento > inicioSegmento ? (objetivo - inicioSegmento) / (finSegmento - inicioSegmento) : 0;
    const [x1, y1] = coords[i]!;
    const [x2, y2] = coords[Math.min(i + 1, coords.length - 1)]!;
    return [x1 + (x2 - x1) * tSegmento, y1 + (y2 - y1) * tSegmento];
  };
}

export interface OpcionesPuntosFlujo {
  /** Fase del ciclo, 0-1 (normalmente derivada del tiempo transcurrido). */
  fase: number;
  /** Cuántos puntos por sentido de recorrido. */
  puntosPorSentido?: number;
}

/**
 * Genera los puntos a pintar en un instante dado para un tramo. Si es
 * bidireccional, genera puntos en ambos sentidos (uno usa `1 - t` para ir
 * en la dirección contraria) — así se ve visualmente que el tráfico podría
 * circular en los dos sentidos, a diferencia de una unidireccional.
 */
export function puntosFlujoParaTramo(
  coords: Coordenada[],
  sentido: 'unidireccional' | 'bidireccional',
  opciones: OpcionesPuntosFlujo,
): Coordenada[] {
  const interpolador = construirInterpoladorRuta(coords);
  const n = opciones.puntosPorSentido ?? 3;
  const puntos: Coordenada[] = [];
  for (let i = 0; i < n; i++) {
    const t = (opciones.fase + i / n) % 1;
    puntos.push(interpolador(t));
    if (sentido === 'bidireccional') {
      puntos.push(interpolador(1 - t));
    }
  }
  return puntos;
}
