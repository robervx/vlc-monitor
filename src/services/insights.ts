/**
 * Motor de insights de la spec 013 (specs/013-motor-insights-alertas.md §3, §6).
 * Función pura, sin red — combina datos ya obtenidos de las specs 001 (meteo),
 * 002 (aire), 010 (Pulso de Distrito) y 016 (predicción a corto plazo).
 *
 * "Avisa, no actúa" (CLAUDE.md §4): cada insight lleva un borrador de texto
 * listo para copiar, nunca una acción ni una lista de destinatarios — ver
 * specs/013-motor-insights-alertas.md §0.
 */
import type { EstadoMeteo } from './estado-meteo';
import type { CalidadAire } from './calidad-aire';
import type { PulsoDistrito } from './pulso-distrito';
import type { PrediccionCortoPlazo } from './prediccion-corto-plazo';

export type SeveridadInsight = 'aviso' | 'urgente';

export type TipoInsight =
  | 'calor-extremo'
  | 'frio-extremo'
  | 'aire-mala-calidad'
  | 'lluvia-intensa-prevista'
  | 'distrito-critico'
  | 'viento-fuerte';

export interface ProtocoloSugerido {
  asunto: string;
  cuerpo: string;
}

export interface Insight {
  id: string;
  tipo: TipoInsight;
  severidad: SeveridadInsight;
  titulo: string;
  descripcion: string;
  protocoloSugerido: ProtocoloSugerido;
  distritoCodigo?: string;
  fuenteSpec: '001' | '002' | '010' | '016';
  // 'viento-fuerte' también usa fuenteSpec '001' (mismo EstadoMeteo, campo vientoRachas).
  detectedAt: string;
  fetchedAt: string;
}

export interface PanelInsights {
  insights: Insight[];
  fetchedAt: string;
  source: 'vlc-monitor-insights';
}

const UMBRAL_CALOR_TEMPERATURA = 38;
const UMBRAL_CALOR_SENSACION = 42;
const UMBRAL_FRIO_TEMPERATURA = 0;
const UMBRAL_LLUVIA_MM = 5;
// Basado en rachas (vientoRachas), no en velocidad sostenida — más indicativo
// del riesgo real, mismo criterio que usan los avisos AEMET por viento.
// Heurística documentada, no un umbral oficial — igual disclaimer que spec 010 §7.
// Exportados para que el panel de meteo (main.ts) pinte el mismo semáforo
// sin duplicar el umbral en dos sitios.
export const UMBRAL_VIENTO_AVISO_KMH = 50;
export const UMBRAL_VIENTO_URGENTE_KMH = 70;

