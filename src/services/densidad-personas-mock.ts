/**
 * Generador sintético de la spec 003 (specs/003-capa-movimiento-personas-mock.md).
 * 100% determinista y local — nunca llama a ninguna fuente externa. Antes de
 * sustituir esto por datos reales, léase el guardarraíl obligatorio de la
 * spec 003 §2 (dato agregado, anonimizado en origen, con contrato comercial,
 * revisado por compliance) — sin excepción.
 */
import poblacionDistritos from '../../data/poblacion-distritos-valencia-2024.json' with { type: 'json' };

export interface DensidadDistritoMock {
  distritoCodigo: string;
  intensidad: number; // 0-1, normalizado
  horaSimulada: string; // HH:mm
  esSintetico: true;
  generatedAt: string; // ISO 8601
}

const POBLACION: Record<string, number> = poblacionDistritos.poblacionPorDistrito;
const MAX_POBLACION = Math.max(...Object.values(POBLACION));

/** Hash determinista de una cadena a un entero de 32 bits (djb2). */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0;
}

/** PRNG determinista (mulberry32) — mismo seed produce siempre el mismo valor. */
function seededRandom(seed: number): number {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function gaussian(x: number, centro: number, anchura: number): number {
  return Math.exp(-((x - centro) ** 2) / (2 * anchura ** 2));
}

/** Curva de actividad típica del día: suelo nocturno + picos mañana/tarde-noche. */
function factorHorario(hora: number): number {
  const suelo = 0.15;
  const picoManana = 0.5 * gaussian(hora, 9, 2.5);
  const picoTarde = 0.6 * gaussian(hora, 19, 3);
  return Math.min(1, suelo + picoManana + picoTarde);
}

function parseHoraSimulada(hora: string): number {
  const [horas] = hora.split(':').map(Number);
  if (horas === undefined || !Number.isFinite(horas) || horas < 0 || horas > 23) {
    throw new Error(`horaSimulada inválida: "${hora}" (esperado HH:mm, 00-23)`);
  }
  return horas;
}

export function generarDensidadMock(horaSimulada: string): DensidadDistritoMock[] {
  const horas = parseHoraSimulada(horaSimulada);
  const generatedAt = new Date().toISOString();

  return Object.entries(POBLACION)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([codigo, poblacion]) => {
      const pesoPoblacion = poblacion / MAX_POBLACION;
      const base = pesoPoblacion * factorHorario(horas);
      const ruido = (seededRandom(hashString(`${codigo}-${horaSimulada}`)) - 0.5) * 0.1;
      const intensidad = Math.min(1, Math.max(0, base + ruido));

      return {
        distritoCodigo: codigo,
        intensidad,
        horaSimulada,
        esSintetico: true as const,
        generatedAt,
      };
    });
}
