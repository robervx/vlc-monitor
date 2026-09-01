/**
 * Marcadores del sentido de circulación de un tramo del grafo viario (spec
 * 020). Función pura de geometría: sin red, sin DOM. Nace como apoyo de
 * verificación de la spec 020 v4 (capa de depuración `?debug=grafo` en
 * main.ts) y queda disponible para que specs 021/022 pinten el sentido en
 * sus modos (paso 3 de la revisión del gemelo digital).
 *
 * Convención de ángulo: grados desde el ESTE, sentido antihorario positivo —
 * es lo que espera `getAngle` de `TextLayer`/`IconLayer` de deck.gl para un
 * glifo que "mira" a la derecha (▶). Con el mapa orientado al norte, esto
 * coincide con la orientación en pantalla.
 */
import type { Coordenada } from './proximidad';
import type { Tramo } from './red-viaria';

export interface MarcadorSentido {
  idTramo: string;
  posicion: Coordenada;
  anguloGrados: number;
  sentido: Tramo['sentido'];
}

/** Ángulo del vector a→b medido desde el este, antihorario, en grados. */
export function anguloDesdeEste(a: Coordenada, b: Coordenada): number {
  const latMedia = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(latMedia);
  const dy = b[1] - a[1];
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Punto a la fracción `t` (0-1) del recorrido del tramo por longitud real, y
 * el ángulo del sub-segmento que lo contiene — orientado en el sentido
 * canónico origen→destino de la geometría (que en el grafo v4 ya es el
 * sentido real de circulación, ver spec 020 §3).
 */
export function marcadorParaTramo(tramo: Tramo, t = 0.55): MarcadorSentido | null {
  const coords = tramo.geometria.coordinates as Coordenada[];
  if (coords.length < 2) return null;

  const acum: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i]!;
    const [x2, y2] = coords[i + 1]!;
    const latMedia = ((y1 + y2) / 2) * (Math.PI / 180);
    const d = Math.hypot((x2 - x1) * Math.cos(latMedia), y2 - y1);
    acum.push(acum[i]! + d);
  }
  const total = acum[acum.length - 1]!;
  if (total === 0) return null;

  const objetivo = Math.max(0, Math.min(1, t)) * total;
  let i = 0;
  while (i < acum.length - 2 && acum[i + 1]! < objetivo) i++;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const fseg = acum[i + 1]! > acum[i]! ? (objetivo - acum[i]!) / (acum[i + 1]! - acum[i]!) : 0;

  return {
    idTramo: tramo.idTramo,
    posicion: [a[0] + (b[0] - a[0]) * fseg, a[1] + (b[1] - a[1]) * fseg],
    anguloGrados: anguloDesdeEste(a, b),
    sentido: tramo.sentido,
  };
}

export function marcadoresSentido(tramos: Tramo[], t = 0.55): MarcadorSentido[] {
  const out: MarcadorSentido[] = [];
  for (const tramo of tramos) {
    const m = marcadorParaTramo(tramo, t);
    if (m) out.push(m);
  }
  return out;
}
