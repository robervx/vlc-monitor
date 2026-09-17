/**
 * Correlación estructurada de señales — spec 047 §2-§3. Determinista, sin
 * IA: junta tráfico/incidencias/cámaras (con coordenadas) y clima/eventos
 * (por distrito) usando el mismo mecanismo de point-in-polygon que ya usan
 * `via-publica.ts`/`trafico.ts` (`distritoCodigo` ya resuelto en la fuente),
 * más un radio corto de proximidad para cámaras (`proximidad.ts`, spec 012).
 *
 * Deliberadamente NO lee la imagen del mapa para "ver" en qué calle hay
 * tráfico — ya tenemos ese dato como texto exacto (`TramoTrafico.nombre` +
 * geometría), y depender de un modelo de visión sobre un screenshot sería
 * peor: con pérdida, no determinista, y rompe la trazabilidad de
 * `fuenteSpec` (spec 047 §2).
 *
 * El modelo de IA (`sintesis-ia-v2.ts`) nunca decide qué está correlacionado
 * con qué — solo redacta recomendaciones a partir de lo que esta función ya
 * unió. Esto es el guardrail central de la spec (§7): sin esto, el modelo
 * podría inventar relaciones causales entre señales que no comparten ni
 * distrito ni proximidad real.
 */
import type { TramoTrafico, EstadoTramo } from './trafico';
import { puntoMedio } from './trafico';
import type { IncidenciaViaPublica } from './via-publica';
import type { LluviaVientoDistrito } from './meteo-zona';
import type { EventoAgenda } from './agenda-eventos';
import type { CamaraExternaDgt } from './camaras-dgt';
import { distanciaMetros, type Coordenada } from './proximidad';
import { UMBRAL_LLUVIA_MM, UMBRAL_VIENTO_AVISO_KMH, UMBRAL_VIENTO_URGENTE_KMH } from './insights';

export type TipoSenal = 'trafico' | 'incidencia' | 'clima' | 'evento' | 'camara';
export type Severidad = 'informativo' | 'aviso' | 'urgente';

export interface SenalCorrelacionada {
  id: string;
  tipo: TipoSenal;
  distritoCodigo: string | null;
  calle: string | null;
  lat: number | null;
  lon: number | null;
  descripcion: string;
  severidad: Severidad;
  /** ids de otras `SenalCorrelacionada` del mismo lote, unidas por distrito o proximidad — calculado aquí, nunca por el modelo. */
  relacionadas: string[];
  observedAt: string;
  fetchedAt: string;
  fuenteSpec: string[];
}

export interface EntradaCorrelacion {
  tramos: TramoTrafico[];
  incidencias: IncidenciaViaPublica[];
  climaDistritos: LluviaVientoDistrito[];
  eventos: EventoAgenda[];
  camaras: CamaraExternaDgt[];
}

const RADIO_CAMARA_METROS = 500;
const VENTANA_EVENTOS_HORAS = 48;

const ETIQUETA_INCIDENCIA: Record<IncidenciaViaPublica['tipo'], string> = {
  obras: 'Obra',
  incidencias: 'Incidencia',
  festejos: 'Festejo',
};

function severidadTrafico(estado: EstadoTramo): Severidad | null {
  if (estado === 'denso') return 'informativo';
  if (estado === 'congestionado') return 'aviso';
  if (estado === 'cortado') return 'urgente';
  return null; // fluido / sin-datos -> no genera señal, sería ruido
}

export function correlacionarTrafico(tramos: TramoTrafico[], fetchedAt: string): SenalCorrelacionada[] {
  const salida: SenalCorrelacionada[] = [];
  for (const t of tramos) {
    const severidad = severidadTrafico(t.estado);
    if (!severidad) continue;
    const [lon, lat] = puntoMedio(t.geometry);
    salida.push({
      id: `trafico:${t.id}`,
      tipo: 'trafico',
      distritoCodigo: t.distrito,
      calle: t.nombre,
      lat,
      lon,
      descripcion: `Tráfico ${t.estado} en ${t.nombre}${t.esPasoInferior ? ' (paso inferior)' : ''}.`,
      severidad,
      relacionadas: [],
      observedAt: t.observedAt,
      fetchedAt,
      fuenteSpec: ['004'],
    });
  }
  return salida;
}

