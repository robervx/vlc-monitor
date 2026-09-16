/**
 * Panel de apoyo a decisión operativa — spec 041 (specs/041-panel-apoyo-decision.md).
 * Función pura, sin red: traduce los escenarios de conjunción ya calculados
 * por `pulso-escenarios.ts` (spec 010, compartido con el motor de insights
 * de spec 013) en sugerencias de texto, siempre en condicional ("valorar",
 * "podría convenir") — nunca una orden ni una acción ejecutable (§0,
 * CLAUDE.md §4). Ningún dato ni modelo estadístico nuevo — mismo principio
 * que spec 024.
 */
import type { PulsoDistrito, EscenarioActivo, IdEscenario } from './pulso-escenarios';

export interface SugerenciaOperativa {
  id: string;
  distrito?: string;
  calle?: string;
  señalesCombinadas: string[];
  resumen: string;
  sugerenciaTexto: string;
  severidad: 'seguimiento' | 'prioritario';
  generadaEn: string;
  fuenteSpec: string[];
  /**
   * Elaboración deliberada sobre el contrato mínimo de spec 041 §3 (mismo
   * espíritu que `EstadoEscenario` en pulso-escenarios.ts): sin un punto real
   * no hay forma de que "Ver en el mapa" (§5, "reutiliza la misma instancia
   * de mapa para marcar la zona señalada") centre en algo que no sea el
   * centro de la ciudad. Viene directo de `centroideAfectado` del escenario
   * de origen — nunca un punto inventado.
   */
  centroide: [number, number];
}

const SEÑALES_POR_ESCENARIO: Record<IdEscenario, string[]> = {
  'incidencia-sobre-trafico-denso': ['incidencia-via-publica', 'trafico-denso'],
  'fallas-y-trafico': ['zona-fallas', 'trafico-denso'],
  'lluvia-inminente-sobre-trafico-denso': ['lluvia-inminente', 'trafico-denso'],
};

// Mismo mapeo que FUENTES_POR_ESCENARIO de insights.ts (spec 013) — '010'
// siempre presente porque el evaluador consolidado es su fuente directa.
const FUENTES_POR_ESCENARIO: Record<IdEscenario, string[]> = {
  'incidencia-sobre-trafico-denso': ['010', '004', '026'],
  'fallas-y-trafico': ['010', '004', '008'],
  'lluvia-inminente-sobre-trafico-denso': ['010', '004', '016'],
};

function calleDe(escenario: EscenarioActivo): string | undefined {
  return escenario.tramosAfectados[0]?.nombre || undefined;
}

/** Siempre en condicional (§7) — nunca "enviar"/"cortar", solo "valorar"/"podría convenir". */
function sugerenciaTextoPara(escenario: EscenarioActivo, distritoNombre: string): string {
  const calle = calleDe(escenario);
  const dondeCalle = calle ? `${calle} (${distritoNombre})` : distritoNombre;
  switch (escenario.id) {
    case 'incidencia-sobre-trafico-denso':
      return `Podría convenir valorar reforzar la regulación de tráfico en ${dondeCalle}, donde hay una incidencia coincidiendo con tráfico ya denso.`;
    case 'fallas-y-trafico':
      return `Podría convenir valorar reforzar la zona de Fallas en ${distritoNombre}, donde la zona de movilidad reducida coincide con tráfico ya denso.`;
    case 'lluvia-inminente-sobre-trafico-denso':
      return `Podría convenir valorar preposicionar unidades cerca de ${dondeCalle} ante la lluvia prevista, que coincide con tráfico ya denso en la zona.`;
  }
}

function sugerenciaDeEscenario(
  distrito: PulsoDistrito,
  escenario: EscenarioActivo,
  generadaEn: string,
): SugerenciaOperativa {
  return {
    id: `${distrito.distritoCodigo}:${escenario.id}`,
    distrito: distrito.distritoNombre,
    calle: calleDe(escenario),
    señalesCombinadas: SEÑALES_POR_ESCENARIO[escenario.id],
    resumen: escenario.motivo,
    sugerenciaTexto: sugerenciaTextoPara(escenario, distrito.distritoNombre),
    severidad: escenario.nivel,
    generadaEn,
    fuenteSpec: FUENTES_POR_ESCENARIO[escenario.id],
    centroide: escenario.centroideAfectado,
  };
}

/**
 * Solo escenarios `modo: 'vivo'` y `confirmado` (mismo gate que usan spec 010
 * v4 para el choropleth e `insightsPulsoDistrito` de spec 013 — un escenario
 * en modo sombra o sin confirmar no genera sugerencia, spec 010 §10.3).
 */
export function calcularSugerencias(distritos: PulsoDistrito[], generadaEn: string): SugerenciaOperativa[] {
  const sugerencias: SugerenciaOperativa[] = [];
  for (const distrito of distritos) {
    for (const escenario of distrito.escenariosActivos) {
      if (escenario.modo !== 'vivo' || !escenario.confirmado) continue;
      sugerencias.push(sugerenciaDeEscenario(distrito, escenario, generadaEn));
    }
  }
  // Prioritario primero — es lo que más falta hace decidir (spec 041 §1).
  return sugerencias.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === 'prioritario' ? -1 : 1));
}
