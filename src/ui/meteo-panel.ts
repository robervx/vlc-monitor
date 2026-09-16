// Panel de meteorología — spec 001 (estado actual) + spec 016 (predicción a
// corto plazo, "Próximas Nh"). Segundo panel extraído de `main.ts` (ver spec
// 038 v6 para el primero, cámaras): mismo patrón, una función `montar*` por
// panel que construye su `info-panel`, fetchea, renderiza y arranca su
// propio polling — `main.ts` solo la llama.

import type { EstadoMeteo } from '../services/estado-meteo';
import type { PrediccionCortoPlazo } from '../services/prediccion-corto-plazo';
import { UMBRAL_VIENTO_AVISO_KMH, UMBRAL_VIENTO_URGENTE_KMH } from '../services/insights';
import { registrarFrescura } from './estado-frescura';
import { buildInfoPanel, metaFrescura, startPolling } from './panel-utils';

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

/** Monta `#meteo-panel` y arranca su polling propio (spec 001). */
export function montarMeteoActualPanel(): void {
  const root = buildInfoPanel('meteo-panel');
  async function refresh(): Promise<void> {
    try {
      const { estado, fresh } = await fetchEstadoMeteoActual();
      renderMeteoPanel(root, estado, fresh);
      registrarFrescura('meteo', { ok: true, fresh, fetchedAt: estado.fetchedAt });
    } catch (err) {
      root.textContent = 'Meteo no disponible';
      registrarFrescura('meteo', { ok: false, fresh: false });
      console.error('Fallo al cargar meteo:', err);
    }
  }
  startPolling(refresh, 5 * 60 * 1000);
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

/** Monta `#meteo-prediccion-panel` y arranca su polling propio (spec 016). */
export function montarPrediccionPanel(): void {
  const root = buildInfoPanel('meteo-prediccion-panel');
  async function refresh(): Promise<void> {
    try {
      const { prediccion, fresh } = await fetchPrediccionCortoPlazoActual();
      renderPrediccionPanel(root, prediccion, fresh);
      registrarFrescura('prediccion', { ok: true, fresh, fetchedAt: prediccion.fetchedAt });
    } catch (err) {
      root.textContent = 'Predicción no disponible';
      registrarFrescura('prediccion', { ok: false, fresh: false });
      console.error('Fallo al cargar predicción a corto plazo:', err);
    }
  }
  startPolling(refresh, 5 * 60 * 1000);
}
