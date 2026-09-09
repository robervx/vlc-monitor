// Glosario / "cómo funciona" — spec 037.
//
// Sección de solo lectura dentro del sidebar (spec 019) que explica los
// conceptos que la app da por sabidos: qué combina el Pulso y con qué pesos,
// qué mide cada capa, el principio "avisa, no actúa", el badge MOCK, etc.
//
// Regla de la spec (§2): los números del Pulso y de las alertas NO se escriben
// a mano aquí — se leen de las constantes reales del código, de modo que si
// alguien recalibra un peso el glosario lo refleja sin tocar este fichero.

import { LAYER_REGISTRY } from '../config/map-layer-definitions';
import { PESOS_PULSO, UMBRALES_CATEGORIA_PULSO } from '../services/pulso-distrito';
import {
  UMBRAL_CALOR_TEMPERATURA,
  UMBRAL_CALOR_SENSACION,
  UMBRAL_CALOR_AVISO_TEMPERATURA,
  UMBRAL_VIENTO_AVISO_KMH,
  UMBRAL_VIENTO_URGENTE_KMH,
} from '../services/insights';

const REPO_URL = 'https://github.com/robervx/vlc-monitor';
const RUTA_FUENTES = 'docs/FUENTES_Y_LICENCIAS.md';

export interface EntradaGlosario {
  termino: string;
  /** HTML simple (párrafos, listas), contenido estático de confianza — sin scripts ni datos de usuario. */
  cuerpo: string;
}

const pct = (n: number): string => `${Math.round(n * 100)} %`;

/**
 * Metadatos legibles de cada capa. La *lista* de capas se deriva de
 * `LAYER_REGISTRY` (así una capa nueva sin su línea aquí salta en los tests y
 * en dev), pero el "qué mide / cada cuánto / de qué fuente" es texto curado:
 * el registro no lo guarda y los TTL viven repartidos por endpoint (spec 037 §7).
 */
interface MetaCapa {
  nombre: string;
  mide: string;
  frecuencia: string;
  fuente: string;
}

const META_CAPAS: Record<string, MetaCapa> = {
  distritos: {
    nombre: 'Distritos',
    mide: 'Límites de los 19 distritos (capa base del mapa)',
    frecuencia: 'Geometría fija',
    fuente: 'Cartografía del Ajuntament de València',
  },
  movimientoPersonasMock: {
    nombre: 'Densidad de personas',
    mide: 'Concentración de personas por distrito — 100 % sintética, no representa nada real',
    frecuencia: 'Generada en el cliente',
    fuente: 'MOCK — sin fuente (ver "MOCK" más abajo)',
  },
  meteo: {
    nombre: 'Meteorología',
    mide: 'Temperatura, sensación térmica, viento, lluvia y estado del cielo',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'Open-Meteo (+ avisos AEMET cuando hay API key)',
  },
  calidadAire: {
    nombre: 'Calidad del aire',
    mide: 'Índice europeo de calidad del aire (EAQI) y PM2.5',
    frecuencia: 'Caché refrescada cada ~60 min',
    fuente: 'Open-Meteo Air Quality',
  },
  trafico: {
    nombre: 'Tráfico',
    mide: 'Estado de circulación por tramo: fluido, denso, congestionado o cortado',
    frecuencia: 'Caché refrescada cada ~3 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  valenbisi: {
    nombre: 'Valenbisi',
    mide: 'Bicis y anclajes libres por estación',
    frecuencia: 'Caché refrescada cada ~2 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  aparcamiento: {
    nombre: 'Aparcamiento',
    mide: 'Plazas libres en aparcamientos públicos (13 sin sensor)',
    frecuencia: 'Caché refrescada cada ~2 min',
    fuente: 'Geoportal del Ajuntament de València (ArcGIS)',
  },
  pulsoDistrito: {
    nombre: 'Pulso de Distrito',
    mide: 'Índice compuesto de tensión del distrito (ver "Pulso de Distrito" arriba)',
    frecuencia: 'Se recalcula en cliente con sus fuentes (tráfico, aire, meteo, incidencias)',
    fuente: 'Compuesto — VLC Monitor, sin fuente externa propia',
  },
  fallas: {
    nombre: 'Fallas',
    mide: 'Monumentos, carpas y zonas de movilidad reducida durante la campaña fallera',
    frecuencia: 'Caché refrescada cada ~6 h',
    fuente: 'Geoportal del Ajuntament de València',
  },
  contextoMediatico: {
    nombre: 'Contexto mediático (prensa)',
    mide: 'Titulares de medios locales filtrados a València-ciudad; no es una capa del mapa, es un panel',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'RSS de medios locales + Google News por medio',
  },
  tendenciaTerminos: {
    nombre: 'Tendencia de términos',
    mide: 'Términos más repetidos en la prensa local por hora y por día',
    frecuencia: 'Caché refrescada cada ~15 min',
    fuente: 'Recuento determinista sobre el contexto mediático (sin IA)',
  },
  incidenciasViaPublica: {
    nombre: 'Incidencias de vía pública',
    mide: 'Obras, cortes puntuales y festejos con permiso municipal (visible solo a zoom de calle)',
    frecuencia: 'Caché refrescada cada ~60 min',
    fuente: 'Geoportal del Ajuntament de València',
  },
};

