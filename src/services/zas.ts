// Zonas Acústicamente Saturadas (ZAS) — spec 049. Dos entidades sin geometría
// compartida (ver spec §2/§7): los polígonos de zona ya declarados en el
// geoportal (seed estático, 5 zonas — Russafa todavía no está publicada ahí)
// y los sonómetros diarios de Russafa (16 calles, sin lat/lon verificada, se
// tratan como lista con dirección, nunca como puntos de mapa fabricados).

export interface ZonaZas {
  id: string;
  nombre: string;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  observedAt: string;
  fetchedAt: string;
  source: 'geoportal-valencia-zas';
}

export interface SonometroRuzafa {
  id: string;
  direccion: string;
  laeqDb: number;
  laeqDiaDb: number | null;
  laeqTardeDb: number | null;
  laeqNocheDb: number | null;
  laeqLdenDb: number | null;
  fecha: string;
  observedAt: string;
  fetchedAt: string;
  source: 'vlci-sonometros-ruzafa';
}

export interface PanelZas {
  zonas: ZonaZas[];
  sonometrosRuzafa: SonometroRuzafa[];
  fetchedAt: string;
  source: 'vlc-monitor-zas';
}

// Catálogo curado de los 16 sonómetros de Russafa — verificado en vivo el
// 2026-09-24 contra el catálogo de datos abiertos del Ayuntamiento (buscar
// "soroll russafa" en opendata.vlci.valencia.es). Sin lat/lon publicada, ver
// spec 049 §7 — no se geocodifica de pasada.
export const SONOMETROS_RUZAFA: ReadonlyArray<{ id: string; direccion: string }> = [
  { id: 'T248671', direccion: 'C/ Cádiz, 16' },
  { id: 'T248655', direccion: 'C/ Cádiz, 3' },
  { id: 'T248682', direccion: 'C/ Cuba, 3' },
  { id: 'T248683', direccion: 'C/ Sueca, 2' },
  { id: 'T248684', direccion: 'C/ Sueca, 61' },
  { id: 'T248680', direccion: 'C/ Sueca, 32' },
  { id: 'T248678', direccion: 'C/ Carles Cervera, 34' },
  { id: 'T248672', direccion: 'C/ Puerto Rico, 21' },
  { id: 'T248669', direccion: 'C/ Doctor Serrano, 21' },
  { id: 'T248652', direccion: 'C/ Sueca esq. Denia' },
  { id: 'T248677', direccion: 'C/ Vivons chaflán Cádiz' },
  { id: 'T251234', direccion: 'C/ Cura Femenía, 14' },
  { id: 'T248661', direccion: 'C/ General Prim chaflán Donoso Cortés' },
  { id: 'T248679', direccion: 'C/ Matías Perelló esq. Doctor Sumsi' },
  { id: 'T248676', direccion: 'C/ Salvador Abril chaflán Maestro José Serrano' },
  { id: 'T248670', direccion: 'C/ Carles Cervera chaflán Reina Doña María' },
];

function numeroONulo(valor: string | undefined): number | null {
  if (valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function quitarComillas(campo: string): string {
  return campo.trim().replace(/^"|"$/g, '');
}

/** La API (Pentaho CDA) devuelve las filas ordenadas por `recvtime` descendente — la primera fila de datos es la más reciente. */
function primeraFilaComoObjeto(csv: string): Record<string, string> | null {
  const lineas = csv.trim().split('\n');
  if (lineas.length < 2) return null;
  const cabeceras = lineas[0]!.split(';').map(quitarComillas);
  const valores = lineas[1]!.split(';').map(quitarComillas);
  const fila: Record<string, string> = {};
  cabeceras.forEach((c, i) => {
    fila[c] = valores[i] ?? '';
  });
  return fila;
}

/** `null` si el CSV no trae ninguna fila de datos (sensor sin lecturas) o el campo `laeq` no es un número. */
export function normalizarSonometroRuzafa(
  id: string,
  direccion: string,
  csv: string,
  fetchedAt: string,
): SonometroRuzafa | null {
  const fila = primeraFilaComoObjeto(csv);
  if (!fila) return null;
  const laeqDb = numeroONulo(fila.laeq);
  if (laeqDb === null) return null;
  const fecha = fila.dateobserved ?? '';
  const observedAt = fecha && !Number.isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : fetchedAt;
  return {
    id,
    direccion,
    laeqDb,
    laeqDiaDb: numeroONulo(fila.laeq_d),
    laeqTardeDb: numeroONulo(fila.laeq_e),
    laeqNocheDb: numeroONulo(fila.laeq_n),
    laeqLdenDb: numeroONulo(fila.laeq_den),
    fecha,
    observedAt,
    fetchedAt,
    source: 'vlci-sonometros-ruzafa',
  };
}

interface FeatureZasCruda {
  type: 'Feature';
  properties: { objectid: number; zona: string };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

/** Para el seed — convierte la respuesta cruda del geoportal (GeoJSON, `f=geojson`) al contrato de la spec. */
export function normalizarZonasZas(features: FeatureZasCruda[], fetchedAt: string): ZonaZas[] {
  return features.map((f) => ({
    id: String(f.properties.objectid),
    nombre: f.properties.zona,
    geometry: f.geometry,
    observedAt: fetchedAt,
    fetchedAt,
    source: 'geoportal-valencia-zas',
  }));
}