function insightCalorExtremo(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  if (meteo.temperatura < UMBRAL_CALOR_TEMPERATURA && meteo.sensacionTermica < UMBRAL_CALOR_SENSACION) {
    return null;
  }
  return {
    id: 'calor-extremo:ciudad',
    tipo: 'calor-extremo',
    severidad: 'urgente',
    titulo: `Calor extremo — ${Math.round(meteo.temperatura)}°C en Valencia`,
    descripcion: `Temperatura ${meteo.temperatura}°C, sensación térmica ${meteo.sensacionTermica}°C — por encima del umbral de calor extremo (${UMBRAL_CALOR_TEMPERATURA}°C / ${UMBRAL_CALOR_SENSACION}°C sensación).`,
    protocoloSugerido: {
      asunto: 'Posible activación de protocolo de calor — Valencia',
      cuerpo:
        `Se ha detectado una temperatura de ${meteo.temperatura}°C (sensación térmica ${meteo.sensacionTermica}°C) ` +
        `en Valencia a las ${meteo.observedAt}. Se sugiere valorar la activación del protocolo de calor extremo: ` +
        'hidratación y rotación de las unidades en calle, prioridad a zonas sin sombra. ' +
        'Dato de origen: Open-Meteo (VLC Monitor, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: '001',
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightFrioExtremo(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  if (meteo.temperatura > UMBRAL_FRIO_TEMPERATURA) return null;
  return {
    id: 'frio-extremo:ciudad',
    tipo: 'frio-extremo',
    severidad: 'aviso',
    titulo: `Frío extremo — ${Math.round(meteo.temperatura)}°C en Valencia`,
    descripcion: `Temperatura ${meteo.temperatura}°C — igual o por debajo del umbral de frío extremo (${UMBRAL_FRIO_TEMPERATURA}°C).`,
    protocoloSugerido: {
      asunto: 'Posible aviso de frío extremo / riesgo de helada — Valencia',
      cuerpo:
        `Se ha detectado una temperatura de ${meteo.temperatura}°C en Valencia a las ${meteo.observedAt}. ` +
        'Se sugiere valorar aviso a las unidades sobre riesgo de helada en calzada y protocolo de frío para personas sin techo. ' +
        'Dato de origen: Open-Meteo (VLC Monitor, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: '001',
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightVientoFuerte(meteo: EstadoMeteo, fetchedAt: string): Insight | null {
  if (meteo.vientoRachas < UMBRAL_VIENTO_AVISO_KMH) return null;
  const severidad: SeveridadInsight = meteo.vientoRachas >= UMBRAL_VIENTO_URGENTE_KMH ? 'urgente' : 'aviso';
  return {
    id: 'viento-fuerte:ciudad',
    tipo: 'viento-fuerte',
    severidad,
    titulo: `Viento fuerte — rachas de ${Math.round(meteo.vientoRachas)} km/h`,
    descripcion: `Rachas de ${meteo.vientoRachas} km/h (velocidad sostenida ${meteo.vientoVelocidad} km/h) — por encima del umbral de viento fuerte (${UMBRAL_VIENTO_AVISO_KMH} km/h).`,
    protocoloSugerido: {
      asunto: 'Aviso de viento fuerte — Valencia',
      cuerpo:
        `Se han detectado rachas de ${meteo.vientoRachas} km/h (velocidad sostenida ${meteo.vientoVelocidad} km/h) ` +
        `en Valencia a las ${meteo.observedAt}. Se sugiere valorar aviso a unidades sobre riesgo de caída de objetos/ramas, ` +
        'precaución con estructuras temporales (casetas, carpas) y vía pública. ' +
        'Dato de origen: Open-Meteo (VLC Monitor, spec 001). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: '001',
    detectedAt: meteo.observedAt,
    fetchedAt,
  };
}

function insightAireMalaCalidad(aire: CalidadAire, fetchedAt: string): Insight | null {
  if (aire.categoria !== 'Mala' && aire.categoria !== 'Muy mala') return null;
  const severidad: SeveridadInsight = aire.categoria === 'Muy mala' ? 'urgente' : 'aviso';
  return {
    id: 'aire-mala-calidad:ciudad',
    tipo: 'aire-mala-calidad',
    severidad,
    titulo: `Calidad del aire ${aire.categoria.toLowerCase()} — índice ${aire.indiceEuropeo}`,
    descripcion: `Índice europeo de calidad del aire ${aire.indiceEuropeo} (${aire.categoria}), PM2.5 ${aire.pm25} µg/m³.`,
    protocoloSugerido: {
      asunto: `Aviso de calidad del aire ${aire.categoria.toLowerCase()} — Valencia`,
      cuerpo:
        `El índice europeo de calidad del aire está en ${aire.indiceEuropeo} (${aire.categoria}), PM2.5 ${aire.pm25} µg/m³, ` +
        `NO₂ ${aire.dioxidoNitrogeno} µg/m³ a las ${aire.observedAt}. Se sugiere valorar recomendaciones a la ciudadanía (grupos sensibles) ` +
        'y revisar si aplica alguna restricción según el protocolo municipal de calidad del aire. ' +
        'Dato de origen: Open-Meteo Air Quality (VLC Monitor, spec 002). Revisar y decidir antes de actuar.',
    },
    fuenteSpec: '002',
    detectedAt: aire.observedAt,
    fetchedAt,
  };
}

function insightsLluviaIntensa(prediccion: PrediccionCortoPlazo, fetchedAt: string): Insight[] {
  return prediccion.predicciones
    .filter((tramo) => tramo.precipitacion >= UMBRAL_LLUVIA_MM)
    .map((tramo) => ({
      id: `lluvia-intensa-prevista:${tramo.horaObjetivo}`,
      tipo: 'lluvia-intensa-prevista' as const,
      severidad: 'aviso' as const,
      titulo: `Lluvia intensa prevista — ${tramo.precipitacion}mm hacia las ${tramo.horaObjetivo}`,
      descripcion: `Predicción de ${tramo.precipitacion}mm de precipitación (${tramo.probabilidadPrecipitacion}% de probabilidad) para ${tramo.horaObjetivo}.`,
      protocoloSugerido: {
        asunto: 'Aviso de lluvia intensa prevista — Valencia',
        cuerpo:
          `Open-Meteo prevé ${tramo.precipitacion}mm de precipitación (${tramo.probabilidadPrecipitacion}% de probabilidad) ` +
          `para las ${tramo.horaObjetivo} en Valencia. Se sugiere valorar aviso preventivo a unidades sobre puntos de ` +
          'inundación habituales y refuerzo en pasos de peatones/zonas bajas. ' +
          'Dato de origen: Open-Meteo (VLC Monitor, spec 016). Revisar y decidir antes de actuar.',
      },
      fuenteSpec: '016' as const,
      detectedAt: tramo.horaObjetivo,
      fetchedAt,
    }));
}

function insightsDistritoCritico(distritos: PulsoDistrito[], fetchedAt: string): Insight[] {
  return distritos
    .filter((d) => d.categoria === 'Crítico')
    .map((d) => ({
      id: `distrito-critico:${d.distritoCodigo}`,
      tipo: 'distrito-critico' as const,
      severidad: 'urgente' as const,
      titulo: `Distrito crítico — ${d.distritoNombre}`,
      descripcion: `Pulso de Distrito ${d.indice}/100 (Crítico) en ${d.distritoNombre} — tráfico ${(d.componentes.trafico * 100).toFixed(0)}%, aire ${(d.componentes.aire * 100).toFixed(0)}%, meteo ${(d.componentes.meteo * 100).toFixed(0)}%.`,
      protocoloSugerido: {
        asunto: `Distrito en estado crítico — ${d.distritoNombre}`,
        cuerpo:
          `El Pulso de Distrito de ${d.distritoNombre} está en ${d.indice}/100 (Crítico) a las ${d.observedAt}, ` +
          'combinando tráfico, calidad del aire y meteorología adversa. Se sugiere valorar revisar la situación sobre el terreno ' +
          'y priorizar unidades en la zona si procede. ' +
          'Dato de origen: VLC Monitor, índice compuesto (spec 010). Revisar y decidir antes de actuar.',
      },
      distritoCodigo: d.distritoCodigo,
      fuenteSpec: '010' as const,
      detectedAt: d.observedAt,
      fetchedAt,
    }));
}

export function calcularInsights(
  meteo: EstadoMeteo,
  aire: CalidadAire,
  distritos: PulsoDistrito[] | null,
  prediccion: PrediccionCortoPlazo | null,
): PanelInsights {
  const fetchedAt = new Date().toISOString();

  const insights: Insight[] = [
    insightCalorExtremo(meteo, fetchedAt),
    insightFrioExtremo(meteo, fetchedAt),
    insightVientoFuerte(meteo, fetchedAt),
    insightAireMalaCalidad(aire, fetchedAt),
    ...(prediccion ? insightsLluviaIntensa(prediccion, fetchedAt) : []),
    ...(distritos ? insightsDistritoCritico(distritos, fetchedAt) : []),
  ].filter((insight): insight is Insight => insight !== null);

  return { insights, fetchedAt, source: 'vlc-monitor-insights' };
}
