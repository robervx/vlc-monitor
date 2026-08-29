// Lógica pura del bottom sheet de paneles en móvil — spec 029 §3.
// (El controlador de DOM/gestos está en layout-movil.ts.)

export type EstadoSheet = 'oculto' | 'medio' | 'expandido';

export const ESTADOS_SHEET: readonly EstadoSheet[] = ['oculto', 'medio', 'expandido'];

/** Altura visible de cada estado como fracción de la altura de la ventana. */
export const FRACCION_SHEET: Record<EstadoSheet, number> = {
  oculto: 0,
  medio: 0.42,
  expandido: 0.86,
};

/** Estado cuya altura está más cerca de `fraccion` (0..1). */
export function estadoMasCercano(fraccion: number): EstadoSheet {
  let mejor: EstadoSheet = 'oculto';
  let dist = Number.POSITIVE_INFINITY;
  for (const e of ESTADOS_SHEET) {
    const d = Math.abs(FRACCION_SHEET[e] - fraccion);
    if (d < dist) {
      dist = d;
      mejor = e;
    }
  }
  return mejor;
}

/** Siguiente estado al pulsar el tirador (ciclo oculto → medio → expandido → oculto). */
export function siguienteEstado(actual: EstadoSheet): EstadoSheet {
  const i = ESTADOS_SHEET.indexOf(actual);
  return ESTADOS_SHEET[(i + 1) % ESTADOS_SHEET.length] as EstadoSheet;
}

export function esEstadoSheet(v: unknown): v is EstadoSheet {
  return v === 'oculto' || v === 'medio' || v === 'expandido';
}
