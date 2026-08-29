/**
 * Registro único de capas del mapa. Patrón calcado de World Monitor
 * (ver docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md §3.1):
 * una capa = una entrada aquí, nunca lógica repartida en N sitios.
 *
 * Añadir una capa SIN una spec aprobada en specs/ está prohibido — ver
 * CLAUDE.md §2.
 */

export type RendererKind = 'deck' | 'panel'; // solo mapa plano — sin globo 3D, ver CLAUDE.md §5. 'panel' añadido en spec 009: no geoespacial, se renderiza como lista en la UI

export interface LayerDefinition {
  key: string;
  specId: string; // id de la spec en specs/ que define esta capa — trazabilidad obligatoria
  renderers: RendererKind[];
  zoomMinimo: number;
  agregacion: 'punto' | 'choropleth-distrito' | 'cluster' | 'linea' | 'lista'; // 'linea' (spec 004), 'lista' (spec 009, panel no geoespacial)
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
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'linea',
  },
  valenbisi: {
    key: 'valenbisi',
    specId: '005',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  aparcamiento: {
    key: 'aparcamiento',
    specId: '006',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  pulsoDistrito: {
    key: 'pulsoDistrito',
    specId: '010',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'choropleth-distrito',
  },
  fallas: {
    key: 'fallas',
    specId: '008',
    renderers: ['deck'],
    zoomMinimo: 0,
    agregacion: 'punto',
  },
  contextoMediatico: {
    key: 'contextoMediatico',
    specId: '009',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  tendenciaTerminos: {
    key: 'tendenciaTerminos',
    specId: '025',
    renderers: ['panel'],
    zoomMinimo: 0,
    agregacion: 'lista',
  },
  incidenciasViaPublica: {
    key: 'incidenciasViaPublica',
    specId: '026',
    renderers: ['deck'],
    zoomMinimo: 12, // solo a nivel calle — 499 puntos activos, satura el mapa a zoom de ciudad (spec 026 §5/§7)
    agregacion: 'punto',
  },
  //
  // No añadas entradas aquí sin que exista antes la spec correspondiente
  // en specs/, con su contrato de capa ya congelado (sección 5 de la spec).
};
