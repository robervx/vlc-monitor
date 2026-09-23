/**
 * Riesgo relativo de acumulación de agua por distrito — spec 046 §3. Cruza
 * densidad de imbornales (geoportal municipal, ArcGIS `OPENDATA`, capa 221 —
 * estático, verificado en vivo el 2026-09-17) con la lluvia por distrito ya
 * calculada por `044` (`meteo-zona.ts`, Open-Meteo).
 *
 * `indiceRelativo` combina dos términos **multiplicativos**, no una suma ni
 * una media ponderada (revisión de metodología con `asesor-ciencia-datos-vlc`,
 * 2026-09-23 — ver spec 046 §3):
 *
 * 1. `vulnerabilidadEstructuralPct` — percentil por **rango** (no min-max ni
 *    z-score) de la densidad de imbornales entre los 19 distritos, invertido
 *    (menos imbornales por km² = más vulnerable). Estático, se precalcula una
 *    sola vez en el seed. Rango en vez de min-max/z-score porque con n=19 un
 *    solo distrito atípico no debe deformar la escala de los otros 18.
 * 2. `factorLluvia` — 0 por debajo de `UMBRAL_LLUVIA_ACTIVACION_MM` (evita que
 *    una lectura residual del modelo interpolado de Open-Meteo, típica de
 *    Open-Meteo incluso sin lluvia real, dispare el índice), satura a 1 en
 *    `UMBRAL_LLUVIA_MM` (mismo umbral de "lluvia intensa" que ya usa el motor
 *    de insights, `insights.ts` — no se inventa un segundo criterio).
 *
 * El producto garantiza que sin lluvia activa el índice es 0 en los 19
 * distritos sin excepción, aunque la densidad de imbornales sea mala — no es
 * una probabilidad de inundación ni un cálculo físico de caudal, y no
 * sustituye avisos oficiales de Protección Civil (`CLAUDE.md` §4: ninguna
 * estimación se sirve sin decir qué es).
 */
import { UMBRAL_LLUVIA_MM } from './insights';

export interface PuntoImbornal {
  lon: number;
  lat: number;
}

export interface ImbornalesDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  imbornalesCount: number;
  areaKm2: number;
  densidadImbornalesPorKm2: number;
  /** Percentil por rango (0-100) de vulnerabilidad estructural, invertido (menos imbornales/km² = más vulnerable). Estático, precalculado en el seed. */
  vulnerabilidadPercentil: number;
}

export interface RiesgoEscorrentiaDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  imbornalesCount: number;
  areaKm2: number;
  densidadImbornalesPorKm2: number;
  lluviaUltimaHoraMm: number;
  /** Si es `false`, no hay lluvia activa registrada — `indiceRelativo` es 0 y la UI debe mostrar "sin lluvia registrada", no un número en reposo. */
  activo: boolean;
  indiceRelativo: number;
  advertencia: string;
  observedAt: string;
  fetchedAt: string;
  /** Siempre ambas — el indicador es por definición un cruce de las dos fuentes, no una u otra. */
  source: readonly ['geoportal-valencia-imbornales', '044'];
}

export const ADVERTENCIA_RIESGO_ESCORRENTIA =
  'Estimación relativa a partir de densidad de sumideros y lluvia registrada — no sustituye avisos oficiales de Protección Civil.';

/** Por debajo de esto, `current.precipitation` de Open-Meteo se trata como lectura residual del modelo, no lluvia real (recomendación `asesor-ciencia-datos-vlc`, 2026-09-23). */
export const UMBRAL_LLUVIA_ACTIVACION_MM = 0.2;

const RADIO_TIERRA_KM = 6371;

/** Área (km²) de un anillo [lon,lat] por proyección equirectangular + shoelace — suficiente a escala de distrito, sin añadir una dependencia GIS nueva (mismo criterio que `scripts/seed-distritos.mjs`). */
function areaAnilloKm2(ring: GeoJSON.Position[]): number {
  if (ring.length < 3) return 0;
  const latMediaRad = (ring.reduce((sum, p) => sum + p[1]!, 0) / ring.length) * (Math.PI / 180);
  const puntos = ring.map((p) => ({
    x: p[0]! * (Math.PI / 180) * Math.cos(latMediaRad) * RADIO_TIERRA_KM,
    y: p[1]! * (Math.PI / 180) * RADIO_TIERRA_KM,
  }));
  let area = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i]!;
    const b = puntos[i + 1]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

