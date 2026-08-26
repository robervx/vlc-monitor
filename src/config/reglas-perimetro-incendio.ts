/**
 * Tabla de reglas de perímetro para incendio — spec 021 §2-§3.
 *
 * LEER ANTES DE TOCAR ESTE FICHERO: ninguna fila de esta tabla es una cifra
 * normativa cerrada. La investigación de spec 021 §2 confirmó que NINGUNA
 * fuente oficial española cubre directamente ninguno de los 6 subtipos de
 * esta tabla para "radio de cordón operativo" (el RD 1196/2003 es de riesgo
 * químico, el ITC.SP 147:2024 excluye explícitamente vía pública, la guía UK
 * confirma que un incendio estructural no tiene tabla fija). Por eso:
 *
 * - `confianza: 'referenciaInternacional'` se usa solo donde hay una fuente
 *   real citada aunque no sea española (vehículo eléctrico/híbrido, ERG 2024
 *   Guía 147).
 * - `confianza: 'estimacionPendienteValidar'` es el resto — puntos de partida
 *   razonados (ver comentario en cada bloque), siempre el valor más
 *   conservador disponible, nunca el más ajustado. Bloqueante para `Approved`
 *   (spec 021 §7): contraste con el Consorcio Provincial de Bombers de
 *   València antes de tratar cualquiera de estas cifras como fiable.
 *
 * Añadido durante la implementación, no estaba en la investigación original
 * de spec 021 §2: 'vehiculoCombustion' (coche de combustión ardiendo) TAMPOCO
 * tiene fuente citada en esa investigación — es un hueco adicional al que ya
 * señalaba la spec, tratado aquí con el mismo criterio conservador, no con
 * más confianza de la que realmente tiene.
 */
import type { Incidente } from '../services/cordon-incidente';

export interface ReglaPerimetro {
  subtipo: Incidente['subtipo'];
  intensidad: Incidente['intensidad'];
  radioAreaIntervencionM: number;
  radioAreaSocorroM: number;
  fuenteId: string;
  confianza: 'oficialVerificada' | 'referenciaInternacional' | 'estimacionPendienteValidar';
}

export interface FuenteRegla {
  id: string;
  descripcion: string;
  url?: string;
}

// Trazabilidad a la tabla de spec 021 §2 — cada fuenteId de abajo debe
// resolver aquí.
export const FUENTES_REGLAS: Record<string, FuenteRegla> = {
  'doctrina-pemu': {
    id: 'doctrina-pemu',
    descripcion:
      'Doctrina de Plan de Emergencia Municipal (tres zonas operativas) — confirmada contra varios PEMU municipales reales publicados',
  },
  'itc-sp-147-2024': {
    id: 'itc-sp-147-2024',
    descripcion: 'ITC.SP 147:2024, Bombers Generalitat de Catalunya — aparcamientos con IRVE (excluye vía pública)',
    url: 'https://interior.gencat.cat',
  },
  'doc-conjunto-bomberos-2025': {
    id: 'doc-conjunto-bomberos-2025',
    descripcion:
      'Recomendaciones de seguridad contra incendios en aparcamientos VE/híbridos v02 (2025-09-04) — coautoría Ayto. de Valencia',
  },
  'erg-2024-guia-147': {
    id: 'erg-2024-guia-147',
    descripcion: 'Emergency Response Guidebook 2024, Guía 147 (US DOT/NOAA CAMEO) — baterías de litio dañadas',
    url: 'https://cameochemicals.noaa.gov/erg_guides/en/Guide_147.pdf',
  },
  'uk-nog-incendio-estructural': {
    id: 'uk-nog-incendio-estructural',
    descripcion: 'UK National Operational Guidance, incendio estructural — confirma ausencia de cifra fija',
  },
  'gap-vehiculo-combustion-sin-fuente': {
    id: 'gap-vehiculo-combustion-sin-fuente',
    descripcion:
      'Sin fuente citada en la investigación de spec 021 §2 — hueco adicional detectado en implementación, no en la investigación original',
  },
  'gap-edificio-sin-formula-plantas': {
    id: 'gap-edificio-sin-formula-plantas',
    descripcion:
      'Sin fórmula de escalado por nº de plantas en ninguna fuente revisada (spec 021 §2) — v1 no aplica ajuste por planta, solo por subtipo/intensidad',
  },
};

function regla(
  subtipo: ReglaPerimetro['subtipo'],
  intensidad: ReglaPerimetro['intensidad'],
  radioAreaIntervencionM: number,
  radioAreaSocorroM: number,
  fuenteId: string,
  confianza: ReglaPerimetro['confianza'],
): ReglaPerimetro {
  return { subtipo, intensidad, radioAreaIntervencionM, radioAreaSocorroM, fuenteId, confianza };
}