/** Claves de `LAYER_REGISTRY` sin entrada en `META_CAPAS` — debe ser [] siempre. */
export function capasSinMetadato(): string[] {
  return Object.keys(LAYER_REGISTRY).filter((k) => !(k in META_CAPAS));
}

function listaCapasHtml(): string {
  const filas = Object.keys(LAYER_REGISTRY)
    .map((key) => {
      const m = META_CAPAS[key];
      if (!m) return '';
      return `<li><strong>${m.nombre}.</strong> ${m.mide}. <span class="glosario-meta">Actualización: ${m.frecuencia}. Fuente: ${m.fuente}.</span></li>`;
    })
    .join('');
  return `<ul class="glosario-lista">${filas}</ul>`;
}

function cuerpoPulso(): string {
  const { trafico, incidencias, aire, meteo } = PESOS_PULSO;
  const { Moderado, Tenso, Crítico } = UMBRALES_CATEGORIA_PULSO;
  return `
    <p>El <strong>Pulso de Distrito</strong> resume en un número de 0 a 100 lo tensa
    que está la situación de un distrito ahora mismo. Combina cuatro señales que la
    app ya tiene:</p>
    <ul class="glosario-lista">
      <li>Tráfico — peso <strong>${pct(trafico)}</strong></li>
      <li>Incidencias de vía pública — peso <strong>${pct(incidencias)}</strong></li>
      <li>Calidad del aire — peso <strong>${pct(aire)}</strong></li>
      <li>Meteorología adversa — peso <strong>${pct(meteo)}</strong></li>
    </ul>
    <p>Fórmula: <code>índice = 100 × (${trafico}·tráfico + ${incidencias}·incidencias
    + ${aire}·aire + ${meteo}·meteo)</code>, donde cada componente va de 0 a 1. En la
    meteo domina el factor más adverso (calor, frío, viento o lluvia), no la media.</p>
    <p>Categorías por umbral: <strong>Tranquilo</strong> si el índice &lt; ${Moderado},
    <strong>Moderado</strong> de ${Moderado} a ${Tenso - 1},
    <strong>Tenso</strong> de ${Tenso} a ${Crítico - 1},
    <strong>Crítico</strong> a partir de ${Crítico}.</p>
    <p class="glosario-nota">Aire y meteo son de ciudad (una sola medición): entre
    distritos solo varían de verdad el tráfico y las incidencias. El índice mejora
    cuando existan fuentes de aire/meteo por distrito.</p>
  `;
}

function cuerpoAlertas(): string {
  return `
    <p>El motor de <strong>insights</strong> revisa las capas cada vez que se
    refrescan y levanta una alerta cuando algo cruza un umbral. Tipos actuales:</p>
    <ul class="glosario-lista">
      <li><strong>Calor</strong> — aviso a partir de ${UMBRAL_CALOR_AVISO_TEMPERATURA} °C;
      calor extremo a ${UMBRAL_CALOR_TEMPERATURA} °C o ${UMBRAL_CALOR_SENSACION} °C de sensación.</li>
      <li><strong>Frío extremo</strong>, <strong>lluvia intensa prevista</strong> y
      <strong>lluvia probable</strong> (señal blanda).</li>
      <li><strong>Viento fuerte</strong> — aviso con rachas ≥ ${UMBRAL_VIENTO_AVISO_KMH} km/h,
      urgente ≥ ${UMBRAL_VIENTO_URGENTE_KMH} km/h.</li>
      <li><strong>Calidad del aire mala</strong> y <strong>distrito crítico</strong> (Pulso alto).</li>
      <li><strong>Tráfico</strong> — concentración de tramos afectados en un distrito,
      tráfico en zona de Fallas, empeoramiento respecto al ciclo anterior y lluvia + tráfico denso.</li>
    </ul>
    <p>Al aparecer una alerta nueva salta un aviso arriba a la derecha (nunca en la
    primera carga). El panel ofrece un borrador de texto para copiar.</p>
    <p class="glosario-nota"><strong>Avisa, no actúa.</strong> La app genera una alerta
    visible para que la revise una persona: nunca decide ni ejecuta una acción sobre
    nadie, ni envía nada automáticamente. Cualquier intervención real sigue el cauce
    legal normal, fuera de esta aplicación (CLAUDE.md §4).</p>
  `;
}

/**
 * Contenido del glosario. Función pura y sin DOM para poder verificar en los
 * tests que los valores salen de las constantes (spec 037 §6).
 */
