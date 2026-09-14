/**
 * Registro de cámaras urbanas en directo — spec 038 v3. Sin backend: son embeds
 * de terceros que el navegador reproduce directamente desde el proveedor (nunca
 * se graba ni se rehostea nada). Mismo patrón `def()` que `map-layer-definitions.ts`,
 * sin pipeline seed→caché→endpoint porque no hay dato que normalizar.
 *
 * Categorías (`ADR-003`, `docs/decisiones/ADR-003-capas-publicas-vs-personales.md`):
 *  - 'publica'  → activa siempre, mecanismo de embebido explícitamente autorizado
 *                 por la propia plataforma (embed de canal en directo de YouTube).
 *  - 'personal' → técnicamente accesible pero sin permiso escrito de reuso; solo
 *                 se activa si quien despliega define su propio `envFlag`
 *                 (`VITE_<NOMBRE>`, prefijo obligatorio de Vite para llegar al
 *                 bundle de cliente). Nunca encendida por defecto en el repo público.
 *
 * v3 — lección de v2: un ID de vídeo concreto de YouTube no es estable (el directo
 * de v2 había terminado, el vídeo era una grabación de 2022). Se usa en su lugar
 * el embed de **canal** (`youtube.com/embed/live_stream?channel=<id>`), que
 * siempre resuelve al directo que esté activo ahora mismo en ese canal — o no
 * reproduce nada si no hay ninguno, nunca contenido viejo.
 */

export type ProveedorCamara = 'youtube-canal' | 'turisme-cv-dash';

export interface CamaraUrbana {
  id: string;
  nombre: string;
  proveedor: ProveedorCamara;
  categoria: 'publica' | 'personal';
  /** Solo si categoria === 'personal'. Nombre de la variable VITE_* que la activa. */
  envFlag?: string;
  /** Solo proveedor 'youtube-canal' — id de canal, no de vídeo (ver nota v3). */
  youtubeChannelId?: string;
  /** Solo proveedor 'turisme-cv-dash'. */
  manifestUrl?: string;
  atribucion: string;
  fuenteUrl: string;
}

export const CAMARAS_URBANAS: CamaraUrbana[] = [
  {
    id: 'youtube-wolkam-plaza',
    nombre: 'Plaça de l’Ajuntament',
    proveedor: 'youtube-canal',
    categoria: 'publica',
    // Canal "Wolkam IT" — verificado en vivo el 2026-09-14 (isLiveNow:true en su
    // vídeo activo de ese momento). Al ser amateur/monetizado con publicidad,
    // no hay garantía de disponibilidad continua — de ahí el fallback de la UI.
    youtubeChannelId: 'UCq19Y98jvY_Tjgm6QMk6vWA',
    atribucion: 'Wolkam IT · YouTube',
    fuenteUrl: 'https://www.youtube.com/channel/UCq19Y98jvY_Tjgm6QMk6vWA/live',
  },
  {
    id: 'turisme-cv-plaza-ayuntamiento',
    nombre: 'Plaça de l’Ajuntament (HD)',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaPlazaAyuntamiento/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/es/valencia/valencia/webcams/valencia-plaza-ayuntamiento',
  },
  {
    id: 'turisme-cv-las-arenas',
    nombre: 'Les Arenes / Ciutat de les Arts',
    proveedor: 'turisme-cv-dash',
    categoria: 'personal',
    envFlag: 'VITE_PERSONAL_CAMARA_TURISME_CV',
    // Nota: la página de Turisme CV para "Ciutat de les Arts i les Ciències"
    // sirve este mismo stream con id "ValenciaLasArenas" (verificado en el HTML
    // real, elemento #featured-webcam-visor) — probablemente la cámara está en
    // el paseo de Les Arenes con vista hacia el complejo, no es un error nuestro.
    manifestUrl: 'https://streaming.comunitatvalenciana.com/webcam/ValenciaLasArenas/manifest.mpd',
    atribucion: 'Xarxa de Webcams — Turisme Comunitat Valenciana',
    fuenteUrl: 'https://www.comunitatvalenciana.com/en/valencia/valencia/webcams/valencia-ciutat-de-les-arts-y-les-ciencies',
  },
];

function flagPersonalActiva(envFlag: string): boolean {
  const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
  const valor = env[envFlag];
  return valor !== undefined && valor !== '' && valor !== 'false' && valor !== false;
}

/** Cámaras que corresponde mostrar en esta build: públicas siempre, personales solo con su `envFlag`. */
export function camarasVisibles(): CamaraUrbana[] {
  return CAMARAS_URBANAS.filter((c) => {
    if (c.categoria === 'publica') return true;
    return c.envFlag !== undefined && flagPersonalActiva(c.envFlag);
  });
}
