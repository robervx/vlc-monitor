// Punto de entrada — mapa base + capa de distritos (spec 000) + capa mock de
// densidad de personas (spec 003). MapLibre GL (tiles) + deck.gl (overlay
// interleaved) — sin globo 3D, ver CLAUDE.md §5.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo, Color } from '@deck.gl/core';
import { preloadDistrictGeometry, getDistrictCentroid, getLoadedDistricts } from './services/district-geometry';
import type { DensidadDistritoMock } from './services/densidad-personas-mock';
import type { EstadoMeteo } from './services/estado-meteo';
import type { PrediccionCortoPlazo } from './services/prediccion-corto-plazo';
import type { PanelInsights } from './services/insights';
import { UMBRAL_VIENTO_AVISO_KMH, UMBRAL_VIENTO_URGENTE_KMH } from './services/insights';
import type { CalidadAire } from './services/calidad-aire';
import type { TramoTrafico, EstadoTramo } from './services/trafico';
import type { HistoricoTrafico } from './services/trafico-historico';
import { sparklinePath } from './services/trafico-historico';
import type { EstacionValenbisi } from './services/valenbisi';
import type { Aparcamiento } from './services/aparcamiento';
import type { PulsoDistrito, CategoriaPulso } from './services/pulso-distrito';
import type { DatosFallas, MonumentoFalla } from './services/fallas';
import type { ItemMediatico } from './services/mediatico';
import type { VentanaTendencia } from './services/tendencia-terminos';
import type { IncidenciaViaPublica, TipoIncidenciaViaPublica } from './services/via-publica';
import { mountChasis } from './ui/chasis';
import { applyPanelVisibility } from './ui/panel-preferences';
import { initPwa } from './pwa';
import { initDeteccionDispositivo } from './ui/deteccion-dispositivo';
import { initLayoutMovil } from './ui/layout-movil';
import {
  actualizarTramosTrafico,
  actualizarEstacionesValenbisi,
  actualizarAparcamientos,
} from './services/capas-activas-store';
import { onCambioModoCordon, reportarUbicacionElegida, getTramoPorId, getEstadoModoCordon } from './ui/modo-cordon';
import {
  onCambioModoSimulacion,
  toggleTramoCortado,
  getTramoPorIdSimulacion,
  getEstadoModoSimulacion,
} from './ui/modo-simulacion-cortes';
import { cargarGrafoViario } from './services/grafo-viario-cliente';
import { puntosFlujoParaTramo } from './services/flujo-animado';
import type { Coordenada } from './services/proximidad';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const VALENCIA_CENTER: [number, number] = [-0.3763, 39.4699];
const DEFAULT_ZOOM = 12;
// Duración del ciclo del efecto de flujo animado de la capa de tráfico real
// (spec 004) — cuánto tarda un punto en recorrer un tramo completo. Más
// lento que un efecto "urgente" a propósito (petición del usuario: "a un
// ritmo algo más lento para que no sature") — con ~400 tramos visibles a la
// vez, un ritmo rápido satura visualmente y consume más CPU sin necesidad.
const DURACION_CICLO_FLUJO_TRAFICO_MS = 4500;

interface DistritoProperties {
  codigo: string;
  nombre: string;
}

interface MapUrlState {
  center: [number, number];
  zoom: number;
  distrito: string | null;
}

function readStateFromUrl(): MapUrlState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const zoomParam = params.get('zoom');
  const distrito = params.get('distrito');

  let center = VALENCIA_CENTER;
  if (view) {
    const [lon, lat] = view.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) center = [lon as number, lat as number];
  }
  const zoom = Number.isFinite(Number(zoomParam)) && zoomParam ? Number(zoomParam) : DEFAULT_ZOOM;

  return { center, zoom, distrito: distrito ?? null };
}

function writeStateToUrl(state: MapUrlState): void {
  const params = new URLSearchParams();
  params.set('view', `${state.center[0].toFixed(5)},${state.center[1].toFixed(5)}`);
  params.set('zoom', state.zoom.toFixed(2));
  if (state.distrito) params.set('distrito', state.distrito);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
}

// Amarillo pálido -> rojo intenso, según intensidad 0-1 — ver spec 003 §5.
function colorIntensidad(intensidad: number): Color {
  const r = 255;
  const g = Math.round(220 - intensidad * 190);
  const b = Math.round(150 - intensidad * 150);
  const a = Math.round(40 + intensidad * 180);
  return [r, Math.max(0, g), Math.max(0, b), a];
}

// Icono por rango de código WMO — ver src/services/estado-meteo.ts para la
// tabla completa de descripciones.
function iconoWeatherCode(codigo: number): string {
  if (codigo === 0) return '☀️';
  if (codigo <= 2) return '🌤️';
  if (codigo === 3) return '☁️';
  if (codigo <= 48) return '🌫️';
  if (codigo <= 57) return '🌦️';
  if (codigo <= 67) return '🌧️';
  if (codigo <= 77) return '🌨️';
  if (codigo <= 82) return '🌧️';
  if (codigo <= 86) return '🌨️';
  return '⛈️';
}

// Escapado defensivo — títulos/URLs de spec 009 vienen de RSS/GDELT externos,
// nunca se insertan en el DOM sin pasar por aquí (riesgo de XSS si un feed
// llega corrupto o comprometido).
function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatoFrescura(fetchedAt: string): string {
  const minutos = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos === 1) return 'hace 1 min';
  return `hace ${minutos} min`;
}

function metaFrescura(fuente: string, fetchedAt: string, fresh: boolean): string {
  const aviso = fresh
    ? ''
    : '<span class="info-panel__stale" title="No se pudo refrescar, mostrando el último dato bueno">⚠ no actualizado</span>';
  return `${fuente} · actualizado ${formatoFrescura(fetchedAt)} ${aviso}`;
}

function buildInfoPanel(id: string): HTMLDivElement {
  let container = document.getElementById('info-panels') as HTMLDivElement | null;
  if (!container) {
    container = document.createElement('div');
    container.id = 'info-panels';
    document.body.appendChild(container);
  }
  const root = document.createElement('div');
  root.id = id;
  root.className = 'info-panel';
  root.textContent = 'Cargando…';
  container.appendChild(root);
  return root;
}

// Semáforo de viento — mismos umbrales que la regla 'viento-fuerte' de
// insights.ts (spec 013), para que el color de aquí y el aviso coincidan.
function colorSemaforoViento(rachas: number): string {
  if (rachas >= UMBRAL_VIENTO_URGENTE_KMH) return '#dc2626'; // rojo
  if (rachas >= UMBRAL_VIENTO_AVISO_KMH) return '#f59e0b'; // ámbar
  return '#16a34a'; // verde
}

function renderMeteoPanel(root: HTMLDivElement, estado: EstadoMeteo, fresh: boolean): void {
  root.innerHTML = `
    <div class="info-panel__main">
      <span class="info-panel__icon">${iconoWeatherCode(estado.weatherCode)}</span>
      <span class="info-panel__value">${Math.round(estado.temperatura)}°C</span>
    </div>
    <div class="info-panel__desc">${estado.descripcion}</div>
    <div class="info-panel__viento">
      <span class="info-panel__viento-dot" style="background:${colorSemaforoViento(estado.vientoRachas)}"></span>
      Viento ${Math.round(estado.vientoVelocidad)} km/h · rachas ${Math.round(estado.vientoRachas)} km/h
    </div>
    <div class="info-panel__meta">${metaFrescura('Open-Meteo', estado.fetchedAt, fresh)}</div>
  `;
}

