/**
 * Cálculo del índice compuesto de la spec 010
 * (specs/010-indice-pulso-distrito.md §3, recalibrado en v3 §9). Función pura,
 * sin red — combina datos ya obtenidos de las specs 001 (meteo), 002 (aire),
 * 004 (tráfico) y 026 (incidencias de vía pública).
 *
 * Los pesos y umbrales de abajo son una heurística documentada, no un estándar
 * validado — cualquier ajuste cambia esta constante y la spec, no un número
 * mágico enterrado. El glosario (spec 037) los lee de aquí.
 */
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { TramoTrafico, EstadoTramo } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';

export type CategoriaPulso = 'Tranquilo' | 'Moderado' | 'Tenso' | 'Crítico';

/** Pesos de la fórmula del índice (suman 1). Spec 010 §3 v3. */
export const PESOS_PULSO = { trafico: 0.45, incidencias: 0.15, aire: 0.25, meteo: 0.15 } as const;

/**
 * Factor con el que la fórmula del Pulso amplifica la proporción de tramos
 * afectados — así unos pocos cortes entre cientos de tramos fluidos sí mueven el
 * índice, sin cambiar el significado de `componenteTrafico` para otros usos
 * (spec 017). Spec 010 §9 v3.
 */
const AMPLIFICACION_TRAFICO_PULSO = 2.5;

/** Umbral inferior de cada categoría — `indice < 18` = Tranquilo, etc. Spec 010 §3 v3. */
export const UMBRALES_CATEGORIA_PULSO = { Moderado: 18, Tenso: 38, Crítico: 62 } as const;

export interface PulsoDistrito {
  distritoCodigo: string;
  distritoNombre: string;
  indice: number;
  categoria: CategoriaPulso;
  componentes: {
    trafico: number;
    incidencias: number;
    aire: number;
    meteo: number;
  };
  observedAt: string;
  fetchedAt: string;
  source: 'vlc-monitor-compuesto';
}

interface DistritoBasico {
  codigo: string;
  nombre: string;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const PESO_TRAFICO_POR_ESTADO: Record<EstadoTramo, number> = {
  fluido: 0,
  denso: 0.3,
  congestionado: 0.6,
  cortado: 1,
  'sin-datos': 0,
};

/**
 * Media ponderada del estado de los tramos del distrito (0-1). Compartida con
 * la spec 017 (histórico), donde se usa como métrica de congestión sin
 * amplificar. El Pulso la amplifica con `AMPLIFICACION_TRAFICO_PULSO` — ver §9 v3.
 */
export function componenteTrafico(tramosDistrito: TramoTrafico[]): number {
  const conDato = tramosDistrito.filter((t) => t.estado !== 'sin-datos');
  if (conDato.length === 0) return 0;
  const suma = conDato.reduce((acc, t) => acc + PESO_TRAFICO_POR_ESTADO[t.estado], 0);
  return clamp01(suma / conDato.length);
}

/**
 * Carga de incidencias de vía pública del distrito. Las `obras` (permiso vigente,
 * a menudo semanas) pesan poco — no son "tensión ahora"; las `incidencias` y los
 * `festejos` pesan bastante más. Contributor moderado, no debe saturar. Spec 010 §9 v3.
 */
export function componenteIncidencias(incidenciasDistrito: IncidenciaViaPublica[]): number {
  const peso = incidenciasDistrito.reduce((acc, i) => {
    if (i.tipo === 'obras') return acc + 0.06;
    if (i.tipo === 'festejos') return acc + 0.3;
    return acc + 0.35; // incidencias
  }, 0);
  return clamp01(peso / 22);
}

export function componenteAire(aire: CalidadAire): number {
  return clamp01((aire.indiceEuropeo - 15) / 65);
}

/** El factor más adverso domina — no se promedian calor/frío/viento/lluvia. */
export function componenteMeteo(meteo: EstadoMeteo): number {
  const tCalor = Math.max(meteo.temperatura, meteo.sensacionTermica);
  const calor = clamp01((tCalor - 28) / 12);
  const frio = clamp01((6 - meteo.temperatura) / 8);
  const viento = clamp01((meteo.vientoRachas - 40) / 45);
  const lluvia = clamp01((meteo.precipitacion - 0.5) / 6);
  return Math.max(calor, frio, viento, lluvia);
}

export function categoriaPulso(indice: number): CategoriaPulso {
  if (indice < UMBRALES_CATEGORIA_PULSO.Moderado) return 'Tranquilo';
  if (indice < UMBRALES_CATEGORIA_PULSO.Tenso) return 'Moderado';
  if (indice < UMBRALES_CATEGORIA_PULSO.Crítico) return 'Tenso';
  return 'Crítico';
}

export function calcularPulsoDistrito(
  distritos: DistritoBasico[],
  meteo: EstadoMeteo,
  aire: CalidadAire,
  tramos: TramoTrafico[],
  incidencias: IncidenciaViaPublica[] = [],
): PulsoDistrito[] {
  const aireScore = componenteAire(aire);
  const meteoScore = componenteMeteo(meteo);
  const fetchedAt = new Date().toISOString();
  const observedAt = [meteo.observedAt, aire.observedAt, ...tramos.map((t) => t.observedAt)].sort()[0] ?? fetchedAt;

  const tramosPorDistrito = new Map<string, TramoTrafico[]>();
  for (const tramo of tramos) {
    if (!tramo.distrito) continue;
    const lista = tramosPorDistrito.get(tramo.distrito) ?? [];
    lista.push(tramo);
    tramosPorDistrito.set(tramo.distrito, lista);
  }

  const incidenciasPorDistrito = new Map<string, IncidenciaViaPublica[]>();
  for (const inc of incidencias) {
    if (!inc.distritoCodigo) continue;
    const lista = incidenciasPorDistrito.get(inc.distritoCodigo) ?? [];
    lista.push(inc);
    incidenciasPorDistrito.set(inc.distritoCodigo, lista);
  }

  return distritos.map((distrito) => {
    const traficoScore = clamp01(
      componenteTrafico(tramosPorDistrito.get(distrito.codigo) ?? []) * AMPLIFICACION_TRAFICO_PULSO,
    );
    const incidenciasScore = componenteIncidencias(incidenciasPorDistrito.get(distrito.codigo) ?? []);
    const indice = Math.round(
      100 *
        (PESOS_PULSO.trafico * traficoScore +
          PESOS_PULSO.incidencias * incidenciasScore +
          PESOS_PULSO.aire * aireScore +
          PESOS_PULSO.meteo * meteoScore),
    );

    return {
      distritoCodigo: distrito.codigo,
      distritoNombre: distrito.nombre,
      indice,
      categoria: categoriaPulso(indice),
      componentes: { trafico: traficoScore, incidencias: incidenciasScore, aire: aireScore, meteo: meteoScore },
      observedAt,
      fetchedAt,
      source: 'vlc-monitor-compuesto',
    };
  });
}
