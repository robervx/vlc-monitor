// Panel de emergencia meteorológica avanzada — spec 044, dentro de
// /inteligencia (spec 040). Dos cajas separadas a partir de la
// reestructuración pedida por el usuario el 2026-09-17 — antes vivían juntas
// en un único panel: altimetría (estática, IGN) por un lado; lluvia/viento
// por distrito (modelo Open-Meteo) + pluviómetros reales (SAIH Júcar,
// medido) por otro, porque estos dos últimos comparten el mismo tema
// ("cuánta agua está cayendo ahora mismo") y cadencia de refresco.
// "Capacidad de absorción" queda fuera — sin fuente oficial identificada, no
// se inventa una heurística (§7, mismo criterio que EMT en spec 007 o Waze
// en spec 015).
import type { ResumenAltimetriaDistrito } from '../services/altimetria';
import type { LluviaVientoDistrito } from '../services/meteo-zona';
import type { PluviometroSaih } from '../services/pluviometros-saih';
import type { EstacionAvamet } from '../services/avamet-estaciones';
import { ADVERTENCIA_RIESGO_ESCORRENTIA, type RiesgoEscorrentiaDistrito } from '../services/riesgo-escorrentia';
import { escapeHtml, metaFrescura, startPolling } from './panel-utils';

async function fetchAltimetria(): Promise<ResumenAltimetriaDistrito[]> {
  const res = await fetch('/api/emergencia/v1/altimetria');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/altimetria -> HTTP ${res.status}`);
  const body = (await res.json()) as { distritos: ResumenAltimetriaDistrito[] };
  return body.distritos;
}

async function fetchMeteoZona(): Promise<{ distritos: LluviaVientoDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/meteo-zona');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/meteo-zona -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: LluviaVientoDistrito[]; fresh: boolean };
}

async function fetchPluviometros(): Promise<{ estaciones: PluviometroSaih[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/pluviometros');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/pluviometros -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: PluviometroSaih[]; fresh: boolean };
}

async function fetchAvamet(): Promise<{ estaciones: EstacionAvamet[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/avamet');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/avamet -> HTTP ${res.status}`);
  return (await res.json()) as { estaciones: EstacionAvamet[]; fresh: boolean };
}

async function fetchRiesgoEscorrentia(): Promise<{ distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean }> {
  const res = await fetch('/api/emergencia/v1/riesgo-escorrentia');
  if (!res.ok) throw new Error(`GET /api/emergencia/v1/riesgo-escorrentia -> HTTP ${res.status}`);
  return (await res.json()) as { distritos: RiesgoEscorrentiaDistrito[]; fresh: boolean };
}

function renderAltimetria(distritos: ResumenAltimetriaDistrito[]): string {
  if (distritos.length === 0) return '<div class="info-panel__desc">Sin datos de altimetría.</div>';
  const max = Math.max(...distritos.map((d) => d.elevacionMediaM));
  return distritos
    .map((d) => {
      const pct = max > 0 ? Math.round((d.elevacionMediaM / max) * 100) : 0;
      return `
        <div class="altimetria-fila">
          <span class="altimetria-fila__nombre">${escapeHtml(d.distritoNombre)}</span>
          <span class="altimetria-fila__barra"><span style="width:${pct}%"></span></span>
          <span class="altimetria-fila__valor">${d.elevacionMediaM.toFixed(1)} m</span>
        </div>
      `;
    })
    .join('');
}

function renderMeteoZona(distritos: LluviaVientoDistrito[]): string {
  if (distritos.length === 0) return '<div class="info-panel__desc">Sin datos de lluvia/viento por distrito.</div>';
  const ordenado = [...distritos].sort((a, b) => b.precipitacionMm - a.precipitacionMm || b.rachaKmh - a.rachaKmh);
  return ordenado
    .map(
      (d) => `
        <div class="meteo-zona-fila">
          <span class="meteo-zona-fila__nombre">${escapeHtml(d.distritoNombre)}</span>
          <span class="meteo-zona-fila__dato">🌧 ${d.precipitacionMm.toFixed(1)} mm</span>
          <span class="meteo-zona-fila__dato">💨 ${d.vientoKmh.toFixed(0)} km/h (ráfaga ${d.rachaKmh.toFixed(0)})</span>
        </div>
      `,
    )
    .join('');
}