/** Área (km²) de un distrito (Polygon o MultiPolygon) — resta los huecos (islas interiores) de cada polígono. */
export function areaDistritoKm2(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const poligonos = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return poligonos.reduce((total, [outer, ...holes]) => {
    if (!outer) return total;
    const areaExterior = areaAnilloKm2(outer);
    const areaHuecos = holes.reduce((sum, hole) => sum + areaAnilloKm2(hole), 0);
    return total + (areaExterior - areaHuecos);
  }, 0);
}

/**
 * Percentil por rango (0-100) de `valor` dentro de `todos`, invertido (el
 * valor más bajo → 100, el más alto → 0) — empates promediados. Preferido
 * sobre min-max/z-score con n=19: solo depende del orden, así que un único
 * distrito atípico no deforma la escala de los otros 18 (recomendación
 * `asesor-ciencia-datos-vlc`, 2026-09-23).
 */
function percentilPorRangoInvertido(valor: number, todos: number[]): number {
  const n = todos.length;
  if (n <= 1) return 100;
  const menores = todos.filter((v) => v < valor).length;
  const iguales = todos.filter((v) => v === valor).length;
  const rangoMedioAsc = menores + (iguales - 1) / 2; // 0 = el más bajo
  return (100 * (n - 1 - rangoMedioAsc)) / (n - 1);
}

/** Agrupa puntos de imbornales ya resueltos por distrito y calcula densidad + vulnerabilidad estructural (percentil) por km². */
export function resumenImbornalesPorDistrito(
  puntosPorDistrito: Map<string, number>,
  areasPorDistrito: Map<string, number>,
  nombrePorCodigo: Map<string, string>,
): ImbornalesDistrito[] {
  const base = [...areasPorDistrito.entries()].map(([codigo, areaKm2]) => {
    const imbornalesCount = puntosPorDistrito.get(codigo) ?? 0;
    return {
      distritoCodigo: codigo,
      distritoNombre: nombrePorCodigo.get(codigo) ?? codigo,
      imbornalesCount,
      areaKm2,
      densidadImbornalesPorKm2: areaKm2 > 0 ? imbornalesCount / areaKm2 : 0,
    };
  });
  const densidades = base.map((d) => d.densidadImbornalesPorKm2);
  return base
    .map((d) => ({ ...d, vulnerabilidadPercentil: percentilPorRangoInvertido(d.densidadImbornalesPorKm2, densidades) }))
    .sort((a, b) => a.densidadImbornalesPorKm2 - b.densidadImbornalesPorKm2);
}

/** 0 por debajo de `UMBRAL_LLUVIA_ACTIVACION_MM`, satura a 1 en `UMBRAL_LLUVIA_MM` (mismo umbral de "lluvia intensa" del motor de insights). */
function factorLluvia(lluviaUltimaHoraMm: number): number {
  if (lluviaUltimaHoraMm < UMBRAL_LLUVIA_ACTIVACION_MM) return 0;
  const rango = UMBRAL_LLUVIA_MM - UMBRAL_LLUVIA_ACTIVACION_MM;
  return Math.min(1, (lluviaUltimaHoraMm - UMBRAL_LLUVIA_ACTIVACION_MM) / rango);
}

/** Combina la vulnerabilidad estática (seed) con la lluvia en vivo (spec 044) en el contrato final de la spec 046 §3. */
export function calcularRiesgoEscorrentia(
  imbornales: ImbornalesDistrito[],
  lluviaPorDistrito: Map<string, number>,
  fetchedAt: string,
  observedAt: string,
): RiesgoEscorrentiaDistrito[] {
  return imbornales.map((d) => {
    const lluviaUltimaHoraMm = lluviaPorDistrito.get(d.distritoCodigo) ?? 0;
    const activo = lluviaUltimaHoraMm >= UMBRAL_LLUVIA_ACTIVACION_MM;
    const indiceRelativo = Math.round(d.vulnerabilidadPercentil * factorLluvia(lluviaUltimaHoraMm));
    return {
      distritoCodigo: d.distritoCodigo,
      distritoNombre: d.distritoNombre,
      imbornalesCount: d.imbornalesCount,
      areaKm2: d.areaKm2,
      densidadImbornalesPorKm2: d.densidadImbornalesPorKm2,
      lluviaUltimaHoraMm,
      activo,
      indiceRelativo,
      advertencia: ADVERTENCIA_RIESGO_ESCORRENTIA,
      observedAt,
      fetchedAt,
      source: ['geoportal-valencia-imbornales', '044'] as const,
    };
  });
}
