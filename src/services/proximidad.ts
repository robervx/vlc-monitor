/**
 * Cálculo de proximidad — spec 012. Funciones puras, sin red y sin DOM: la
 * posición del usuario se recibe como parámetro (el llamador la obtiene de
 * `navigator.geolocation`, nunca se persiste ni se envía a ningún endpoint,
 * ver spec 012 §2).
 */
import type { TramoTrafico } from './trafico';
import type { EstacionValenbisi } from './valenbisi';
import type { Aparcamiento } from './aparcamiento';

export type Coordenada = [lon: number, lat: number];

export interface ResultadoCercania<T> {
  item: T;
  distanciaMetros: number;
}

export interface ResultadoProximidad {
  trafico: ResultadoCercania<TramoTrafico>[];
  valenbisi: ResultadoCercania<EstacionValenbisi>[];
  aparcamiento: ResultadoCercania<Aparcamiento>[];
  posicion: Coordenada;
  calculadoEn: string;
}

const RADIO_TIERRA_M = 6_371_000;
const LIMITE_DEFECTO = 3;

/** Distancia entre dos puntos (fórmula de Haversine). */
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const rad = Math.PI / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const lat1r = lat1 * rad;
  const lat2r = lat2 * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Punto más cercano de un segmento [a,b] a p, vía proyección en plano
 * corregido por latitud — aproximación suficiente a escala de calle/ciudad
 * (evita añadir turf.js para esta única operación, ver spec 012 §3).
 * Exportada para spec 021 (distancia al extremo de un tramo, no solo a la línea).
 */
export function puntoMasCercanoEnSegmento(p: Coordenada, a: Coordenada, b: Coordenada): Coordenada {
  const cosLat = Math.cos((p[1] * Math.PI) / 180) || 1;
  const px = p[0] * cosLat;
  const py = p[1];
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return [(ax + t * dx) / cosLat, ay + t * dy];
}

/** Exportada para reutilizar en el índice espacial del grafo viario (spec 020). */
export function distanciaPuntoALinea(p: Coordenada, geometry: GeoJSON.LineString | GeoJSON.MultiLineString): number {
  const lineas = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let minimo = Infinity;
  for (const coords of lineas) {
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i] as Coordenada;
      const b = coords[i + 1] as Coordenada;
      const cercano = puntoMasCercanoEnSegmento(p, a, b);
      const d = distanciaMetros(p, cercano);
      if (d < minimo) minimo = d;
    }
  }
  return minimo;
}

function topN<T>(items: T[], distancia: (item: T) => number, limite: number): ResultadoCercania<T>[] {
  return items
    .map((item) => ({ item, distanciaMetros: distancia(item) }))
    .filter((r) => Number.isFinite(r.distanciaMetros))
    .sort((a, b) => a.distanciaMetros - b.distanciaMetros)
    .slice(0, limite);
}

export function calcularCercania(
  posicion: Coordenada,
  capas: {
    tramosTrafico: TramoTrafico[];
    estacionesValenbisi: EstacionValenbisi[];
    aparcamientos: Aparcamiento[];
  },
  limite: number = LIMITE_DEFECTO,
): ResultadoProximidad {
  return {
    trafico: topN(capas.tramosTrafico, (t) => distanciaPuntoALinea(posicion, t.geometry), limite),
    valenbisi: topN(capas.estacionesValenbisi, (e) => distanciaMetros(posicion, [e.lon, e.lat]), limite),
    aparcamiento: topN(capas.aparcamientos, (a) => distanciaMetros(posicion, [a.lon, a.lat]), limite),
    posicion,
    calculadoEn: new Date().toISOString(),
  };
}

/** Formatea metros como "N m" por debajo de 1km, "X.X km" a partir de ahí. */
export function formatoDistancia(metros: number): string {
  if (metros >= 1000) return `${(metros / 1000).toFixed(1)} km`;
  return `${Math.round(metros)} m`;
}