function renderAvamet(estaciones: EstacionAvamet[]): string {
  if (estaciones.length === 0) return '<div class="info-panel__desc">Sin estaciones AVAMET disponibles ahora mismo.</div>';
  const ordenado = [...estaciones].sort((a, b) => b.temperaturaC - a.temperaturaC);
  return ordenado
    .map(
      (e) => `
        <div class="avamet-fila">
          <span class="avamet-fila__nombre">${escapeHtml(e.nombre)}</span>
          <span class="avamet-fila__dato">🌡 ${e.temperaturaC.toFixed(1)}°C</span>
          <span class="avamet-fila__dato">💨 ${e.vientoKmh.toFixed(0)} km/h (${escapeHtml(e.vientoDireccion)})</span>
          <span class="avamet-fila__dato">🌧 ${e.precipitacionDiaMm.toFixed(1)} mm/día</span>
        </div>
      `,
    )
    .join('');
}

function renderPluviometros(estaciones: PluviometroSaih[]): string {
  if (estaciones.length === 0) return '<div class="info-panel__desc">Sin pluviómetros con dato cerca de Valencia ahora mismo.</div>';
  return estaciones
    .map(
      (e) => `
        <div class="pluviometro-fila">
          <span class="pluviometro-fila__nombre">${escapeHtml(e.nombre)} <small>(${escapeHtml(e.poblacion)})</small></span>
          <span class="pluviometro-fila__acumulados">1h: ${e.litrosM2_1h.toFixed(1)} · 4h: ${e.litrosM2_4h.toFixed(1)} · 12h: ${e.litrosM2_12h.toFixed(1)} · 24h: <strong>${e.litrosM2_24h.toFixed(1)}</strong> l/m²</span>
        </div>
      `,
    )
    .join('');
}

