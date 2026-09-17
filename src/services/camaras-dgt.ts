/**
 * Cámaras urbanas externas — spec 043 (specs/043-camaras-urbanas-externas.md): red
 * viaria que rodea Valencia (rondas, autovías de acceso), separadas de las cámaras
 * internas de spec 038.
 *
 * Fuente: DGT, dataset "Cámaras DGT DATEX2 v3.7" (`nap.dgt.es/dataset/camaras-dgt-datex2-v3-7`),
 * licencia **Creative Commons Attribution**, gratuito — verificado en vivo el 2026-09-17.
 * El JSON que se consume aquí (`dgt.es/.content/.assets/json/camaras.json`) es el mismo feed
 * que alimenta la propia página pública de cámaras de dgt.es
 * (`conoce-el-estado-del-trafico/camaras-de-trafico`) — mismo dato oficial, más simple de
 * parsear que el XML DATEX2 formal referenciado en el catálogo NAP. Imagen JPEG estática que
 * se refresca cada ~2 min (`cache-control: max-age=120`, verificado con `curl`), sin
 * hotlinking ni CORS bloqueado.
 *
 * Funciones puras — la llamada de red real vive en `scripts/seed-camaras-dgt.ts`.
 */

export interface CamaraCrudaDgt {
  id: string;
  carretera: string;
  pk: string;
  sentido: string;
  latitud: string;
  longitud: string;
  imagen: string;
  provincia: string;
}

export interface CamaraExternaDgt {
  id: string;
  carretera: string;
  pk: string;
  sentido: string;
  lat: number;
  lon: number;
  imagenUrl: string;
}

const VALENCIA_LAT = 39.4699;
const VALENCIA_LON = -0.3763;
/** Cubre las rondas (V-30/21/31/15/23) y las autovías de acceso inmediato (A-3/A-7/AP-7,
 * CV-30/33/36/365/410/500) sin extenderse a toda la provincia (que llega hasta Requena/Utiel,
 * a ~80 km) — verificado con los datos reales de la fuente, spec 043 §2. */
const RADIO_KM = 20;
const PROVINCIA_VALENCIA = '46';

/** El feed tiene entradas mal formateadas (coma inicial, coma como separador decimal en vez de punto) — se normalizan o se descartan si no quedan como número válido. */
function parseCoordenada(bruto: string): number | null {
  const limpio = bruto.trim().replace(/^,+/, '').replace(',', '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Filtra a la provincia de Valencia + radio alrededor de la ciudad, descartando coordenadas ilegibles (spec 043 §2). */
export function normalizarCamarasDgt(crudas: CamaraCrudaDgt[]): CamaraExternaDgt[] {
  const resultado: CamaraExternaDgt[] = [];
  for (const c of crudas) {
    if (c.provincia !== PROVINCIA_VALENCIA) continue;
    const lat = parseCoordenada(c.latitud);
    const lon = parseCoordenada(c.longitud);
    if (lat === null || lon === null) continue;
    if (haversineKm(VALENCIA_LAT, VALENCIA_LON, lat, lon) > RADIO_KM) continue;
    resultado.push({ id: c.id, carretera: c.carretera, pk: c.pk, sentido: c.sentido, lat, lon, imagenUrl: c.imagen });
  }
  return resultado;
}

export interface GrupoCarretera {
  carretera: string;
  camaras: CamaraExternaDgt[];
}

function pkNumerico(pk: string): number {
  const n = Number(pk.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** Agrupa por carretera (orden alfabético) y ordena cada grupo por punto kilométrico. */
export function agruparPorCarretera(camaras: CamaraExternaDgt[]): GrupoCarretera[] {
  const grupos = new Map<string, CamaraExternaDgt[]>();
  for (const c of camaras) {
    const arr = grupos.get(c.carretera) ?? [];
    arr.push(c);
    grupos.set(c.carretera, arr);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([carretera, camarasGrupo]) => ({
      carretera,
      camaras: [...camarasGrupo].sort((a, b) => pkNumerico(a.pk) - pkNumerico(b.pk)),
    }));
}