/**
 * La fuente (spec 026, capa ArcGIS) puede traer el mismo `id_incidencia`
 * repetido en varias features (una obra larga partida en varios tramos de
 * calle) — verificado en vivo el 2026-09-17 (decenas de duplicados exactos
 * en un solo distrito). Se trata como un único hecho: una señal por id.
 */
function deduplicarPorId(incidencias: IncidenciaViaPublica[]): IncidenciaViaPublica[] {
  const vistos = new Map<string, IncidenciaViaPublica>();
  for (const i of incidencias) {
    if (!vistos.has(i.id)) vistos.set(i.id, i);
  }
  return [...vistos.values()];
}

/**
 * `i.tipo` (obras/incidencias/festejos) NO predice bien el impacto real —
 * verificado en vivo el 2026-09-17: de 498 incidencias activas, la inmensa
 * mayoría son ocupaciones rutinarias de acera/zona de estacionamiento (obras
 * administrativas menores) independientemente de su `tipo`, y solo una
 * fracción afecta de verdad a la calzada. Se prioriza el texto de
 * `afectacion` (el campo que sí distingue esto) sobre `tipo`.
 */
function severidadIncidencia(i: IncidenciaViaPublica): Severidad {
  const afectacion = i.afectacion.toUpperCase();
  if (/100\s*%\s*CALZADA/.test(afectacion)) return 'urgente';
  if (/CALZADA|CARRIL/.test(afectacion)) return 'aviso';
  return 'informativo';
}

export function correlacionarIncidencias(incidenciasCrudas: IncidenciaViaPublica[], fetchedAt: string): SenalCorrelacionada[] {
  const incidencias = deduplicarPorId(incidenciasCrudas);
  return incidencias.map((i) => ({
    id: `incidencia:${i.id}`,
    tipo: 'incidencia',
    distritoCodigo: i.distritoCodigo,
    calle: i.calle,
    lat: i.lat,
    lon: i.lon,
    descripcion: `${ETIQUETA_INCIDENCIA[i.tipo]} en ${i.calle}: ${i.descripcion} (${i.afectacion}).`,
    severidad: severidadIncidencia(i),
    relacionadas: [],
    observedAt: i.vigenciaDesde,
    fetchedAt,
    fuenteSpec: ['026'],
  }));
}

function severidadClima(d: LluviaVientoDistrito): Severidad | null {
  if (d.rachaKmh >= UMBRAL_VIENTO_URGENTE_KMH || d.precipitacionMm >= UMBRAL_LLUVIA_MM * 2) return 'urgente';
  if (d.rachaKmh >= UMBRAL_VIENTO_AVISO_KMH || d.precipitacionMm >= UMBRAL_LLUVIA_MM) return 'aviso';
  return null;
}

export function correlacionarClima(distritos: LluviaVientoDistrito[], fetchedAt: string): SenalCorrelacionada[] {
  const salida: SenalCorrelacionada[] = [];
  for (const d of distritos) {
    const severidad = severidadClima(d);
    if (!severidad) continue;
    salida.push({
      id: `clima:${d.distritoCodigo}`,
      tipo: 'clima',
      distritoCodigo: d.distritoCodigo,
      calle: null,
      lat: null,
      lon: null,
      descripcion: `${d.distritoNombre}: ${d.precipitacionMm} mm de precipitación, viento ${d.vientoKmh} km/h (rachas ${d.rachaKmh} km/h).`,
      severidad,
      relacionadas: [],
      observedAt: d.fecha,
      fetchedAt,
      fuenteSpec: ['044'],
    });
  }
  return salida;
}

