/**
 * Registro de cámaras urbanas en directo — spec 038. Sin backend: son embeds de
 * terceros que el navegador reproduce directamente desde el proveedor (nunca se
 * graba ni se rehostea nada). Mismo patrón `def()` que `map-layer-definitions.ts`,
 * sin pipeline seed→caché→endpoint porque no hay dato que normalizar.
 *
 * Categorías (`ADR-003`, `docs/decisiones/ADR-003-capas-publicas-vs-personales.md`):
 *  - 'publica'  → activa siempre, mecanismo de embebido explícitamente autorizado
 *                 por la propia plataforma (embed oficial de YouTube).
 *  - 'personal' → técnicamente accesible pero sin permiso escrito de reuso; solo
 *                 se activa si quien despliega define su propio `envFlag`
 *                 (`VITE_<NOMBRE>`, prefijo obligatorio de Vite para llegar al
 *                 bundle de cliente). Nunca encendida por defecto en el repo público.
 */

export type ProveedorCamara = 'youtube' | 'turisme-cv-dash';

export interface CamaraUrbana {
  id: string;
  nombre: string;
  proveedor: ProveedorCamara;
  categoria: 'publica' | 'personal';
  /** Solo si categoria === 'personal'. Nombre de la variable VITE_* que la activa. */
  envFlag?: string;
  /** Solo proveedor 'youtube'. */
  embedId?: string;
  /** Solo proveedor 'turisme-cv-dash'. Reproducción aún no implementada — ver spec 038 §7. */
  manifestUrl?: string;
  atribucion: string;
  fuenteUrl: string;
}

export const CAMARAS_URBANAS: CamaraUrbana[] = [
  {
    id: 'youtube-valencia-directo',
    nombre: 'València en directo',
    proveedor: 'youtube',
    categoria: 'publica',
    embedId: 'smuCiyrSzio',
    atribucion: 'Wolkam IT · YouTube',
    fuenteUrl: 'https://www.youtube.com/watch?v=smuCiyrSzio',
  },
  {
    id: 'turisme-cv-plaza-ayuntamiento',
    nombre: 'Plaça de l’Ajuntament',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaPlazaAyuntamiento/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/es/valencia/valencia/webcams/valencia-plaza-ayuntamiento',
  },
];

/** Proveedores con reproductor implementado — ver spec 038 §7 (DASH pendiente). */
const PROVEEDORES_CON_REPRODUCTOR: ReadonlySet<ProveedorCamara> = new Set(['youtube']);

function flagPersonalActiva(envFlag: string): boolean {
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  const valor = env[envFlag];
  return valor !== undefined && valor !== '' && valor !== 'false' && valor !== false;
}

/**
 * Cámaras que corresponde mostrar en esta build: públicas siempre, personales
 * solo con su `envFlag` definido — y en ambos casos, solo si ya hay reproductor
 * implementado para su proveedor (spec 038 §7: DASH de Turisme CV es "personal"
 * en la spec pero todavía no tiene reproductor, así que hoy no se muestra ni
 * activando la variable).
 */
export function camarasVisibles(): CamaraUrbana[] {
  return CAMARAS_URBANAS.filter((c) => {
    if (!PROVEEDORES_CON_REPRODUCTOR.has(c.proveedor)) return false;
    if (c.categoria === 'publica') return true;
    return c.envFlag !== undefined && flagPersonalActiva(c.envFlag);
  });
}