async function fetchEstadoMeteoActual(): Promise<{ estado: EstadoMeteo; fresh: boolean }> {
  const res = await fetch('/api/meteo/v1/actual');
  if (!res.ok) throw new Error(`GET /api/meteo/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { estado: EstadoMeteo; fresh: boolean };
}

function formatoHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}

// Spec 016 — panel de "próximas horas" junto al de meteo actual.
function renderPrediccionPanel(root: HTMLDivElement, prediccion: PrediccionCortoPlazo, fresh: boolean): void {
  const tramos = prediccion.predicciones
    .map(
      (tramo) => `
        <div class="prediccion-panel__tramo">
          <div class="prediccion-panel__hora">${formatoHora(tramo.horaObjetivo)}</div>
          <div class="prediccion-panel__icon">${iconoWeatherCode(tramo.weatherCode)}</div>
          <div class="prediccion-panel__temp">${Math.round(tramo.temperatura)}°</div>
          <div class="prediccion-panel__lluvia">💧${Math.round(tramo.probabilidadPrecipitacion)}%</div>
        </div>`,
    )
    .join('');
  root.innerHTML = `
    <div class="info-panel__desc">Próximas ${prediccion.ventanaHoras}h</div>
    <div class="prediccion-panel__tramos">${tramos}</div>
    <div class="info-panel__meta">${metaFrescura('Open-Meteo', prediccion.fetchedAt, fresh)}</div>
  `;
}

async function fetchPrediccionCortoPlazoActual(): Promise<{ prediccion: PrediccionCortoPlazo; fresh: boolean }> {
  const res = await fetch('/api/meteo/v1/prediccion-corto-plazo');
  if (!res.ok) throw new Error(`GET /api/meteo/v1/prediccion-corto-plazo -> HTTP ${res.status}`);
  return (await res.json()) as { prediccion: PrediccionCortoPlazo; fresh: boolean };
}

// Spec 013 — "avisa, no actúa" (CLAUDE.md §4): cada tarjeta ofrece un
// borrador para copiar, nunca un envío automático ni una lista de
// destinatarios. Guardamos el último panel para que el listener de clic
// (delegado, ver más abajo) pueda leer el texto exacto a copiar.
let ultimoPanelInsights: PanelInsights | null = null;

function renderInsightsPanel(root: HTMLDivElement, panel: PanelInsights, fresh: boolean): void {
  ultimoPanelInsights = panel;

  if (panel.insights.length === 0) {
    root.innerHTML = `
      <div class="info-panel__desc">✓ Sin alertas activas</div>
      <div class="info-panel__meta">${metaFrescura('VLC Monitor (insights)', panel.fetchedAt, fresh)}</div>
    `;
    return;
  }

  const tarjetas = panel.insights
    .map((insight, i) => {
      const chips = insight.fuenteSpec
        .map((spec) => `<span class="insight-card__fuente-chip">${spec}</span>`)
        .join('');
      return `
        <div class="insight-card insight-card--${insight.severidad}">
          <div class="insight-card__titulo">${insight.titulo}</div>
          <div class="insight-card__desc">${insight.descripcion}</div>
          <div class="insight-card__fuentes">${chips}</div>
          <button class="insight-card__copiar" type="button" data-insight-index="${i}">Copiar borrador</button>
        </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">⚠ ${panel.insights.length} alerta${panel.insights.length === 1 ? '' : 's'}</div>
    <div class="insight-panel__tarjetas">${tarjetas}</div>
    <div class="info-panel__meta">${metaFrescura('VLC Monitor (insights)', panel.fetchedAt, fresh)}</div>
  `;
}

async function fetchInsightsActual(): Promise<{ panel: PanelInsights; fresh: boolean }> {
  const res = await fetch('/api/insights/v1/actual');
  if (!res.ok) throw new Error(`GET /api/insights/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { panel: PanelInsights; fresh: boolean };
}

// Colores por banda del European AQI — ver src/services/calidad-aire.ts.
function colorCategoriaAire(categoria: string): string {
  switch (categoria) {
    case 'Buena':
      return '#4caf50';
    case 'Aceptable':
      return '#8bc34a';
    case 'Moderada':
      return '#ffc107';
    case 'Mala':
      return '#ff9800';
    case 'Muy mala':
      return '#e53935';
    default:
      return '#7b1fa2';
  }
}

function renderAirePanel(root: HTMLDivElement, calidad: CalidadAire, fresh: boolean): void {
  root.innerHTML = `
    <div class="info-panel__main">
      <span class="info-panel__badge" style="background:${colorCategoriaAire(calidad.categoria)}">${calidad.indiceEuropeo}</span>
      <span class="info-panel__value info-panel__value--small">${calidad.categoria}</span>
    </div>
    <div class="info-panel__desc">PM2.5 ${calidad.pm25.toFixed(1)} · NO₂ ${calidad.dioxidoNitrogeno.toFixed(1)} µg/m³</div>
    <div class="info-panel__meta">${metaFrescura('Open-Meteo', calidad.fetchedAt, fresh)}</div>
  `;
}

async function fetchCalidadAireActual(): Promise<{ calidad: CalidadAire; fresh: boolean }> {
  const res = await fetch('/api/aire/v1/actual');
  if (!res.ok) throw new Error(`GET /api/aire/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as { calidad: CalidadAire; fresh: boolean };
}

function startPolling(refresh: () => Promise<void>, intervalMs: number): void {
  refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  setInterval(() => {
    refresh().catch((err: unknown) => console.error('Fallo al refrescar panel:', err));
  }, intervalMs);
}

const COLOR_ESTADO_TRAFICO: Record<EstadoTramo, Color> = {
  fluido: [76, 175, 80, 200],
  denso: [255, 193, 7, 200],
  congestionado: [255, 152, 0, 210],
  cortado: [211, 47, 47, 220],
  'sin-datos': [158, 158, 158, 130],
};

const ETIQUETA_ESTADO_TRAFICO: Record<EstadoTramo, string> = {
  fluido: 'Fluido',
  denso: 'Denso',
  congestionado: 'Congestionado',
  cortado: 'Cortado',
  'sin-datos': 'Sin datos',
};

function renderTraficoLeyenda(root: HTMLDivElement, tramos: TramoTrafico[], fresh: boolean): void {
  const conteos = new Map<EstadoTramo, number>();
  for (const t of tramos) conteos.set(t.estado, (conteos.get(t.estado) ?? 0) + 1);

  const filas = (Object.keys(ETIQUETA_ESTADO_TRAFICO) as EstadoTramo[])
    .map((estado) => {
      const [r, g, b] = COLOR_ESTADO_TRAFICO[estado];
      return `<div class="trafico-leyenda__row">
        <span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>
        ${ETIQUETA_ESTADO_TRAFICO[estado]} (${conteos.get(estado) ?? 0})
      </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">Tráfico en tiempo real</div>
    ${filas}
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', tramos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchEstadoTraficoActual(): Promise<{ tramos: TramoTrafico[]; fresh: boolean }> {
  const res = await fetch('/api/trafico/v1/estado');
  if (!res.ok) throw new Error(`GET /api/trafico/v1/estado -> HTTP ${res.status}`);
  return (await res.json()) as { tramos: TramoTrafico[]; fresh: boolean };
}

// Spec 017 — sparkline de congestión media de ciudad, últimas 24h. El
// histórico se acumula solo con el cron de GitHub Actions (ver
// .github/workflows/trafico-historico-cron.yml) — recién mergeado apenas
// tiene puntos, así que el "todavía no hay suficiente histórico" es un
// estado normal a corto plazo, no un error.
const SPARK_WIDTH = 140;
const SPARK_HEIGHT = 28;

function renderTraficoHistoricoPanel(root: HTMLDivElement, historico: HistoricoTrafico, fresh: boolean): void {
  if (historico.puntos.length < 2) {
    root.innerHTML = `
      <div class="info-panel__desc">Histórico de tráfico</div>
      <div class="info-panel__meta">Todavía no hay suficiente histórico (empieza a acumularse cada hora)</div>
    `;
    return;
  }

  const valores = historico.puntos.map((p) => p.congestion);
  const puntosSvg = sparklinePath(valores, SPARK_WIDTH, SPARK_HEIGHT);
  const ultimo = Math.round((valores[valores.length - 1] ?? 0) * 100);

  root.innerHTML = `
    <div class="info-panel__desc">Congestión de ciudad — últimas 24h</div>
    <svg class="trafico-historico__spark" viewBox="0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}" preserveAspectRatio="none">
      <polyline points="${puntosSvg}" fill="none" stroke="#b45309" stroke-width="2" />
    </svg>
    <div class="info-panel__value info-panel__value--small">${ultimo}% ahora</div>
    <div class="info-panel__meta">${metaFrescura('VLC Monitor (histórico)', historico.fetchedAt, fresh)}</div>
  `;
}

async function fetchTraficoHistoricoCiudad(): Promise<{ historico: HistoricoTrafico; fresh: boolean }> {
  const res = await fetch('/api/trafico/v1/historico?dias=1');
  if (!res.ok) throw new Error(`GET /api/trafico/v1/historico -> HTTP ${res.status}`);
  const body = (await res.json()) as { historico: HistoricoTrafico };
  return { historico: body.historico, fresh: true };
}

// Rojo (casi sin bicis) -> verde (bicis de sobra); gris si la estación está cerrada.
function colorEstacionValenbisi(estacion: EstacionValenbisi): Color {
  if (!estacion.abierta) return [158, 158, 158, 160];
  const ratio = estacion.capacidadTotal > 0 ? estacion.bicisDisponibles / estacion.capacidadTotal : 0;
  return [Math.round(220 - ratio * 180), Math.round(60 + ratio * 140), 60, 210];
}

function renderValenbisiLeyenda(root: HTMLDivElement, estaciones: EstacionValenbisi[], fresh: boolean): void {
  const totalBicis = estaciones.reduce((sum, e) => sum + e.bicisDisponibles, 0);
  const cerradas = estaciones.filter((e) => !e.abierta).length;
  root.innerHTML = `
    <div class="info-panel__desc">Valenbisi — ${estaciones.length} estaciones</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(40,200,60)"></span>${totalBicis} bicis disponibles</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(158,158,158)"></span>${cerradas} cerradas</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', estaciones[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchEstacionesValenbisiActual(): Promise<{ estaciones: EstacionValenbisi[]; fresh: boolean }> {
  const res = await fetch('/api/valenbisi/v1/estaciones');
  if (!res.ok) throw new Error(`GET /api/valenbisi/v1/estaciones -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: EstacionValenbisi[]; fresh: boolean };
}

// Verde (libre) -> rojo (casi lleno), según ocupacionPorcentaje 0-100; gris si
// el sensor no reporta (sinDatos, ver src/services/aparcamiento.ts) — nunca se
// interpreta el centinela negativo como "0% ocupado".
function colorOcupacionAparcamiento(aparcamiento: Aparcamiento): Color {
  if (aparcamiento.sinDatos) return [158, 158, 158, 160];
  const ratio = Math.min(1, Math.max(0, aparcamiento.ocupacionPorcentaje / 100));
  return [Math.round(60 + ratio * 180), Math.round(200 - ratio * 160), 60, 210];
}

function renderAparcamientoLeyenda(root: HTMLDivElement, aparcamientos: Aparcamiento[], fresh: boolean): void {
  const conDatos = aparcamientos.filter((a) => !a.sinDatos);
  const plazasLibres = conDatos.reduce((sum, a) => sum + a.plazasLibres, 0);
  const sinDatos = aparcamientos.length - conDatos.length;
  root.innerHTML = `
    <div class="info-panel__desc">Aparcamientos — ${aparcamientos.length} parkings</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(60,200,60)"></span>${plazasLibres} plazas libres (${conDatos.length} parkings con dato)</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(158,158,158)"></span>${sinDatos} sin datos (sensor caído)</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', aparcamientos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchAparcamientosActual(): Promise<{ aparcamientos: Aparcamiento[]; fresh: boolean }> {
  const res = await fetch('/api/aparcamiento/v1/estado');
  if (!res.ok) throw new Error(`GET /api/aparcamiento/v1/estado -> HTTP ${res.status}`);
  return (await res.json()) as { aparcamientos: Aparcamiento[]; fresh: boolean };
}

// Verde -> amarillo -> naranja -> rojo, según categoría — ver src/services/pulso-distrito.ts.
const COLOR_CATEGORIA_PULSO: Record<CategoriaPulso, Color> = {
  Tranquilo: [76, 175, 80, 140],
  Moderado: [255, 235, 59, 150],
  Tenso: [255, 152, 0, 160],
  Crítico: [211, 47, 47, 180],
};

function renderPulsoLeyenda(root: HTMLDivElement, distritos: PulsoDistrito[], fresh: boolean): void {
  const masTenso = [...distritos].sort((a, b) => b.indice - a.indice)[0];
  const filas = (Object.keys(COLOR_CATEGORIA_PULSO) as CategoriaPulso[])
    .map((categoria) => {
      const [r, g, b] = COLOR_CATEGORIA_PULSO[categoria];
      const n = distritos.filter((d) => d.categoria === categoria).length;
      return `<div class="trafico-leyenda__row">
        <span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>
        ${categoria} (${n})
      </div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">Pulso de Distrito — tráfico + aire + meteo</div>
    ${filas}
    ${masTenso ? `<div class="info-panel__desc">Más tenso: ${masTenso.distritoNombre} (${masTenso.indice})</div>` : ''}
    <div class="info-panel__meta">${metaFrescura('VLC Monitor (compuesto)', distritos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchPulsoDistritoActual(): Promise<{ distritos: PulsoDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/pulso/v1/distrito');
  if (!res.ok) throw new Error(`GET /api/pulso/v1/distrito -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: PulsoDistrito[]; fresh: boolean };
}

// Dorado — tema Fallas. Infantiles algo más claro para distinguirlos.
const COLOR_MONUMENTO_FALLA: Color = [230, 160, 20, 220];
const COLOR_MONUMENTO_FALLA_INFANTIL: Color = [240, 195, 100, 220];
const COLOR_CARPA_FALLA: Color = [230, 100, 20, 90];
const COLOR_ZONA_MOVILIDAD_REDUCIDA: Color = [180, 30, 140, 100];

function renderFallasLeyenda(root: HTMLDivElement, datos: DatosFallas, fresh: boolean): void {
  const adultos = datos.monumentos.filter((m) => !m.esInfantil).length;
  const infantiles = datos.monumentos.filter((m) => m.esInfantil).length;
  root.innerHTML = `
    <div class="info-panel__desc">Fallas</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(230,160,20)"></span>${adultos} monumentos</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(240,195,100)"></span>${infantiles} infantiles</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(230,100,20)"></span>${datos.carpas.length} carpas</div>
    <div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(180,30,140)"></span>${datos.zonasMovilidadReducida.length} zonas de movilidad reducida</div>
    ${datos.zonasMovilidadReducida.length === 0 ? '<div class="info-panel__meta">Sin cortes activos fuera de temporada</div>' : ''}
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València', datos.monumentos[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchDatosFallasActual(): Promise<DatosFallas & { fresh: boolean }> {
  const res = await fetch('/api/fallas/v1/actual');
  if (!res.ok) throw new Error(`GET /api/fallas/v1/actual -> HTTP ${res.status}`);
  return (await res.json()) as DatosFallas & { fresh: boolean };
}

// Spec 026 — mostaza/morado/verde azulado: distintos de rojo (reservado para
// spec 021), naranja (spec 022) y dorado (Fallas, spec 008).
const COLOR_TIPO_VIA_PUBLICA: Record<TipoIncidenciaViaPublica, Color> = {
  obras: [212, 160, 23, 210],
  incidencias: [142, 68, 173, 210],
  festejos: [26, 188, 156, 210],
};
const ZOOM_MINIMO_VIA_PUBLICA = 12; // spec 026 §5/§7 — evita saturar el mapa con 499 puntos a zoom de ciudad

const NOMBRE_TIPO_VIA_PUBLICA: Record<TipoIncidenciaViaPublica, string> = {
  obras: 'Obras',
  incidencias: 'Incidencias',
  festejos: 'Festejos',
};

function renderViaPublicaLeyenda(root: HTMLDivElement, incidencias: IncidenciaViaPublica[], fresh: boolean): void {
  const filas = (Object.keys(COLOR_TIPO_VIA_PUBLICA) as TipoIncidenciaViaPublica[])
    .map((tipo) => {
      const [r, g, b] = COLOR_TIPO_VIA_PUBLICA[tipo];
      const n = incidencias.filter((i) => i.tipo === tipo).length;
      return `<div class="trafico-leyenda__row"><span class="trafico-leyenda__dot" style="background:rgb(${r},${g},${b})"></span>${NOMBRE_TIPO_VIA_PUBLICA[tipo]} (${n})</div>`;
    })
    .join('');

  root.innerHTML = `
    <div class="info-panel__desc">Incidencias de vía pública — ${incidencias.length} activas</div>
    ${filas}
    <div class="info-panel__meta info-panel__meta--aviso">Las fechas son la vigencia del permiso administrativo, no la duración real confirmada del corte.</div>
    <div class="info-panel__meta">Solo visible acercando el mapa (zoom de calle) · toque un punto para ver el detalle</div>
    <div class="info-panel__meta">${metaFrescura('Ajuntament de València — Geoportal', incidencias[0]?.fetchedAt ?? new Date().toISOString(), fresh)}</div>
  `;
}

async function fetchIncidenciasViaPublicaActual(): Promise<{ incidencias: IncidenciaViaPublica[]; fresh: boolean }> {
  const res = await fetch('/api/via-publica/v1/incidencias');
  if (!res.ok) throw new Error(`GET /api/via-publica/v1/incidencias -> HTTP ${res.status}`);
  return (await res.json()) as { incidencias: IncidenciaViaPublica[]; fresh: boolean };
}

function formatoFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Tooltip mínimo específico de esta capa — ningún otro layer de puntos del proyecto usa popup todavía, no se construye un sistema genérico sin que otra spec lo pida. */
function buildViaPublicaTooltip(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'via-publica-tooltip';
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function renderViaPublicaTooltip(el: HTMLDivElement, incidencia: IncidenciaViaPublica | null, x: number, y: number): void {
  if (!incidencia) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
  el.innerHTML = `
    <div class="via-publica-tooltip__tipo">${NOMBRE_TIPO_VIA_PUBLICA[incidencia.tipo]}</div>
    <div class="via-publica-tooltip__calle">${escapeHtml(incidencia.calle)}</div>
    <div class="via-publica-tooltip__afectacion">${escapeHtml(incidencia.afectacion)}</div>
    <div class="via-publica-tooltip__vigencia">Vigente hasta ${formatoFechaCorta(incidencia.vigenciaHasta)}</div>
  `;
}

function formatoTiempoRelativo(fechaIso: string): string {
  const minutos = Math.round((Date.now() - new Date(fechaIso).getTime()) / 60000);
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

const PREF_OCIO_DEPORTE = 'imc:media-ocio-deporte';

function leerPrefOcioDeporte(): boolean {
  try {
    return localStorage.getItem(PREF_OCIO_DEPORTE) === '1';
  } catch {
    return false;
  }
}

function guardarPrefOcioDeporte(valor: boolean): void {
  try {
    localStorage.setItem(PREF_OCIO_DEPORTE, valor ? '1' : '0');
  } catch {
    /* almacenamiento no disponible — no bloquea el panel */
  }
}

interface MediaPanel {
  root: HTMLDivElement;
  list: HTMLDivElement;
  ocioDeporteToggle: HTMLInputElement;
}

function buildMediaPanel(): MediaPanel {
  const root = document.createElement('div');
  root.id = 'media-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">
      Contexto mediático
      <label class="media-panel__filtro">
        <input type="checkbox" id="media-ocio-deporte-toggle" />
        Ocio y deporte
      </label>
    </div>
    <div class="media-panel__list" id="media-panel-list"></div>
    <div class="info-panel__meta" id="media-panel-meta"></div>
  `;
  document.body.appendChild(root);
  const ocioDeporteToggle = root.querySelector<HTMLInputElement>('#media-ocio-deporte-toggle')!;
  ocioDeporteToggle.checked = leerPrefOcioDeporte();
  return { root, list: root.querySelector('#media-panel-list')!, ocioDeporteToggle };
}

// Spec 023 §5: cada ítem enlaza a la noticia; si menciona distrito(s), se muestra
// como chip(s) — atenuado si el match solo pasó por la guarda de contexto de un
// nombre ambiguo (bajaConfianza).
function renderItemMediatico(item: ItemMediatico): string {
  const chips = item.distritosMencionados
    .map((m) => {
      const clase = m.bajaConfianza ? 'media-panel__chip media-panel__chip--baja-confianza' : 'media-panel__chip';
      return `<span class="${clase}">${escapeHtml(m.distritoNombre)}</span>`;
    })
    .join('');

  const viaGoogle = item.fuenteTipo === 'google-news' ? ' · vía Google News' : '';
  return `
    <a class="media-panel__item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <div class="media-panel__item-titulo">${escapeHtml(item.titulo)}</div>
      <div class="media-panel__item-meta">${escapeHtml(item.fuente)} · ${formatoTiempoRelativo(item.publicadoEn)}${viaGoogle}</div>
      ${chips ? `<div class="media-panel__chips">${chips}</div>` : ''}
    </a>
  `;
}

function renderGrupoMediatico(titulo: string, items: ItemMediatico[]): string {
  if (items.length === 0) return '';
  return `
    <div class="media-panel__grupo-titulo">${escapeHtml(titulo)}</div>
    ${items.map(renderItemMediatico).join('')}
  `;
}

function renderMediaticoPanel(
  panel: MediaPanel,
  items: ItemMediatico[],
  fresh: boolean,
  fuentesFallidas: string[],
): void {
  const validos = items.filter((item) => /^https?:\/\//i.test(item.url)); // nunca renderizar javascript:/data: aunque venga en el feed
  const mostrarOcioDeporte = panel.ocioDeporteToggle.checked;

  const informativos = validos.filter((i) => i.categoria === 'general');
  const ocio = validos.filter((i) => i.categoria === 'ocio');
  const deporte = validos.filter((i) => i.categoria === 'deporte');

  // Spec 023 §5: agrupar los informativos por distrito mencionado; un ítem con
  // dos distritos aparece en los dos grupos. Sin mención -> bucket de ciudad
  // (confirmado por hito/institución) o "general, sin confirmar" (spec 009 §3.1).
  const porDistrito = new Map<string, { nombre: string; items: ItemMediatico[] }>();
  const ciudadSinDistrito: ItemMediatico[] = [];
  const generales: ItemMediatico[] = [];

  for (const item of informativos) {
    if (item.distritosMencionados.length === 0) {
      (item.ambitoCiudad === 'confirmado' ? ciudadSinDistrito : generales).push(item);
      continue;
    }
    for (const mencion of item.distritosMencionados) {
      const grupo = porDistrito.get(mencion.distritoCodigo) ?? { nombre: mencion.distritoNombre, items: [] };
      grupo.items.push(item);
      porDistrito.set(mencion.distritoCodigo, grupo);
    }
  }

  const gruposDistrito = [...porDistrito.entries()]
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre))
    .map(([, grupo]) => renderGrupoMediatico(grupo.nombre, grupo.items))
    .join('');

  const partes = [
    gruposDistrito,
    renderGrupoMediatico('València (ciudad)', ciudadSinDistrito),
    renderGrupoMediatico('València (general, sin confirmar)', generales),
  ];
  if (mostrarOcioDeporte) {
    partes.push(renderGrupoMediatico('Ocio y cultura', ocio));
    partes.push(renderGrupoMediatico('Deporte', deporte));
  }

  panel.list.innerHTML =
    partes.join('') ||
    '<div class="tendencia-panel__insuficiente">Sin titulares de la ciudad de València ahora mismo.</div>';

  const meta = panel.root.querySelector('#media-panel-meta')!;
  const ocultos =
    !mostrarOcioDeporte && ocio.length + deporte.length > 0
      ? ` · ${ocio.length + deporte.length} de ocio/deporte ocultos`
      : '';
  const avisoFallidas = fuentesFallidas.length > 0 ? ` · sin ${fuentesFallidas.join(', ')}` : '';
  meta.innerHTML =
    metaFrescura('Prensa local + GDELT', items[0]?.fetchedAt ?? new Date().toISOString(), fresh) +
    ocultos +
    avisoFallidas;
}

async function fetchItemsMediaticosActual(): Promise<{
  items: ItemMediatico[];
  fresh: boolean;
  fuentesFallidas: string[];
}> {
  const res = await fetch('/api/mediatico/v1/items');
  if (!res.ok) throw new Error(`GET /api/mediatico/v1/items -> HTTP ${res.status}`);
  return (await res.json()) as { items: ItemMediatico[]; fresh: boolean; fuentesFallidas: string[] };
}

// Spec 025 — mínimo de ítems en la ventana para mostrar el ranking como
// representativo; por debajo se avisa en vez de fingir precisión (§6 DoD).
const MINIMO_ITEMS_TENDENCIA = 5;

function buildTendenciaPanel(): { root: HTMLDivElement; list: HTMLDivElement; ventanaSelect: HTMLSelectElement } {
  const root = document.createElement('div');
  root.id = 'tendencia-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">
      Términos en tendencia
      <select id="tendencia-ventana-select" class="tendencia-panel__select">
        <option value="hora">Última hora</option>
        <option value="dia">Último día</option>
      </select>
    </div>
    <div class="media-panel__list" id="tendencia-panel-list"></div>
    <div class="info-panel__meta" id="tendencia-panel-meta"></div>
  `;
  document.body.appendChild(root);
  return {
    root,
    list: root.querySelector('#tendencia-panel-list')!,
    ventanaSelect: root.querySelector('#tendencia-ventana-select')!,
  };
}

function renderTendenciaPanel(
  panel: { root: HTMLDivElement; list: HTMLDivElement },
  ventana: VentanaTendencia,
  fresh: boolean,
): void {
  if (ventana.totalItems < MINIMO_ITEMS_TENDENCIA) {
    panel.list.innerHTML = `<div class="tendencia-panel__insuficiente">Muestra insuficiente (${ventana.totalItems} ítem${ventana.totalItems === 1 ? '' : 's'} en esta ventana) — no se muestra un ranking poco representativo.</div>`;
  } else {
    panel.list.innerHTML = ventana.terminos
      .map((t) => {
        const chips = t.distritosAsociados
          .map((codigo) => {
            const nombre = getLoadedDistricts().find((d) => d.codigo === codigo)?.nombre ?? codigo;
            return `<span class="media-panel__chip">${escapeHtml(nombre)}</span>`;
          })
          .join('');
        return `
          <div class="tendencia-panel__termino">
            <span class="tendencia-panel__palabra">${escapeHtml(t.formaOriginal)}</span>
            <span class="tendencia-panel__frecuencia">${t.frecuencia} ítem${t.frecuencia === 1 ? '' : 's'}</span>
            ${chips ? `<div class="media-panel__chips">${chips}</div>` : ''}
          </div>
        `;
      })
      .join('');
  }

  const meta = panel.root.querySelector('#tendencia-panel-meta')!;
  meta.innerHTML = `${metaFrescura('VLC Monitor (tendencia)', ventana.fetchedAt, fresh)} · ${ventana.totalItems} ítems considerados`;
}

async function fetchTendenciaActual(ventana: 'hora' | 'dia'): Promise<{ panel: VentanaTendencia; fresh: boolean }> {
  const res = await fetch(`/api/mediatico/v1/tendencia?ventana=${ventana}`);
  if (!res.ok) throw new Error(`GET /api/mediatico/v1/tendencia -> HTTP ${res.status}`);
  return (await res.json()) as { panel: VentanaTendencia; fresh: boolean };
}

interface ControlPanel {
  mockToggle: HTMLInputElement;
  horaSlider: HTMLInputElement;
  horaLabel: HTMLSpanElement;
  horaControl: HTMLDivElement;
  banner: HTMLDivElement;
  traficoToggle: HTMLInputElement;
  valenbisiToggle: HTMLInputElement;
  aparcamientoToggle: HTMLInputElement;
  pulsoToggle: HTMLInputElement;
  fallasToggle: HTMLInputElement;
  mediaToggle: HTMLInputElement;
  tendenciaToggle: HTMLInputElement;
  viaPublicaToggle: HTMLInputElement;
}

function buildControlPanel(): ControlPanel {
  const panel = document.createElement('div');
  panel.id = 'controls';
  panel.innerHTML = `
    <label class="controls__row">
      <input type="checkbox" id="toggle-mock" />
      Densidad de personas
      <span class="mock-badge" title="Datos sintéticos — spec 003, no representan actividad real">MOCK</span>
    </label>
    <div class="controls__row controls__row--hora" id="hora-control" hidden>
      <input type="range" id="hora-slider" min="0" max="23" step="1" value="14" />
      <span id="hora-label">14:00</span>
    </div>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-trafico" />
      Tráfico en tiempo real
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-valenbisi" />
      Valenbisi
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-aparcamiento" />
      Aparcamiento
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-pulso" />
      Pulso de Distrito
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-fallas" />
      Fallas
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-media" />
      Contexto mediático
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-tendencia" />
      Términos en tendencia
    </label>
    <label class="controls__row controls__row--trafico">
      <input type="checkbox" id="toggle-via-publica" />
      Incidencias de vía pública
    </label>
  `;
  document.body.appendChild(panel);

  const banner = document.createElement('div');
  banner.id = 'mock-banner';
  banner.textContent = 'Capa de datos SINTÉTICOS (MOCK) — no representa actividad real';
  banner.hidden = true;
  document.body.appendChild(banner);

  return {
    mockToggle: panel.querySelector('#toggle-mock')!,
    horaSlider: panel.querySelector('#hora-slider')!,
    horaLabel: panel.querySelector('#hora-label')!,
    horaControl: panel.querySelector('#hora-control')!,
    banner,
    traficoToggle: panel.querySelector('#toggle-trafico')!,
    valenbisiToggle: panel.querySelector('#toggle-valenbisi')!,
    aparcamientoToggle: panel.querySelector('#toggle-aparcamiento')!,
    pulsoToggle: panel.querySelector('#toggle-pulso')!,
    fallasToggle: panel.querySelector('#toggle-fallas')!,
    mediaToggle: panel.querySelector('#toggle-media')!,
    tendenciaToggle: panel.querySelector('#toggle-tendencia')!,
    viaPublicaToggle: panel.querySelector('#toggle-via-publica')!,
  };
}

async function fetchDensidadMock(hora: string): Promise<DensidadDistritoMock[]> {
  const res = await fetch(`/api/mock/v1/densidad-personas?hora=${encodeURIComponent(hora)}`);
  if (!res.ok) throw new Error(`GET /api/mock/v1/densidad-personas -> HTTP ${res.status}`);
  const body = (await res.json()) as { densidad: DensidadDistritoMock[] };
  return body.densidad;
}

async function main(): Promise<void> {
  initPwa();
  initDeteccionDispositivo();
  mountChasis();

  const initialState = readStateFromUrl();

  const map = new maplibregl.Map({
    container: 'map',
    style: OPENFREEMAP_STYLE,
    center: initialState.center,
    zoom: initialState.zoom,
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  window.addEventListener('resize', () => map.resize());

  let selectedDistrito: string | null = initialState.distrito;
  let hoveredDistrito: string | null = null;
  let mockVisible = false;
  let horaSimulada = `${String(new Date().getHours()).padStart(2, '0')}:00`;
  let densidadMock: DensidadDistritoMock[] = [];
  let traficoVisible = false;
  let tramosTrafico: TramoTrafico[] = [];
  let valenbisiVisible = false;
  let estacionesValenbisi: EstacionValenbisi[] = [];
  let aparcamientoVisible = false;
  let aparcamientos: Aparcamiento[] = [];
  let pulsoVisible = false;
  let pulsoDistritos: PulsoDistrito[] = [];
  let fallasVisible = false;
  let datosFallas: DatosFallas = { monumentos: [], carpas: [], zonasMovilidadReducida: [] };
  let viaPublicaVisible = false;
  let incidenciasViaPublica: IncidenciaViaPublica[] = [];
  const viaPublicaTooltip = buildViaPublicaTooltip();

  const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(overlay);

  const distritos = await preloadDistrictGeometry();
  const featureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry, DistritoProperties> = {
    type: 'FeatureCollection',
    features: distritos.map((d) => ({
      type: 'Feature',
      geometry: d.geometry,
      properties: { codigo: d.codigo, nombre: d.nombre },
    })),
  };

  function persistViewState(): void {
    const center = map.getCenter();
    writeStateToUrl({ center: [center.lng, center.lat], zoom: map.getZoom(), distrito: selectedDistrito });
  }

  function renderLayers(): void {
    const estadoCordon = getEstadoModoCordon();
    const cordonPropuesta = estadoCordon.resultado?.ok ? estadoCordon.resultado.propuesta : null;
    const cordonUbicacion = estadoCordon.ubicacion;

    const estadoSimulacion = getEstadoModoSimulacion();
    const tramosCortadosIds = estadoSimulacion.tramosCortados;
    const tramosAisladosIds = estadoSimulacion.resultado?.tramosAislados.map((t) => t.idTramo) ?? [];
    const algunModoActivo = estadoCordon.fase !== 'inactivo' || estadoSimulacion.fase !== 'inactivo';

    // Efecto de flujo animado — spec 004 (tráfico real), no spec 022. Se
    // quitó del simulador de cortes a petición del usuario: el simulador ya
    // muestra el resultado final (estático) del corte; el flujo en vivo
    // tiene más sentido en la capa de tráfico real, que es donde de verdad
    // hay circulación que visualizar. Solo tramos con circulación real
    // (nunca 'cortado' ni 'sin-datos' — no hay nada que fluya ahí).
    const faseFlujoTrafico = (performance.now() % DURACION_CICLO_FLUJO_TRAFICO_MS) / DURACION_CICLO_FLUJO_TRAFICO_MS;
    const puntosFlujoTrafico: Coordenada[] = [];
    if (traficoVisible) {
      for (const t of tramosTrafico) {
        if (t.estado === 'cortado' || t.estado === 'sin-datos') continue;
        // LineString o MultiLineString (spec 004 §3) — se anima cada parte
        // por separado. Sentido real desconocido en esta fuente (Geoportal,
        // distinta del grafo de spec 020) — se anima en el orden en que
        // llega la geometría, sin afirmar que sea el sentido real de circulación.
        const partes = t.geometry.type === 'LineString' ? [t.geometry.coordinates] : t.geometry.coordinates;
        for (const parte of partes) {
          puntosFlujoTrafico.push(
            ...puntosFlujoParaTramo(parte as Coordenada[], 'unidireccional', {
              fase: faseFlujoTrafico,
              puntosPorSentido: 2,
            }),
          );
        }
      }
    }

    const intensidadPorDistrito = new Map(densidadMock.map((d) => [d.distritoCodigo, d.intensidad]));
    const pulsoPorDistrito = new Map(pulsoDistritos.map((p) => [p.distritoCodigo, p]));
    const traficoFeatureCollection: GeoJSON.FeatureCollection<GeoJSON.Geometry, { estado: EstadoTramo }> = {
      type: 'FeatureCollection',
      features: tramosTrafico.map((t) => ({
        type: 'Feature',
        geometry: t.geometry,
        properties: { estado: t.estado },
      })),
    };

    const layers = [
      mockVisible &&
        new GeoJsonLayer<DistritoProperties>({
          id: 'movimiento-personas-mock',
          data: featureCollection,
          stroked: false,
          filled: true,
          pickable: false,
          getFillColor: (f) => colorIntensidad(intensidadPorDistrito.get(f.properties.codigo) ?? 0),
          updateTriggers: { getFillColor: [densidadMock] },
        }),
        traficoVisible &&
          new GeoJsonLayer<{ estado: EstadoTramo }>({
            id: 'trafico',
            data: traficoFeatureCollection,
            stroked: true,
            filled: false,
            pickable: false,
            getLineColor: (f) => COLOR_ESTADO_TRAFICO[f.properties.estado],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
            updateTriggers: { getLineColor: [tramosTrafico] },
          }),
        puntosFlujoTrafico.length > 0 &&
          new ScatterplotLayer<Coordenada>({
            id: 'trafico-flujo',
            data: puntosFlujoTrafico,
            pickable: false,
            getPosition: (p) => p,
            getFillColor: [255, 255, 255, 230],
            // Borde oscuro — sin esto, un punto blanco casi no se distingue
            // sobre el estilo de mapa claro (OpenFreeMap Liberty), sea cual
            // sea el color de fondo del tramo (verde/ámbar/naranja).
            stroked: true,
            getLineColor: [15, 31, 51, 220],
            lineWidthMinPixels: 1,
            getRadius: 7,
            radiusMinPixels: 3,
            radiusMaxPixels: 5,
          }),
        valenbisiVisible &&
          new ScatterplotLayer<EstacionValenbisi>({
            id: 'valenbisi',
            data: estacionesValenbisi,
            pickable: false,
            getPosition: (e) => [e.lon, e.lat],
            getFillColor: colorEstacionValenbisi,
            getRadius: 35,
            radiusMinPixels: 3,
            updateTriggers: { getFillColor: [estacionesValenbisi] },
          }),
        aparcamientoVisible &&
          new ScatterplotLayer<Aparcamiento>({
            id: 'aparcamiento',
            data: aparcamientos,
            pickable: false,
            getPosition: (a) => [a.lon, a.lat],
            getFillColor: colorOcupacionAparcamiento,
            getRadius: 45,
            radiusMinPixels: 4,
            updateTriggers: { getFillColor: [aparcamientos] },
          }),
        pulsoVisible &&
          new GeoJsonLayer<DistritoProperties>({
            id: 'pulso-distrito',
            data: featureCollection,
            stroked: false,
            filled: true,
            pickable: false,
            getFillColor: (f) =>
              COLOR_CATEGORIA_PULSO[pulsoPorDistrito.get(f.properties.codigo)?.categoria ?? 'Tranquilo'],
            updateTriggers: { getFillColor: [pulsoDistritos] },
          }),
        fallasVisible &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'fallas-zonas',
            data: {
              type: 'FeatureCollection',
              features: datosFallas.zonasMovilidadReducida.map((z) => ({
                type: 'Feature',
                geometry: z.geometry,
                properties: {},
              })),
            },
            stroked: true,
            filled: true,
            pickable: false,
            getFillColor: COLOR_ZONA_MOVILIDAD_REDUCIDA,
            getLineColor: [180, 30, 140, 200],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        fallasVisible &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'fallas-carpas',
            data: {
              type: 'FeatureCollection',
              features: datosFallas.carpas.map((c) => ({ type: 'Feature', geometry: c.geometry, properties: {} })),
            },
            stroked: true,
            filled: true,
            pickable: false,
            getFillColor: COLOR_CARPA_FALLA,
            getLineColor: [180, 70, 10, 200],
            getLineWidth: 1,
            lineWidthMinPixels: 1,
          }),
        fallasVisible &&
          new ScatterplotLayer<MonumentoFalla>({
            id: 'fallas-monumentos',
            data: datosFallas.monumentos,
            pickable: false,
            getPosition: (m) => [m.lon, m.lat],
            getFillColor: (m) => (m.esInfantil ? COLOR_MONUMENTO_FALLA_INFANTIL : COLOR_MONUMENTO_FALLA),
            getRadius: 18,
            radiusMinPixels: 2,
          }),
        // Spec 026 — solo a partir de zoom de calle (499 puntos activos,
        // satura el mapa antes de eso). pickable solo fuera de los modos
        // cordón/simulación, mismo guard que la capa de distritos.
        viaPublicaVisible &&
          map.getZoom() >= ZOOM_MINIMO_VIA_PUBLICA &&
          new ScatterplotLayer<IncidenciaViaPublica>({
            id: 'via-publica',
            data: incidenciasViaPublica,
            pickable: !algunModoActivo,
            getPosition: (i) => [i.lon, i.lat],
            getFillColor: (i) => COLOR_TIPO_VIA_PUBLICA[i.tipo],
            getRadius: 22,
            radiusMinPixels: 3,
            onHover: (info: PickingInfo<IncidenciaViaPublica>) => {
              renderViaPublicaTooltip(viaPublicaTooltip, info.object ?? null, info.x, info.y);
            },
          }),
        // Spec 021 — modo cordón de incidente. Solo se pinta mientras el
        // modo está activo y hay una propuesta calculada; nunca compite por
        // espacio con el resto de capas porque main.ts oculta los paneles
        // habituales mientras este modo está activo (ver actualizarUiModoCordon).
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-area-socorro',
            data: { type: 'Feature', geometry: cordonPropuesta.geometriaAreaSocorro, properties: {} },
            stroked: true,
            filled: true,
            getFillColor: [245, 158, 11, 35],
            getLineColor: [245, 158, 11, 180],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-area-intervencion',
            data: { type: 'Feature', geometry: cordonPropuesta.geometriaAreaIntervencion, properties: {} },
            stroked: true,
            filled: true,
            getFillColor: [220, 38, 38, 55],
            getLineColor: [220, 38, 38, 200],
            getLineWidth: 2,
            lineWidthMinPixels: 1,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-cerrados',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosCerrados
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [220, 38, 38, 230],
            getLineWidth: 5,
            lineWidthMinPixels: 3,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-corte',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosCorte
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [245, 158, 11, 230],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        cordonPropuesta &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'cordon-tramos-desvio',
            data: {
              type: 'FeatureCollection',
              features: cordonPropuesta.tramosDesvioSugerido
                .map((id) => getTramoPorId(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [59, 130, 246, 210],
            getLineWidth: 3,
            lineWidthMinPixels: 2,
          }),
        cordonUbicacion &&
          new ScatterplotLayer<{ position: [number, number] }>({
            id: 'cordon-marcador',
            data: [{ position: cordonUbicacion }],
            pickable: false,
            getPosition: (d) => d.position,
            getFillColor: [255, 60, 0, 255],
            getRadius: 8,
            radiusMinPixels: 6,
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            getLineWidth: 2,
            lineWidthMinPixels: 2,
          }),
        // Spec 022 — simulador de cortes: tramos cortados a mano por el
        // usuario en rojo, tramos que quedan sin salida como consecuencia en
        // violeta (color distinto del cordón de spec 021, aunque nunca
        // coinciden activos a la vez — son modos mutuamente excluyentes).
        tramosCortadosIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-cortados',
            data: {
              type: 'FeatureCollection',
              features: tramosCortadosIds
                .map((id) => getTramoPorIdSimulacion(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            // Naranja, no rojo — el rojo queda reservado para el cordón de
            // incidente real (spec 021, una emergencia de verdad). Este es
            // un corte hipotético de una simulación, no una urgencia.
            getLineColor: [249, 115, 22, 230],
            getLineWidth: 5,
            lineWidthMinPixels: 3,
          }),
        tramosAisladosIds.length > 0 &&
          new GeoJsonLayer<Record<string, never>>({
            id: 'simulacion-tramos-aislados',
            data: {
              type: 'FeatureCollection',
              features: tramosAisladosIds
                .map((id) => getTramoPorIdSimulacion(id))
                .filter((t): t is NonNullable<typeof t> => !!t)
                .map((t) => ({ type: 'Feature' as const, geometry: t.geometria, properties: {} })),
            },
            stroked: true,
            filled: false,
            getLineColor: [168, 85, 247, 220],
            getLineWidth: 4,
            lineWidthMinPixels: 2,
          }),
        new GeoJsonLayer<DistritoProperties>({
          id: 'distritos',
          data: featureCollection,
          stroked: true,
          filled: !mockVisible && !pulsoVisible,
          // Desactivada mientras el modo cordón (spec 021) o el simulador de
          // cortes (spec 022) están activos: si no, el clic de esos modos
          // también dispara el picking de esta capa y selecciona/pinta el
          // distrito entero encima.
          pickable: !algunModoActivo,
          autoHighlight: false,
          getFillColor: (f) => {
            const codigo = f.properties.codigo;
            if (codigo === selectedDistrito) return [255, 140, 0, 130];
            if (codigo === hoveredDistrito) return [30, 144, 255, 90];
            return [30, 144, 255, 25];
          },
          getLineColor: [30, 60, 110, 220],
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          updateTriggers: {
            getFillColor: [selectedDistrito, hoveredDistrito, mockVisible],
          },
          onHover: (info: PickingInfo<GeoJSON.Feature<GeoJSON.Geometry, DistritoProperties>>) => {
            // Guard explícito, no solo `pickable` — comprobar el estado en
            // vivo aquí evita depender de que el re-render con pickable:false
            // ya se haya aplicado antes de que llegue este evento (spec 021/022).
            if (getEstadoModoCordon().fase !== 'inactivo' || getEstadoModoSimulacion().fase !== 'inactivo') return;
            const nuevoHover = info.object?.properties.codigo ?? null;
            if (nuevoHover !== hoveredDistrito) {
              hoveredDistrito = nuevoHover;
              renderLayers();
            }
          },
          onClick: (info: PickingInfo<GeoJSON.Feature<GeoJSON.Geometry, DistritoProperties>>) => {
            if (getEstadoModoCordon().fase !== 'inactivo' || getEstadoModoSimulacion().fase !== 'inactivo') return;
            selectedDistrito = info.object?.properties.codigo ?? null;
            renderLayers();
            persistViewState();
          },
        }),
    ].filter((layer): layer is Exclude<typeof layer, false> => layer !== false);

    overlay.setProps({ layers });
  }

  // Spec 021 — modo cordón de incidente: oculta los paneles habituales
  // mientras está activo (evita el amontonamiento y la confusión de tener
  // dos flujos de trabajo a la vez) y gestiona el clic único en el mapa
  // para marcar la ubicación del incidente.
  let clicCordonHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;
  onCambioModoCordon((estadoCordon) => {
    const controlesEl = document.getElementById('controls');
    const infoPanelsEl = document.getElementById('info-panels');
    const activo = estadoCordon.fase !== 'inactivo';
    if (controlesEl) controlesEl.style.display = activo ? 'none' : '';
    if (infoPanelsEl) infoPanelsEl.style.display = activo ? 'none' : '';

    if (estadoCordon.fase === 'esperandoClicMapa' && !clicCordonHandler) {
      map.getCanvas().style.cursor = 'crosshair';
      clicCordonHandler = (e) => reportarUbicacionElegida([e.lngLat.lng, e.lngLat.lat]);
      map.on('click', clicCordonHandler);
    } else if (estadoCordon.fase !== 'esperandoClicMapa' && clicCordonHandler) {
      map.off('click', clicCordonHandler);
      clicCordonHandler = null;
      map.getCanvas().style.cursor = '';
    }

    renderLayers();
  });

  // Spec 022 — modo simulador de cortes: cada clic hace snap al tramo más
  // cercano (reutiliza el mismo índice espacial de spec 020) y lo
  // añade/quita del conjunto de cortes. El grafo ya está en caché tras
  // activarSimulacionCortes(), así que cargarGrafoViario() aquí no repite
  // la llamada de red.
  let clicSimulacionHandler: ((e: maplibregl.MapMouseEvent) => void) | null = null;

  // Bucle de animación del efecto de flujo de la capa de tráfico (spec 004)
  // — con throttling: sin limitar, un requestAnimationFrame llamaría a
  // renderLayers() a ~60fps, reconstruyendo TODAS las capas (no solo los
  // puntos de flujo) muchas más veces de las necesarias — con ~400 tramos
  // visibles a la vez esto sí se nota, a diferencia del puñado de tramos
  // que maneja el simulador de spec 022. Throttle más generoso aquí a
  // propósito ("que no sature", petición del usuario) y solo activo
  // mientras la capa de tráfico está visible.
  const INTERVALO_RENDER_FLUJO_TRAFICO_MS = 220;
  let animacionFlujoTraficoActiva = false;
  let ultimoRenderFlujoTrafico = 0;
  function tickAnimacionFlujoTrafico(timestamp: number): void {
    if (!animacionFlujoTraficoActiva) return;
    if (timestamp - ultimoRenderFlujoTrafico >= INTERVALO_RENDER_FLUJO_TRAFICO_MS) {
      ultimoRenderFlujoTrafico = timestamp;
      renderLayers();
    }
    requestAnimationFrame(tickAnimacionFlujoTrafico);
  }
  function actualizarAnimacionFlujoTrafico(activar: boolean): void {
    if (activar && !animacionFlujoTraficoActiva) {
      animacionFlujoTraficoActiva = true;
      requestAnimationFrame(tickAnimacionFlujoTrafico);
    } else if (!activar) {
      animacionFlujoTraficoActiva = false;
    }
  }

  onCambioModoSimulacion((estadoSimulacion) => {
    const controlesEl = document.getElementById('controls');
    const infoPanelsEl = document.getElementById('info-panels');
    const activo = estadoSimulacion.fase !== 'inactivo';
    if (controlesEl) controlesEl.style.display = activo ? 'none' : '';
    if (infoPanelsEl) infoPanelsEl.style.display = activo ? 'none' : '';

    if (estadoSimulacion.fase === 'seleccionando' && !clicSimulacionHandler) {
      map.getCanvas().style.cursor = 'crosshair';
      clicSimulacionHandler = (e) => {
        void cargarGrafoViario().then((grafo) => {
          const snap = grafo.indice.tramoMasCercano([e.lngLat.lng, e.lngLat.lat], 60);
          if (snap) toggleTramoCortado(snap.tramo.idTramo);
        });
      };
      map.on('click', clicSimulacionHandler);
    } else if (estadoSimulacion.fase !== 'seleccionando' && clicSimulacionHandler) {
      map.off('click', clicSimulacionHandler);
      clicSimulacionHandler = null;
      map.getCanvas().style.cursor = '';
    }

    renderLayers();
  });

  const panel = buildControlPanel();
  panel.horaSlider.value = horaSimulada.slice(0, 2);
  panel.horaLabel.textContent = horaSimulada;

  async function refreshMockLayer(): Promise<void> {
    densidadMock = await fetchDensidadMock(horaSimulada);
    renderLayers();
  }

  panel.mockToggle.addEventListener('change', () => {
    mockVisible = panel.mockToggle.checked;
    panel.horaControl.hidden = !mockVisible;
    panel.banner.hidden = !mockVisible;
    if (mockVisible) {
      refreshMockLayer().catch((err: unknown) => console.error('Fallo al cargar densidad mock:', err));
    } else {
      renderLayers();
    }
  });

  panel.horaSlider.addEventListener('input', () => {
    horaSimulada = `${panel.horaSlider.value.padStart(2, '0')}:00`;
    panel.horaLabel.textContent = horaSimulada;
    if (mockVisible) {
      refreshMockLayer().catch((err: unknown) => console.error('Fallo al cargar densidad mock:', err));
    }
  });

  const traficoLeyendaRoot = buildInfoPanel('trafico-leyenda');
  traficoLeyendaRoot.hidden = true;
  let traficoPollingIniciado = false;
  async function refreshTrafico(): Promise<void> {
    try {
      const { tramos, fresh } = await fetchEstadoTraficoActual();
      tramosTrafico = tramos;
      actualizarTramosTrafico(tramos);
      renderLayers();
      renderTraficoLeyenda(traficoLeyendaRoot, tramos, fresh);
    } catch (err) {
      traficoLeyendaRoot.textContent = 'Tráfico no disponible';
      console.error('Fallo al cargar tráfico:', err);
    }
  }

  panel.traficoToggle.addEventListener('change', () => {
    traficoVisible = panel.traficoToggle.checked;
    traficoLeyendaRoot.hidden = !traficoVisible;
    actualizarAnimacionFlujoTrafico(traficoVisible);
    if (traficoVisible && !traficoPollingIniciado) {
      traficoPollingIniciado = true;
      startPolling(refreshTrafico, 3 * 60 * 1000); // igual TTL que la caché del endpoint, spec 004 §4
    } else {
      renderLayers();
    }
  });

  const valenbisiLeyendaRoot = buildInfoPanel('valenbisi-leyenda');
  valenbisiLeyendaRoot.hidden = true;
  let valenbisiPollingIniciado = false;
  async function refreshValenbisi(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchEstacionesValenbisiActual();
      estacionesValenbisi = estaciones;
      actualizarEstacionesValenbisi(estaciones);
      renderLayers();
      renderValenbisiLeyenda(valenbisiLeyendaRoot, estaciones, fresh);
    } catch (err) {
      valenbisiLeyendaRoot.textContent = 'Valenbisi no disponible';
      console.error('Fallo al cargar Valenbisi:', err);
    }
  }

  panel.valenbisiToggle.addEventListener('change', () => {
    valenbisiVisible = panel.valenbisiToggle.checked;
    valenbisiLeyendaRoot.hidden = !valenbisiVisible;
    if (valenbisiVisible && !valenbisiPollingIniciado) {
      valenbisiPollingIniciado = true;
      startPolling(refreshValenbisi, 2 * 60 * 1000); // igual TTL que la caché del endpoint, spec 005 §4
    } else {
      renderLayers();
    }
  });

  const aparcamientoLeyendaRoot = buildInfoPanel('aparcamiento-leyenda');
  aparcamientoLeyendaRoot.hidden = true;
  let aparcamientoPollingIniciado = false;
  async function refreshAparcamiento(): Promise<void> {
    try {
      const { aparcamientos: datos, fresh } = await fetchAparcamientosActual();
      aparcamientos = datos;
      actualizarAparcamientos(datos);
      renderLayers();
      renderAparcamientoLeyenda(aparcamientoLeyendaRoot, datos, fresh);
    } catch (err) {
      aparcamientoLeyendaRoot.textContent = 'Aparcamiento no disponible';
      console.error('Fallo al cargar aparcamiento:', err);
    }
  }

  panel.aparcamientoToggle.addEventListener('change', () => {
    aparcamientoVisible = panel.aparcamientoToggle.checked;
    aparcamientoLeyendaRoot.hidden = !aparcamientoVisible;
    if (aparcamientoVisible && !aparcamientoPollingIniciado) {
      aparcamientoPollingIniciado = true;
      startPolling(refreshAparcamiento, 2 * 60 * 1000); // igual TTL que la caché del endpoint, spec 006 §4
    } else {
      renderLayers();
    }
  });

  const pulsoLeyendaRoot = buildInfoPanel('pulso-leyenda');
  pulsoLeyendaRoot.hidden = true;
  let pulsoPollingIniciado = false;
  async function refreshPulso(): Promise<void> {
    try {
      const { distritos: datos, fresh } = await fetchPulsoDistritoActual();
      pulsoDistritos = datos;
      renderLayers();
      renderPulsoLeyenda(pulsoLeyendaRoot, datos, fresh);
    } catch (err) {
      pulsoLeyendaRoot.textContent = 'Pulso de Distrito no disponible';
      console.error('Fallo al cargar Pulso de Distrito:', err);
    }
  }

  panel.pulsoToggle.addEventListener('change', () => {
    pulsoVisible = panel.pulsoToggle.checked;
    pulsoLeyendaRoot.hidden = !pulsoVisible;
    if (pulsoVisible && !pulsoPollingIniciado) {
      pulsoPollingIniciado = true;
      startPolling(refreshPulso, 3 * 60 * 1000); // misma cadencia que el componente más volátil (tráfico), spec 010 §4
    } else {
      renderLayers();
    }
  });

  const fallasLeyendaRoot = buildInfoPanel('fallas-leyenda');
  fallasLeyendaRoot.hidden = true;
  let fallasPollingIniciado = false;
  async function refreshFallas(): Promise<void> {
    try {
      const { fresh, ...datos } = await fetchDatosFallasActual();
      datosFallas = datos;
      renderLayers();
      renderFallasLeyenda(fallasLeyendaRoot, datos, fresh);
    } catch (err) {
      fallasLeyendaRoot.textContent = 'Fallas no disponible';
      console.error('Fallo al cargar Fallas:', err);
    }
  }

  panel.fallasToggle.addEventListener('change', () => {
    fallasVisible = panel.fallasToggle.checked;
    fallasLeyendaRoot.hidden = !fallasVisible;
    if (fallasVisible && !fallasPollingIniciado) {
      fallasPollingIniciado = true;
      startPolling(refreshFallas, 6 * 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 008 §4
    } else {
      renderLayers();
    }
  });

  const viaPublicaLeyendaRoot = buildInfoPanel('via-publica-leyenda');
  viaPublicaLeyendaRoot.hidden = true;
  let viaPublicaPollingIniciado = false;
  async function refreshViaPublica(): Promise<void> {
    try {
      const { incidencias, fresh } = await fetchIncidenciasViaPublicaActual();
      incidenciasViaPublica = incidencias;
      renderLayers();
      renderViaPublicaLeyenda(viaPublicaLeyendaRoot, incidencias, fresh);
    } catch (err) {
      viaPublicaLeyendaRoot.textContent = 'Incidencias de vía pública no disponibles';
      console.error('Fallo al cargar incidencias de vía pública:', err);
    }
  }

  panel.viaPublicaToggle.addEventListener('change', () => {
    viaPublicaVisible = panel.viaPublicaToggle.checked;
    viaPublicaLeyendaRoot.hidden = !viaPublicaVisible;
    if (!viaPublicaVisible) viaPublicaTooltip.hidden = true;
    if (viaPublicaVisible && !viaPublicaPollingIniciado) {
      viaPublicaPollingIniciado = true;
      startPolling(refreshViaPublica, 60 * 60 * 1000); // igual TTL que la caché del endpoint, spec 026 §4
    } else {
      renderLayers();
    }
  });

  // La capa solo aparece a partir de ZOOM_MINIMO_VIA_PUBLICA (spec 026 §5) —
  // sin este listener, acercar/alejar el mapa sin tocar ningún toggle no
  // recalcularía qué capas mostrar. 'zoomend' (no 'zoom' continuo) para no
  // reconstruir todas las capas en cada frame de un gesto de zoom.
  map.on('zoomend', () => {
    if (viaPublicaVisible) renderLayers();
  });

  const mediaPanel = buildMediaPanel();
  let mediaPollingIniciado = false;
  let ultimoMediatico: { items: ItemMediatico[]; fresh: boolean; fuentesFallidas: string[] } | null =
    null;
  async function refreshMediatico(): Promise<void> {
    try {
      const datos = await fetchItemsMediaticosActual();
      ultimoMediatico = datos;
      renderMediaticoPanel(mediaPanel, datos.items, datos.fresh, datos.fuentesFallidas);
    } catch (err) {
      mediaPanel.list.textContent = 'Contexto mediático no disponible';
      console.error('Fallo al cargar contexto mediático:', err);
    }
  }

  mediaPanel.ocioDeporteToggle.addEventListener('change', () => {
    guardarPrefOcioDeporte(mediaPanel.ocioDeporteToggle.checked);
    if (ultimoMediatico) {
      renderMediaticoPanel(
        mediaPanel,
        ultimoMediatico.items,
        ultimoMediatico.fresh,
        ultimoMediatico.fuentesFallidas,
      );
    }
  });

  panel.mediaToggle.addEventListener('change', () => {
    mediaPanel.root.hidden = !panel.mediaToggle.checked;
    if (panel.mediaToggle.checked && !mediaPollingIniciado) {
      mediaPollingIniciado = true;
      startPolling(refreshMediatico, 15 * 60 * 1000); // igual TTL que la caché del endpoint, spec 009 §4
    }
  });

  const tendenciaPanel = buildTendenciaPanel();
  let tendenciaPollingIniciado = false;
  let ventanaTendenciaActual: 'hora' | 'dia' = 'hora';
  async function refreshTendencia(): Promise<void> {
    try {
      const { panel: ventana, fresh } = await fetchTendenciaActual(ventanaTendenciaActual);
      renderTendenciaPanel(tendenciaPanel, ventana, fresh);
    } catch (err) {
      tendenciaPanel.list.textContent = 'Términos en tendencia no disponibles';
      console.error('Fallo al cargar términos en tendencia:', err);
    }
  }

  tendenciaPanel.ventanaSelect.addEventListener('change', () => {
    ventanaTendenciaActual = tendenciaPanel.ventanaSelect.value === 'dia' ? 'dia' : 'hora';
    void refreshTendencia();
  });

  panel.tendenciaToggle.addEventListener('change', () => {
    tendenciaPanel.root.hidden = !panel.tendenciaToggle.checked;
    if (panel.tendenciaToggle.checked && !tendenciaPollingIniciado) {
      tendenciaPollingIniciado = true;
      startPolling(refreshTendencia, 15 * 60 * 1000); // igual TTL que la caché del endpoint, spec 025 §4
    }
  });

  map.on('load', () => {
    renderLayers();
    if (initialState.distrito) {
      const centroide = getDistrictCentroid(initialState.distrito);
      if (centroide) map.setCenter(centroide);
    }
  });

  map.on('moveend', persistViewState);

  const meteoPanelRoot = buildInfoPanel('meteo-panel');
  async function refreshMeteoPanel(): Promise<void> {
    try {
      const { estado, fresh } = await fetchEstadoMeteoActual();
      renderMeteoPanel(meteoPanelRoot, estado, fresh);
    } catch (err) {
      meteoPanelRoot.textContent = 'Meteo no disponible';
      console.error('Fallo al cargar meteo:', err);
    }
  }
  startPolling(refreshMeteoPanel, 5 * 60 * 1000);

  const prediccionPanelRoot = buildInfoPanel('meteo-prediccion-panel');
  async function refreshPrediccionPanel(): Promise<void> {
    try {
      const { prediccion, fresh } = await fetchPrediccionCortoPlazoActual();
      renderPrediccionPanel(prediccionPanelRoot, prediccion, fresh);
    } catch (err) {
      prediccionPanelRoot.textContent = 'Predicción no disponible';
      console.error('Fallo al cargar predicción a corto plazo:', err);
    }
  }
  startPolling(refreshPrediccionPanel, 5 * 60 * 1000);

  const airePanelRoot = buildInfoPanel('aire-panel');
  async function refreshAirePanel(): Promise<void> {
    try {
      const { calidad, fresh } = await fetchCalidadAireActual();
      renderAirePanel(airePanelRoot, calidad, fresh);
    } catch (err) {
      airePanelRoot.textContent = 'Calidad del aire no disponible';
      console.error('Fallo al cargar calidad del aire:', err);
    }
  }
  startPolling(refreshAirePanel, 5 * 60 * 1000);

  const insightsPanelRoot = buildInfoPanel('insights-panel');
  // Delegado (no un listener por tarjeta): el HTML se reconstruye en cada
  // refresco, así que un listener directo por botón se perdería.
  insightsPanelRoot.addEventListener('click', (ev) => {
    const boton = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-insight-index]');
    if (!boton || !ultimoPanelInsights) return;
    const insight = ultimoPanelInsights.insights[Number(boton.dataset.insightIndex)];
    if (!insight) return;
    const texto = `Asunto: ${insight.protocoloSugerido.asunto}\n\n${insight.protocoloSugerido.cuerpo}`;
    navigator.clipboard
      .writeText(texto)
      .then(() => {
        boton.textContent = 'Copiado ✓';
        setTimeout(() => {
          boton.textContent = 'Copiar borrador';
        }, 2000);
      })
      .catch((err: unknown) => console.error('No se pudo copiar el borrador:', err));
  });
  async function refreshInsightsPanel(): Promise<void> {
    try {
      const { panel, fresh } = await fetchInsightsActual();
      renderInsightsPanel(insightsPanelRoot, panel, fresh);
    } catch (err) {
      insightsPanelRoot.textContent = 'Insights no disponibles';
      console.error('Fallo al cargar insights:', err);
    }
  }
  startPolling(refreshInsightsPanel, 5 * 60 * 1000);

  const traficoHistoricoPanelRoot = buildInfoPanel('trafico-historico-panel');
  async function refreshTraficoHistoricoPanel(): Promise<void> {
    try {
      const { historico, fresh } = await fetchTraficoHistoricoCiudad();
      renderTraficoHistoricoPanel(traficoHistoricoPanelRoot, historico, fresh);
    } catch (err) {
      traficoHistoricoPanelRoot.textContent = 'Histórico de tráfico no disponible';
      console.error('Fallo al cargar histórico de tráfico:', err);
    }
  }
  // Cadencia holgada: el histórico se actualiza una vez por hora en origen
  // (cron), no hace falta sondear más a menudo que eso.
  startPolling(refreshTraficoHistoricoPanel, 15 * 60 * 1000);

  // Los 5 paneles fijos de arriba ya existen en el DOM — aplicar ahora la
  // preferencia de visibilidad guardada en Configuración (spec 019 v3).
  applyPanelVisibility();

  // Spec 029 — con los paneles ya montados, activa el layout móvil (bottom
  // sheet + reparentado) si el dispositivo lo pide.
  initLayoutMovil();
}

main().catch((err: unknown) => {
  console.error('Fallo al iniciar VLC Monitor:', err);
});