export const REGLAS_PERIMETRO: ReglaPerimetro[] = [
  // vivienda / bajoLocal — construcción baja, calles a menudo estrechas
  // (Ciutat Vella). Sin fuente de cordón operativo (ver cabecera); PEMU da
  // solo el nombre de los anillos, no la cifra.
  regla('vivienda', 'conato', 10, 25, 'doctrina-pemu', 'estimacionPendienteValidar'),
  regla('vivienda', 'incendioControlado', 15, 40, 'doctrina-pemu', 'estimacionPendienteValidar'),
  regla('vivienda', 'incendioGeneralizado', 20, 60, 'gap-edificio-sin-formula-plantas', 'estimacionPendienteValidar'),
  regla('bajoLocal', 'conato', 10, 25, 'doctrina-pemu', 'estimacionPendienteValidar'),
  regla('bajoLocal', 'incendioControlado', 15, 40, 'doctrina-pemu', 'estimacionPendienteValidar'),
  regla('bajoLocal', 'incendioGeneralizado', 20, 60, 'gap-edificio-sin-formula-plantas', 'estimacionPendienteValidar'),

  // edificio — más plantas de media que 'vivienda' unifamiliar, más riesgo
  // de desprendimiento (razón que da la propia guía UK NOG para no fijar un
  // número — se usa un radio algo mayor que 'vivienda' por ese motivo, no
  // por ninguna fórmula real de plantas).
  regla('edificio', 'conato', 15, 30, 'doctrina-pemu', 'estimacionPendienteValidar'),
  regla('edificio', 'incendioControlado', 20, 50, 'uk-nog-incendio-estructural', 'estimacionPendienteValidar'),
  regla('edificio', 'incendioGeneralizado', 30, 80, 'uk-nog-incendio-estructural', 'estimacionPendienteValidar'),

  // garajeAparcamiento — las cifras de ITC.SP 147/doc conjunto son
  // separación interna entre vehículos (≥4,5m) y extracción de humos
  // (≤5m), NO un radio de cordón exterior — no se reutilizan como si fueran
  // lo mismo (sería mezclar categorías distintas). Se usan solo como señal
  // de que el fuego puede afectar a varios vehículos a la vez, de ahí un
  // radio de partida mayor que un único vehículo suelto.
  regla('garajeAparcamiento', 'conato', 15, 30, 'itc-sp-147-2024', 'estimacionPendienteValidar'),
  regla('garajeAparcamiento', 'incendioControlado', 20, 50, 'itc-sp-147-2024', 'estimacionPendienteValidar'),
  regla('garajeAparcamiento', 'incendioGeneralizado', 30, 80, 'doc-conjunto-bomberos-2025', 'estimacionPendienteValidar'),

  // vehiculoCombustion — hueco sin fuente (ver cabecera del fichero).
  regla('vehiculoCombustion', 'conato', 10, 25, 'gap-vehiculo-combustion-sin-fuente', 'estimacionPendienteValidar'),
  regla('vehiculoCombustion', 'incendioControlado', 15, 40, 'gap-vehiculo-combustion-sin-fuente', 'estimacionPendienteValidar'),
  regla('vehiculoCombustion', 'incendioGeneralizado', 25, 60, 'gap-vehiculo-combustion-sin-fuente', 'estimacionPendienteValidar'),

  // vehiculoElectricoHibrido — único subtipo con una fuente internacional
  // real y directamente relevante: ERG 2024 Guía 147 fija 25m de
  // aislamiento en todas direcciones para batería dañada/con fuga. Se usa
  // como Área de Intervención fija en las 3 intensidades (el riesgo de
  // reignición de una batería de litio no baja aunque el fuego "esté
  // controlado" — es la razón documentada de por qué muchos protocolos
  // vigilan estos vehículos horas después de apagados) y el Área de Socorro
  // escala con la intensidad.
  regla('vehiculoElectricoHibrido', 'conato', 25, 50, 'erg-2024-guia-147', 'referenciaInternacional'),
  regla('vehiculoElectricoHibrido', 'incendioControlado', 25, 75, 'erg-2024-guia-147', 'referenciaInternacional'),
  regla('vehiculoElectricoHibrido', 'incendioGeneralizado', 25, 100, 'erg-2024-guia-147', 'referenciaInternacional'),
];

export function buscarRegla(
  subtipo: ReglaPerimetro['subtipo'],
  intensidad: ReglaPerimetro['intensidad'],
): ReglaPerimetro | null {
  return REGLAS_PERIMETRO.find((r) => r.subtipo === subtipo && r.intensidad === intensidad) ?? null;
}
