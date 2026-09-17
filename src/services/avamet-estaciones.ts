/**
 * Estaciones meteorológicas reales de AVAMET (Associació Valenciana de
 * Meteorologia) dentro de Valencia ciudad — spec 044 v4. Resuelve el
 * bloqueante que quedaba abierto desde spec 044 v2 ("no se ha localizado
 * todavía el lat/lon de cada estación"): la página `mxo-mxo.php?territori=c15`
 * embebe un array `data` en el HTML (verificado en vivo el 2026-09-17) con
 * lat/lon, temperatura, humedad, viento y precipitación (día/mes/año) por
 * estación — no hace falta ninguna página aparte para la lluvia
 * (`mxo-mxo-prec.php`), el mismo array ya la trae.
 *
 * AVAMET ya es fuente del proyecto (spec 039, widgets institucionales) —
 * reutilizarla aquí es coherencia añadida, no una fuente nueva sin
 * precedente. `robots.txt` permisivo (solo excluye `/_mxarxa/`, `/_gestor/`).
 */

export interface EstacionAvametCruda {
  esta: string;
  muni: string;
  dess: string;
  ptda: string;
  msnm: string;
  lati: string;
  logi: string;
  temp: string;
  temp_min: string;
  temp_max: string;
  hrel: string;
  vent: string;
  vent_dir: string;
  vent_max: string;
  prec: string;
  prec_mes: string;
  prec_any: string;
  data_ini: string;
}

export interface EstacionAvamet {
  id: string;
  nombre: string;
  altitudM: number;
  lat: number;
  lon: number;
  temperaturaC: number;
  temperaturaMinC: number;
  temperaturaMaxC: number;
  humedadPct: number;
  vientoKmh: number;
  vientoDireccion: string;
  vientoMaxKmh: number;
  precipitacionDiaMm: number;
  precipitacionMesMm: number;
  precipitacionAnyMm: number;
  observadoEn: string; // ISO 8601
}

/** El HTML trae un puñado de entidades HTML numéricas/nombradas en los nombres (à, ó, ú, ñ, apóstrofe). */
function decodeEntidadesHtml(texto: string): string {
  const tabla: Record<string, string> = {
    '&egrave;': 'è',
    '&eacute;': 'é',
    '&agrave;': 'à',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&iacute;': 'í',
    '&ntilde;': 'ñ',
    '&#039;': "'",
    '&amp;': '&',
};
  return texto.replace(/&[a-z#0-9]+;/gi, (m) => tabla[m] ?? m);
}

function numero(texto: string): number {
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** "DD/MM/YYYY HH:mm" → ISO 8601 (hora local España, se aproxima sin gestionar el cambio de horario explícitamente). */
function parsearFechaAvamet(texto: string): string {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, d, mo, y, hh, mm] = m;
  return new Date(`${y}-${mo}-${d}T${hh}:${mm}:00`).toISOString();
}

/** Normaliza el array crudo — descarta estaciones sin coordenada válida (defensa, no visto en los datos reales). */
export function normalizarEstacionesAvamet(crudas: EstacionAvametCruda[]): EstacionAvamet[] {
  const resultado: EstacionAvamet[] = [];
  for (const c of crudas) {
    const lat = numero(c.lati);
    const lon = numero(c.logi);
    if (lat === 0 || lon === 0) continue;
    const nombre = [c.ptda, c.dess].map((s) => decodeEntidadesHtml(s.trim())).filter((s) => s.length > 0).join(' — ');
    resultado.push({
      id: c.esta,
      nombre: nombre || decodeEntidadesHtml(c.dess.trim()),
      altitudM: numero(c.msnm),
      lat,
      lon,
      temperaturaC: numero(c.temp),
      temperaturaMinC: numero(c.temp_min),
      temperaturaMaxC: numero(c.temp_max),
      humedadPct: numero(c.hrel),
      vientoKmh: numero(c.vent),
      vientoDireccion: c.vent_dir,
      vientoMaxKmh: numero(c.vent_max),
      precipitacionDiaMm: numero(c.prec),
      precipitacionMesMm: numero(c.prec_mes),
      precipitacionAnyMm: numero(c.prec_any),
      observadoEn: parsearFechaAvamet(c.data_ini),
    });
  }
  return resultado;
}
