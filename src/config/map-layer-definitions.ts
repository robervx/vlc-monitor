/**
 * Registro único de capas del mapa. Patrón calcado de World Monitor
 * (ver docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md §3.1):
 * una capa = una entrada aquí, nunca lógica repartida en N sitios.
 *
 * Añadir una capa SIN una spec aprobada en specs/ está prohibido — ver
 * CLAUDE.md §2.
 */

export type RendererKind = 'deck' | 'panel'; // solo mapa plano — sin globo 3D, ver CLAUDE.md §5. 'panel' añadido en spec 009: no geoespacial, se renderiza como lista en la UI

/**
 * Grupo del selector de capas (spec 033). `primaria` = situación de la ciudad
 * ahora mismo (siempre visible, con acento). `contexto` = información de apoyo
 * (grupo plegable). Fuente de verdad única de la asignación.
 */
export type GrupoCapa = 'primaria' | 'contexto';

export interface LayerDefinition {
  key: string;
  specId: string; // id de la spec en specs/ que define esta capa — trazabilidad obligatoria
  renderers: RendererKind[];
  zoomMinimo: number;
  agregacion: 'punto' | 'choropleth-distrito' | 'cluster' | 'linea' | 'lista'; // 'linea' (spec 004), 'lista' (spec 009, panel no geoespacial)
  /** Grupo del selector — spec 033. `distritos` (capa base, no está en el selector) es el único sin grupo. */
  grupo?: GrupoCapa;
  /** Debe ser `true` mientras la fuente sea sintética — ver spec 003. */
  esMock?: boolean;
  /** Distintivo visual obligatorio en la UI mientras esMock sea true — ver spec 003 §5. */
  badge?: string;
}

export const LAYER_REGISTRY: Record<string, LayerDefinition> = {
  distritos: {
    key: 'distritos',
    specId: '000',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
  },
  movimientoPersonasMock: {
    key: 'movimientoPersonasMock',
    specId: '003',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
    esMock: true,
    badge: 'MOCK',
  },
  meteo: {
    key: 'meteo',
    specId: '001',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  calidadAire: {
    key: 'calidadAire',
    specId: '002',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  trafico: {
    key: 'trafico',
    specId: '004',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'linea',
  },
  valenbisi: {
    key: 'valenbisi',
    specId: '005',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  aparcamiento: {
    key: 'aparcamiento',
    specId: '006',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  pulsoDistrito: {
    key: 'pulsoDistrito',
    specId: '010',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
  },
  fallas: {
    key: 'fallas',
    specId: '008',
    grupo: 'contexto',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  contextoMediatico: {
    key: 'contextoMediatico',
    specId: '009',
    grupo: 'contexto',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  tendenciaTerminos: {
    key: 'tendenciaTerminos',
    specId: '025',
    grupo: 'contexto',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  incidenciasViaPublica: {
    key: 'incidenciasViaPublica',
    specId: '026',
    grupo: 'primaria',
    renderers: ['deck'],
    zoomMinimo: 12, // solo a nivel calle — 499 puntos activos, satura el mapa a zoom de ciudad (spec 026 §5/§7)
    agregacion: 'punto',
  },
  //
  // No añadas entradas aquí sin que exista antes la spec correspondiente
  // en specs/, con su contrato de capa ya congelado (sección 5 de la spec).
};
