/**
 * Registro único de capas del mapa. Patrón calcado de World Monitor
 * (ver docs/investigacion/WORLDMONITOR_TEARDOWN_VLC_PROPUESTA.md §3.1):
 * una capa = una entrada aquí, nunca lógica repartida en N sitios.
 *
 * Añadir una capa SIN una spec aprobada en specs/ está prohibido — ver
 * CLAUDE.md §2.
 */

export type RendererKind = 'deck'; // solo mapa plano — sin globo 3D, ver CLAUDE.md §5

export interface LayerDefinition {
  key: string;
  specId: string; // id de la spec en specs/ que define esta capa — trazabilidad obligatoria
  renderers: RendererKind[];
  zoomMinimo: number;
  agregacion: 'punto' | 'choropleth-distrito' | 'cluster';
  /** Debe ser `true` mientras la fuente sea sintética — ver spec 003. */
  esMock?: boolean;
}

export const LAYER_REGISTRY: Record<string, LayerDefinition> = {
  // distritos: definida por la spec 000 — pendiente de implementar.
  // movimientoPersonasMock: definida por la spec 003 — pendiente de implementar.
  //
  // No añadas entradas aquí sin que exista antes la spec correspondiente
  // en specs/, con su contrato de capa ya congelado (sección 5 de la spec).
};