export function construirEntradasGlosario(): EntradaGlosario[] {
  return [
    { termino: 'Pulso de Distrito', cuerpo: cuerpoPulso() },
    {
      termino: 'Capas del mapa',
      cuerpo: `<p>Qué mide cada capa, cada cuánto se refresca su caché y de dónde
        sale el dato:</p>${listaCapasHtml()}
        <p class="glosario-nota">Las frecuencias son el intervalo de refresco de la
        caché del servidor, orientativas.</p>`,
    },
    {
      termino: 'Prioritarias vs. Contexto',
      cuerpo: `<p>El selector de capas separa en dos grupos:</p>
        <ul class="glosario-lista">
          <li><strong>Prioritarias</strong> — situación de la ciudad ahora mismo
          (tráfico, Pulso, incidencias de vía pública). Siempre visibles, con un
          borde de acento. El botón "Vista operativa" enciende estas y pliega el resto.</li>
          <li><strong>Contexto e informativas</strong> — apoyo (Valenbisi, aparcamiento,
          Fallas, prensa, tendencia de términos, densidad MOCK). Grupo plegable.</li>
        </ul>
        <p class="glosario-nota">La separación es por rol del dato, no por tipo de
        usuario.</p>`,
    },
    {
      termino: '"En vivo" y "no actualizado"',
      cuerpo: `<p>La cabecera resume la frescura de todas las fuentes:</p>
        <ul class="glosario-lista">
          <li><span class="glosario-punto" style="background:#16a34a"></span>
          <strong>Verde</strong> — todas las fuentes al día.</li>
          <li><span class="glosario-punto" style="background:#f59e0b"></span>
          <strong>Ámbar</strong> — alguna fuente sirve datos cacheados antiguos
          ("N/N con retraso").</li>
          <li><span class="glosario-punto" style="background:#9db3c9"></span>
          <strong>Gris</strong> — aún cargando.</li>
        </ul>
        <p>Cada panel avisa por separado cuando su dato no está en vivo: significa que
        la fuente falló y se muestra la última respuesta buena guardada.</p>`,
    },
    { termino: 'Alertas e insights', cuerpo: cuerpoAlertas() },
    {
      termino: 'MOCK',
      cuerpo: `<p>La capa <strong>"Densidad de personas"</strong> es 100 % sintética:
        se genera con un algoritmo, no mide a nadie y no representa ningún dato real.
        Existe solo para validar la interfaz de choropleth antes de tener (si algún
        día se tiene) una fuente real agregada y anonimizada en origen.</p>
        <p>Por eso lleva el distintivo <strong>MOCK</strong> siempre visible mientras
        está activa. No la uses para nada operativo.</p>`,
    },
    {
      termino: 'Foco de distrito',
      cuerpo: `<p>Al hacer clic en un distrito del mapa aparece el chip
        <strong>"Foco: &lt;distrito&gt;"</strong>. Con el foco puesto:</p>
        <ul class="glosario-lista">
          <li>El contexto mediático se filtra a las noticias de ese distrito (más los
          buckets de ciudad).</li>
          <li>El Pulso antepone el índice de ese distrito.</li>
        </ul>
        <p>Clic de nuevo en el mismo distrito, o en el chip, para quitar el foco. No
        se guarda entre sesiones.</p>`,
    },
    {
      termino: 'Fuentes y licencias',
      cuerpo: `<p>Todos los datos de esta app son públicos y gratuitos: Geoportal y
        Portal de Datos Abiertos del Ajuntament de València, Open-Meteo, AEMET,
        OpenStreetMap y RSS de medios locales.</p>
        <p>El inventario completo (fuente, licencia y atribución por capa) está en
        <a href="${REPO_URL}/blob/master/${RUTA_FUENTES}" target="_blank" rel="noopener">
        ${RUTA_FUENTES}</a> del repositorio.</p>`,
    },
  ];
}

export function buildGlosarioContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content glosario';

  const intro = document.createElement('p');
  intro.className = 'cordon-intro';
  intro.textContent =
    'Qué significa cada concepto de la app y cómo se calcula. Los números del Pulso y de las alertas se leen del propio código.';
  wrap.appendChild(intro);

  const entradas = construirEntradasGlosario();
  const detalles: HTMLDetailsElement[] = [];

  for (const entrada of entradas) {
    const det = document.createElement('details');
    det.className = 'glosario-entrada';

    const sum = document.createElement('summary');
    sum.className = 'glosario-entrada__titulo';
    sum.textContent = entrada.termino;
    det.appendChild(sum);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'glosario-entrada__cuerpo';
    cuerpo.innerHTML = entrada.cuerpo;
    det.appendChild(cuerpo);

    // Acordeón: abrir una cierra las demás (spec 037 §5).
    det.addEventListener('toggle', () => {
      if (!det.open) return;
      for (const otro of detalles) if (otro !== det) otro.open = false;
    });

    detalles.push(det);
    wrap.appendChild(det);
  }

  return wrap;
}