// Ranking ordinal (no bandas "alto/medio/bajo": con solo 19 distritos, cortes
// fijos son arbitrarios y se confunden con niveles oficiales de Protección
// Civil/AEMET — spec 046 §3). Solo lista distritos `activo` (lluvia por
// encima del umbral); si ninguno lo está, el estado es "sin lluvia" — nunca
// un índice en reposo que invite a leerse como "riesgo bajo pero presente".
function renderRiesgoEscorrentia(distritos: RiesgoEscorrentiaDistrito[]): string {
  if (distritos.length === 0) return '<div class="info-panel__desc">Sin datos de riesgo de escorrentía.</div>';
  const activos = distritos.filter((d) => d.activo);
  if (activos.length === 0) {
    return '<div class="info-panel__desc">Sin lluvia registrada ahora mismo — el indicador solo se activa con lluvia en curso.</div>';
  }
  const ordenado = [...activos].sort((a, b) => b.indiceRelativo - a.indiceRelativo);
  return ordenado
    .map(
      (d) => `
        <div class="escorrentia-fila">
          <span class="escorrentia-fila__nombre">${escapeHtml(d.distritoNombre)}</span>
          <span class="escorrentia-fila__barra"><span style="width:${d.indiceRelativo}%"></span></span>
          <span class="escorrentia-fila__valor">${d.indiceRelativo}</span>
        </div>
      `,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Caja 1 — Altimetría (estática, IGN)
// ---------------------------------------------------------------------------

export function montarAltimetriaPanel(): void {
  const root = document.createElement('div');
  root.id = 'altimetria-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Altimetría por distrito</div>
    <p class="cordon-intro">Más alto → más bajo. Dato estático (IGN) — no cambia con el tiempo, sirve para anticipar dónde se acumula el agua por gravedad.</p>
    <div id="altimetria-list"></div>
  `;
  document.body.appendChild(root);
  const list = root.querySelector('#altimetria-list')!;

  fetchAltimetria()
    .then((distritos) => {
      list.innerHTML = renderAltimetria(distritos);
    })
    .catch((err: unknown) => {
      list.textContent = 'Altimetría no disponible';
      console.error('Fallo al cargar altimetría:', err);
    });
}

// ---------------------------------------------------------------------------
// Caja 2 — Lluvia y viento por distrito (modelo) + pluviómetros reales (medido)
// ---------------------------------------------------------------------------

export function montarMeteoZonaPanel(): void {
  const root = document.createElement('div');
  root.id = 'meteo-zona-panel';
  root.hidden = true;
  root.innerHTML = `
    <div class="media-panel__header">Lluvia y viento por distrito</div>
    <p class="cordon-intro">Por distrito es un modelo (Open-Meteo), no una estación real; los pluviómetros SAIH y las estaciones AVAMET de abajo sí son dato medido. Sin dato de "capacidad de absorción del terreno" — no existe una fuente oficial para eso, no se inventa una estimación (spec 044 §7).</p>
    <div class="emergencia-meteo__bloque">
      <div class="emergencia-meteo__subtitulo">Por distrito (modelo)</div>
      <div id="emergencia-meteo-zona-list"></div>
      <div class="info-panel__meta" id="emergencia-meteo-zona-meta"></div>
    </div>
    <div class="emergencia-meteo__bloque">
      <div class="emergencia-meteo__subtitulo">Pluviómetros reales cerca de Valencia (SAIH Júcar)</div>
      <div id="emergencia-pluviometros-list"></div>
      <div class="info-panel__meta" id="emergencia-pluviometros-meta"></div>
    </div>
    <div class="emergencia-meteo__bloque">
      <div class="emergencia-meteo__subtitulo">Temperatura y lluvia por zona — estaciones reales (AVAMET)</div>
      <div id="emergencia-avamet-list"></div>
      <div class="info-panel__meta" id="emergencia-avamet-meta"></div>
    </div>
    <div class="emergencia-meteo__bloque">
      <div class="emergencia-meteo__subtitulo">Riesgo de acumulación de agua (imbornales × lluvia) — spec 046</div>
      <p class="cordon-intro">${escapeHtml(ADVERTENCIA_RIESGO_ESCORRENTIA)}</p>
      <div id="emergencia-escorrentia-list"></div>
      <div class="info-panel__meta" id="emergencia-escorrentia-meta"></div>
    </div>
  `;
  document.body.appendChild(root);

  const meteoZonaList = root.querySelector('#emergencia-meteo-zona-list')!;
  const pluviometrosList = root.querySelector('#emergencia-pluviometros-list')!;
  const avametList = root.querySelector('#emergencia-avamet-list')!;
  const escorrentiaList = root.querySelector('#emergencia-escorrentia-list')!;

  async function refrescarMeteoZona(): Promise<void> {
    try {
      const { distritos, fresh } = await fetchMeteoZona();
      meteoZonaList.innerHTML = renderMeteoZona(distritos);
      root.querySelector('#emergencia-meteo-zona-meta')!.innerHTML = metaFrescura('Open-Meteo (modelo)', new Date().toISOString(), fresh);
    } catch (err) {
      meteoZonaList.textContent = 'Lluvia/viento por distrito no disponible';
      console.error('Fallo al cargar lluvia/viento por distrito:', err);
    }
  }

  async function refrescarPluviometros(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchPluviometros();
      pluviometrosList.innerHTML = renderPluviometros(estaciones);
      root.querySelector('#emergencia-pluviometros-meta')!.innerHTML = metaFrescura('SAIH Júcar (medido)', new Date().toISOString(), fresh);
    } catch (err) {
      pluviometrosList.textContent = 'Pluviómetros no disponibles';
      console.error('Fallo al cargar pluviómetros:', err);
    }
  }

  async function refrescarAvamet(): Promise<void> {
    try {
      const { estaciones, fresh } = await fetchAvamet();
      avametList.innerHTML = renderAvamet(estaciones);
      root.querySelector('#emergencia-avamet-meta')!.innerHTML = metaFrescura('AVAMET (medido)', new Date().toISOString(), fresh);
    } catch (err) {
      avametList.textContent = 'Estaciones AVAMET no disponibles';
      console.error('Fallo al cargar estaciones AVAMET:', err);
    }
  }

  async function refrescarEscorrentia(): Promise<void> {
    try {
      const { distritos, fresh } = await fetchRiesgoEscorrentia();
      escorrentiaList.innerHTML = renderRiesgoEscorrentia(distritos);
      root.querySelector('#emergencia-escorrentia-meta')!.innerHTML = metaFrescura(
        'Geoportal (imbornales) + Open-Meteo (lluvia)',
        new Date().toISOString(),
        fresh,
      );
    } catch (err) {
      escorrentiaList.textContent = 'Riesgo de acumulación de agua no disponible';
      console.error('Fallo al cargar riesgo de escorrentía:', err);
    }
  }

  startPolling(refrescarMeteoZona, 15 * 60 * 1000);
  startPolling(refrescarPluviometros, 15 * 60 * 1000);
  startPolling(refrescarAvamet, 15 * 60 * 1000);
  startPolling(refrescarEscorrentia, 15 * 60 * 1000); // misma cadencia que meteo-zona — el único término dinámico es la lluvia
}