/** Solo eventos con impacto real en vía pública (spec 027 v4) y menciones de distrito de confianza. */
export function correlacionarEventos(
  eventos: EventoAgenda[],
  ahora: Date,
  fetchedAt: string,
  ventanaHoras: number = VENTANA_EVENTOS_HORAS,
): SenalCorrelacionada[] {
  const limite = new Date(ahora.getTime() + ventanaHoras * 60 * 60 * 1000);
  const salida: SenalCorrelacionada[] = [];
  for (const e of eventos) {
    if (!e.impactoViaPublica) continue;
    const inicio = new Date(e.fechaInicio);
    const fin = new Date(e.fechaFin);
    if (!(fin >= ahora && inicio <= limite)) continue;
    for (const mencion of e.distritosMencionados) {
      if (mencion.bajaConfianza) continue;
      salida.push({
        id: `evento:${e.id}:${mencion.distritoCodigo}`,
        tipo: 'evento',
        distritoCodigo: mencion.distritoCodigo,
        calle: null,
        lat: null,
        lon: null,
        descripcion: `${e.titulo} (${mencion.distritoNombre}), ${e.fechaInicio.slice(0, 10)}–${e.fechaFin.slice(0, 10)}.`,
        severidad: 'informativo',
        relacionadas: [],
        observedAt: e.fechaInicio,
        fetchedAt,
        fuenteSpec: ['027'],
      });
    }
  }
  return salida;
}

/** Enlaza señales no-cámara que comparten distrito — el paso que hoy no hace `sintesis-ia.ts` v1. */
export function enlazarPorDistrito(senales: SenalCorrelacionada[]): SenalCorrelacionada[] {
  const porDistrito = new Map<string, SenalCorrelacionada[]>();
  for (const s of senales) {
    if (!s.distritoCodigo) continue;
    const lista = porDistrito.get(s.distritoCodigo) ?? [];
    lista.push(s);
    porDistrito.set(s.distritoCodigo, lista);
  }
  return senales.map((s) => {
    if (!s.distritoCodigo) return s;
    const relacionadas = (porDistrito.get(s.distritoCodigo) ?? []).filter((otra) => otra.id !== s.id).map((otra) => otra.id);
    return relacionadas.length ? { ...s, relacionadas } : s;
  });
}

/** Cámaras DGT como corroboración visual — solo se genera señal si hay algo cerca que corroborar (spec 047 §2). */
export function correlacionarCamaras(
  camaras: CamaraExternaDgt[],
  senalesConDistrito: SenalCorrelacionada[],
  fetchedAt: string,
): SenalCorrelacionada[] {
  const conCoordenadas = senalesConDistrito.filter((s) => s.lat !== null && s.lon !== null);
  const salida: SenalCorrelacionada[] = [];
  for (const c of camaras) {
    const punto: Coordenada = [c.lon, c.lat];
    const cercanas = conCoordenadas.filter((s) => distanciaMetros(punto, [s.lon!, s.lat!]) <= RADIO_CAMARA_METROS);
    if (cercanas.length === 0) continue;
    salida.push({
      id: `camara:${c.id}`,
      tipo: 'camara',
      distritoCodigo: cercanas[0]!.distritoCodigo,
      calle: c.carretera,
      lat: c.lat,
      lon: c.lon,
      descripcion: `Cámara DGT en ${c.carretera} (PK ${c.pk}, sentido ${c.sentido}), a menos de ${RADIO_CAMARA_METROS} m de ${cercanas.length} señal(es) activa(s).`,
      severidad: 'informativo',
      relacionadas: cercanas.map((s) => s.id),
      observedAt: fetchedAt,
      fetchedAt,
      fuenteSpec: ['043'],
    });
  }
  return salida;
}

export function correlacionarSenales(entrada: EntradaCorrelacion, ahora: Date = new Date()): SenalCorrelacionada[] {
  const fetchedAt = ahora.toISOString();
  const base = [
    ...correlacionarTrafico(entrada.tramos, fetchedAt),
    ...correlacionarIncidencias(entrada.incidencias, fetchedAt),
    ...correlacionarClima(entrada.climaDistritos, fetchedAt),
    ...correlacionarEventos(entrada.eventos, ahora, fetchedAt),
  ];
  const conDistrito = enlazarPorDistrito(base);
  const camaras = correlacionarCamaras(entrada.camaras, conDistrito, fetchedAt);
  return [...conDistrito, ...camaras];
}
