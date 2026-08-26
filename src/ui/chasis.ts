// Cabecera institucional + sidebar plegable — spec 019.
// Chasis de aplicación: no contiene lógica de datos, solo monta el marco
// sobre el que se apoyan el mapa y los paneles ya existentes (que siguen
// apareciendo vía document.body.appendChild sin cambios).
import { PANEL_PREFERENCES_REGISTRY, isPanelVisible, setPanelVisible } from './panel-preferences';
import { calcularCercania, formatoDistancia, type ResultadoCercania } from '../services/proximidad';
import { getCapasActivas } from '../services/capas-activas-store';
import {
  onCambioModoCordon,
  activarSeleccionUbicacion,
  actualizarFormulario,
  confirmarPropuesta,
  volverASeleccionUbicacion,
  salirModoCordon,
  type EstadoModoCordon,
  type FormularioIncidente,
} from './modo-cordon';
import { FUENTES_REGLAS } from '../config/reglas-perimetro-incendio';
import type { SubtipoIncidente, IntensidadIncidente } from '../services/cordon-incidente';
import {
  onCambioModoSimulacion,
  activarSimulacionCortes,
  toggleTramoCortado,
  salirSimulacionCortes,
  getTramoPorIdSimulacion,
  type EstadoModoSimulacion,
} from './modo-simulacion-cortes';

export interface SidebarSectionDefinition {
  key: string;
  label: string;
  icono: string;
  estado: 'disponible' | 'placeholder';
  specId?: string;
  /** Contenido desplegable bajo la fila — solo si estado === 'disponible'. */
  render?: () => HTMLElement;
}

function filaResultado<T extends { nombre: string }>(r: ResultadoCercania<T>): string {
  return `<div class="proximidad-item"><span class="proximidad-item__nombre">${r.item.nombre}</span><span class="proximidad-item__dist">${formatoDistancia(r.distanciaMetros)}</span></div>`;
}

function seccionResultados(titulo: string, filas: string): string {
  return `<div class="proximidad-seccion"><div class="proximidad-seccion__titulo">${titulo}</div>${
    filas || '<div class="proximidad-vacio">Sin datos — activa esta capa en el panel de capas</div>'
  }</div>`;
}

// Spec 012 — la posición del usuario nunca se envía a ningún endpoint ni se
// persiste (ni localStorage ni caché): solo vive en memoria mientras dura
// esta consulta puntual, y solo se pide tras pulsar el botón explícitamente.
function buildProximidadContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'proximidad-boton';
  boton.textContent = '📍 Buscar cerca de mí';

  const estadoMsg = document.createElement('div');
  estadoMsg.className = 'proximidad-estado';

  const resultados = document.createElement('div');
  resultados.className = 'proximidad-resultados';

  boton.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      estadoMsg.textContent = 'Este navegador no soporta geolocalización.';
      return;
    }
    boton.disabled = true;
    estadoMsg.textContent = 'Buscando tu posición…';
    resultados.innerHTML = '';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        boton.disabled = false;
        const posicion: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const resultado = calcularCercania(posicion, getCapasActivas());
        estadoMsg.textContent = `Posición obtenida (±${Math.round(pos.coords.accuracy)} m de precisión)`;
        resultados.innerHTML = [
          seccionResultados('Tráfico', resultado.trafico.map(filaResultado).join('')),
          seccionResultados('Valenbisi', resultado.valenbisi.map(filaResultado).join('')),
          seccionResultados('Aparcamiento', resultado.aparcamiento.map(filaResultado).join('')),
        ].join('');
      },
      (err) => {
        boton.disabled = false;
        estadoMsg.textContent =
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado — actívalo en el navegador para usar esta función.'
            : 'No se pudo obtener tu posición.';
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });

  wrap.append(boton, estadoMsg, resultados);
  return wrap;
}

const ETIQUETA_SUBTIPO: Record<SubtipoIncidente, string> = {
  vivienda: 'Vivienda',
  edificio: 'Edificio',
  bajoLocal: 'Bajo local',
  garajeAparcamiento: 'Garaje / aparcamiento',
  vehiculoCombustion: 'Vehículo (combustión)',
  vehiculoElectricoHibrido: 'Vehículo eléctrico / híbrido',
};

const ETIQUETA_INTENSIDAD: Record<IntensidadIncidente, string> = {
  conato: 'Conato',
  incendioControlado: 'Incendio controlado',
  incendioGeneralizado: 'Incendio generalizado',
};

const ETIQUETA_CONFIANZA: Record<string, { texto: string; color: string }> = {
  oficialVerificada: { texto: 'Fuente oficial verificada', color: '#16a34a' },
  referenciaInternacional: { texto: 'Referencia internacional (no normativa española)', color: '#f59e0b' },
  estimacionPendienteValidar: { texto: 'Estimación — pendiente de validar con Bombers', color: '#dc2626' },
};

// Comprobación best-effort de datos identificativos en texto libre — no es
// (ni pretende ser) detección de PII completa, solo bloquea los patrones
// más obvios (DNI/NIE, teléfono, email) antes de permitir "Confirmar".
// Documentado como limitación explícita en spec 021 §6.
function contieneDatoIdentificativoProbable(texto: string): boolean {
  const patrones = [
    /\b\d{8}[A-Za-z]\b/, // DNI
    /\b[XYZxyz]\d{7}[A-Za-z]\b/, // NIE
    /\b\d{9}\b/, // teléfono (9 dígitos seguidos)
    /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/, // email
  ];
  return patrones.some((p) => p.test(texto));
}

function renderBadgeConfianza(confianza: string, fuenteId: string): string {
  const info = ETIQUETA_CONFIANZA[confianza] ?? { texto: confianza, color: '#666' };
  const fuente = FUENTES_REGLAS[fuenteId];
  return `
    <div class="cordon-badge" style="border-color:${info.color}">
      <span class="cordon-badge__punto" style="background:${info.color}"></span>
      <div>
        <div class="cordon-badge__texto">${info.texto}</div>
        <div class="cordon-badge__fuente">${fuente?.descripcion ?? fuenteId}</div>
      </div>
    </div>
    <div class="cordon-disclaimer">
      ⚠️ Punto de partida orientativo, no una cifra normativa cerrada — revisa y ajusta antes de actuar sobre el terreno.
    </div>`;
}

function buildCordonIncidenteContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const cuerpo = document.createElement('div');
  wrap.appendChild(cuerpo);

  function render(e: EstadoModoCordon): void {
    if (e.fase === 'inactivo') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Propone un perímetro y calles a cortar para un incendio — nunca decide ni notifica por sí solo. Cifras de partida, siempre editables.</p>
        <button type="button" class="proximidad-boton" id="cordon-iniciar">🔥 Marcar incidente en el mapa</button>
      `;
      cuerpo.querySelector('#cordon-iniciar')?.addEventListener('click', () => {
        void activarSeleccionUbicacion();
      });
      return;
    }

    if (e.fase === 'esperandoClicMapa') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Haz clic en el punto del mapa donde está el incidente.</p>
        ${e.cargandoGrafo ? '<p class="proximidad-estado">Cargando grafo viario…</p>' : ''}
        ${e.errorGrafo ? `<p class="proximidad-estado" style="color:#f87171">${e.errorGrafo}</p>` : ''}
        <button type="button" class="proximidad-boton" id="cordon-cancelar">Cancelar</button>
      `;
      cuerpo.querySelector('#cordon-cancelar')?.addEventListener('click', () => salirModoCordon());
      return;
    }

    // fase === 'formulario'
    const f = e.formulario;
    const pii = contieneDatoIdentificativoProbable(f.observaciones ?? '');
    const resultado = e.resultado;

    cuerpo.innerHTML = `
      <div class="cordon-form">
        <label>Subtipo
          <select id="cordon-subtipo">
            ${Object.entries(ETIQUETA_SUBTIPO)
              .map(([v, l]) => `<option value="${v}" ${f.subtipo === v ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </label>
        <label>Intensidad
          <select id="cordon-intensidad">
            ${Object.entries(ETIQUETA_INTENSIDAD)
              .map(([v, l]) => `<option value="${v}" ${f.intensidad === v ? 'selected' : ''}>${l}</option>`)
              .join('')}
          </select>
        </label>
        <label>Plantas afectadas
          <input type="number" min="0" id="cordon-plantas" value="${f.plantasAfectadas ?? ''}" />
        </label>
        <label>Viviendas afectadas
          <input type="number" min="0" id="cordon-viviendas" value="${f.viviendasAfectadas ?? ''}" />
        </label>
        <label class="cordon-checkbox-label">
          <input type="checkbox" id="cordon-desalojo" ${f.necesidadDesalojo ? 'checked' : ''} />
          Necesidad de desalojo
        </label>
        <label>Observaciones (sin nombres ni datos identificativos)
          <textarea id="cordon-observaciones" rows="2">${f.observaciones ?? ''}</textarea>
        </label>
        ${pii ? '<div class="cordon-pii-error">⚠️ Este texto parece incluir un dato identificativo (DNI, teléfono, email…). Quítalo para poder confirmar.</div>' : ''}
        <button type="button" class="proximidad-boton" id="cordon-cambiar-ubicacion">Cambiar ubicación</button>
      </div>
      <div id="cordon-resultado"></div>
      <button type="button" class="proximidad-boton" id="cordon-salir" style="margin-top:8px">Salir del modo cordón</button>
    `;

    const resultadoRoot = cuerpo.querySelector('#cordon-resultado')!;
    if (!resultado) {
      resultadoRoot.innerHTML = '<p class="proximidad-estado">Calculando propuesta…</p>';
    } else if (!resultado.ok) {
      resultadoRoot.innerHTML = `<p class="proximidad-estado" style="color:#f87171">${resultado.error}</p>`;
    } else {
      const p = resultado.propuesta;
      resultadoRoot.innerHTML = `
        ${renderBadgeConfianza(p.regla.confianza, p.regla.fuenteId)}
        <div class="cordon-resumen">
          <div>🔴 ${p.tramosCerrados.length} tramos cerrados (Área de Intervención, ${p.regla.radioAreaIntervencionM}m)</div>
          <div>🟠 ${p.tramosCorte.length} puntos de control (borde Área de Socorro, ${p.regla.radioAreaSocorroM}m)</div>
          <div>🔵 ${p.tramosDesvioSugerido.length} tramos de desvío sugerido</div>
        </div>
        <button type="button" class="proximidad-boton" id="cordon-confirmar" ${pii ? 'disabled' : ''}>
          ${e.confirmada ? '✓ Propuesta confirmada' : 'Confirmar propuesta (no envía nada)'}
        </button>
      `;
      cuerpo.querySelector('#cordon-confirmar')?.addEventListener('click', () => confirmarPropuesta());
    }

    cuerpo.querySelector('#cordon-subtipo')?.addEventListener('change', (ev) => {
      actualizarFormulario({ subtipo: (ev.target as HTMLSelectElement).value as FormularioIncidente['subtipo'] });
    });
    cuerpo.querySelector('#cordon-intensidad')?.addEventListener('change', (ev) => {
      actualizarFormulario({ intensidad: (ev.target as HTMLSelectElement).value as FormularioIncidente['intensidad'] });
    });
    cuerpo.querySelector('#cordon-plantas')?.addEventListener('change', (ev) => {
      const v = (ev.target as HTMLInputElement).value;
      actualizarFormulario({ plantasAfectadas: v === '' ? undefined : Number(v) });
    });
    cuerpo.querySelector('#cordon-viviendas')?.addEventListener('change', (ev) => {
      const v = (ev.target as HTMLInputElement).value;
      actualizarFormulario({ viviendasAfectadas: v === '' ? undefined : Number(v) });
    });
    cuerpo.querySelector('#cordon-desalojo')?.addEventListener('change', (ev) => {
      actualizarFormulario({ necesidadDesalojo: (ev.target as HTMLInputElement).checked });
    });
    cuerpo.querySelector('#cordon-observaciones')?.addEventListener('input', (ev) => {
      actualizarFormulario({ observaciones: (ev.target as HTMLTextAreaElement).value });
    });
    cuerpo.querySelector('#cordon-cambiar-ubicacion')?.addEventListener('click', () => volverASeleccionUbicacion());
    cuerpo.querySelector('#cordon-salir')?.addEventListener('click', () => salirModoCordon());
  }

  onCambioModoCordon(render);

  return wrap;
}

const ETIQUETA_SENTIDO: Record<string, string> = {
  unidireccional: 'sentido único',
  bidireccional: 'doble sentido',
};

/**
 * Descarga un resumen de texto plano de la simulación actual — Blob +
 * enlace temporal, patrón estándar de descarga en el navegador, sin backend
 * ni almacenamiento: el fichero se genera enteramente en el cliente a
 * partir del estado ya visible en pantalla.
 */
function descargarResumenSimulacion(e: EstadoModoSimulacion): void {
  const fecha = new Date().toLocaleString('es-ES');
  const lineas = [
    'Simulación de cortes de calle — Intelligent City Monitor',
    `Generado: ${fecha}`,
    '',
    `CALLES CORTADAS (${e.tramosCortados.length}):`,
    ...e.tramosCortados.map((id) => {
      const t = getTramoPorIdSimulacion(id);
      return `- ${t?.nombreCalle ?? '(sin nombre)'} (${ETIQUETA_SENTIDO[t?.sentido ?? ''] ?? 'sentido desconocido'})`;
    }),
    '',
  ];

  const aisladosDescarga = e.resultado?.tramosAislados ?? [];
  if (aisladosDescarga.length > 0) {
    const nombres = [...new Set(aisladosDescarga.map((t) => t.nombreCalle ?? '(sin nombre)'))];
    lineas.push(`⚠️ ZONAS SIN SALIDA (${e.resultado?.nodosAisladosCount ?? 0} punto(s) de red afectados):`);
    lineas.push(...nombres.map((n) => `- ${n}`));
  } else {
    lineas.push('✓ Ninguna zona se queda sin salida con esta combinación de cortes.');
  }
  lineas.push('', 'Punto de partida orientativo — revisar sobre el terreno antes de aplicar.');

  const blob = new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `simulacion-cortes-${Date.now()}.txt`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

function buildGemeloDigitalContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const cuerpo = document.createElement('div');
  wrap.appendChild(cuerpo);

  function render(e: EstadoModoSimulacion): void {
    if (e.fase === 'inactivo') {
      cuerpo.innerHTML = `
        <p class="cordon-intro">Simula cortes de calle (ej. para una carrera o un evento) y comprueba si alguna zona se queda sin salida — respeta el sentido real de cada calle. No es simulación de tráfico con intensidades, solo alcanzabilidad.</p>
        <button type="button" class="proximidad-boton" id="sim-iniciar">🗺️ Activar simulador de cortes</button>
      `;
      cuerpo.querySelector('#sim-iniciar')?.addEventListener('click', () => {
        void activarSimulacionCortes();
      });
      return;
    }

    // fase === 'seleccionando'
    const nombresCortados = e.tramosCortados.map((id) => ({
      id,
      tramo: getTramoPorIdSimulacion(id),
    }));

    cuerpo.innerHTML = `
      <p class="cordon-intro">Haz clic en las calles del mapa para cortarlas. Clic de nuevo sobre una ya cortada para quitarla.</p>
      ${e.cargandoGrafo ? '<p class="proximidad-estado">Cargando grafo viario…</p>' : ''}
      ${e.errorGrafo ? `<p class="proximidad-estado" style="color:#f87171">${e.errorGrafo}</p>` : ''}
      <div class="proximidad-seccion__titulo">Calles cortadas (${nombresCortados.length})</div>
      <div id="sim-lista-cortes">
        ${
          nombresCortados.length === 0
            ? '<div class="proximidad-vacio">Ninguna todavía</div>'
            : nombresCortados
                .map(
                  ({ id, tramo }) => `
              <div class="sim-corte-item">
                <span>${tramo?.nombreCalle ?? '(sin nombre)'} <span class="sim-corte-sentido">— ${ETIQUETA_SENTIDO[tramo?.sentido ?? ''] ?? ''}</span></span>
                <button type="button" class="sim-corte-quitar" data-id="${id}" title="Quitar corte">✕</button>
              </div>`,
                )
                .join('')
        }
      </div>
      <div id="sim-resultado"></div>
      ${
        e.tramosCortados.length > 0
          ? '<button type="button" class="proximidad-boton" id="sim-descargar" style="margin-top:8px">⬇️ Descargar resumen</button>'
          : ''
      }
      <button type="button" class="proximidad-boton" id="sim-salir" style="margin-top:8px">Salir del simulador</button>
    `;

    cuerpo.querySelector('#sim-descargar')?.addEventListener('click', () => descargarResumenSimulacion(e));

    const resultadoRoot = cuerpo.querySelector('#sim-resultado')!;
    const aislados = e.resultado?.tramosAislados ?? [];
    if (aislados.length > 0) {
      const nombres = [...new Set(aislados.map((t) => t.nombreCalle ?? '(sin nombre)'))];
      resultadoRoot.innerHTML = `
        <div class="sim-aviso-aislados">
          ⚠️ ${e.resultado?.nodosAisladosCount} punto(s) de la red se quedan sin salida con esta combinación de cortes:
          <ul>${nombres.map((n) => `<li>${n}</li>`).join('')}</ul>
        </div>
      `;
    } else if (e.tramosCortados.length > 0) {
      resultadoRoot.innerHTML = '<div class="sim-aviso-ok">✓ Ninguna zona se queda sin salida con estos cortes.</div>';
    }

    cuerpo.querySelectorAll<HTMLButtonElement>('.sim-corte-quitar').forEach((boton) => {
      boton.addEventListener('click', () => toggleTramoCortado(boton.dataset.id!));
    });
    cuerpo.querySelector('#sim-salir')?.addEventListener('click', () => salirSimulacionCortes());
  }

  onCambioModoSimulacion(render);

  return wrap;
}

function buildConfiguracionContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-panel-content';

  const title = document.createElement('div');
  title.className = 'sidebar-panel-content__title';
  title.textContent = 'Paneles visibles en pantalla';
  wrap.appendChild(title);

  PANEL_PREFERENCES_REGISTRY.forEach((def) => {
    const row = document.createElement('label');
    row.className = 'sidebar-panel-checkbox';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isPanelVisible(def.key);
    checkbox.addEventListener('change', () => setPanelVisible(def.key, checkbox.checked));

    const text = document.createElement('span');
    text.textContent = def.label;

    row.append(checkbox, text);
    wrap.appendChild(row);
  });

  return wrap;
}

// Registro único — añadir una funcionalidad nueva al sidebar es una entrada
// aquí, mismo patrón que LAYER_REGISTRY (ver map-layer-definitions.ts).
// Ninguna entrada 'disponible' sin que exista ya la spec que la respalda.
export const SIDEBAR_REGISTRY: SidebarSectionDefinition[] = [
  {
    key: 'cerca-de-mi',
    label: 'Cerca de mí',
    icono: '📍',
    estado: 'disponible',
    specId: '012',
    render: buildProximidadContent,
  },
  {
    key: 'cordon-incidente',
    label: 'Cordón de incidente',
    icono: '🔥',
    estado: 'disponible',
    specId: '021',
    render: buildCordonIncidenteContent,
  },
  {
    key: 'gemelo-digital',
    label: 'Gemelo digital',
    icono: '🗺️',
    estado: 'disponible',
    specId: '022',
    render: buildGemeloDigitalContent,
  },
  {
    key: 'configuracion',
    label: 'Configuración',
    icono: '⚙️',
    estado: 'disponible',
    specId: '019',
    render: buildConfiguracionContent,
  },
];

const SIDEBAR_EXPANDED_KEY = 'imc:sidebar-expanded';

function buildHeader(): HTMLElement {
  const header = document.createElement('header');
  header.id = 'app-header';

  const logo = document.createElement('img');
  logo.id = 'app-header__logo';
  logo.src = '/assets/policia-local-valencia-logo.png';
  logo.alt = 'Escudo de la Policía Local de València';
  logo.onerror = () => {
    logo.style.visibility = 'hidden';
  };

  const brand = document.createElement('div');
  brand.id = 'app-header__brand';

  const name = document.createElement('span');
  name.id = 'app-header__name';
  name.textContent = 'Intelligent City Monitor';

  const tagline = document.createElement('span');
  tagline.id = 'app-header__tagline';
  tagline.textContent = 'Policía Local de València';

  brand.append(name, tagline);

  const status = document.createElement('div');
  status.id = 'app-header__status';

  const live = document.createElement('span');
  live.id = 'app-header__live';
  const dot = document.createElement('span');
  dot.id = 'app-header__status-dot';
  const liveLabel = document.createElement('span');
  liveLabel.id = 'app-header__live-label';
  liveLabel.textContent = 'EN VIVO';
  live.append(dot, liveLabel);

  const divider = document.createElement('span');
  divider.id = 'app-header__divider';

  const datetime = document.createElement('div');
  datetime.id = 'app-header__datetime';
  const clock = document.createElement('span');
  clock.id = 'app-header__clock';
  const date = document.createElement('span');
  date.id = 'app-header__date';
  datetime.append(clock, date);

  status.append(live, divider, datetime);
  header.append(logo, brand, status);

  const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const updateClock = () => {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Europe/Madrid',
    });
    date.textContent = capitalizar(
      now.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Madrid',
      }),
    );
  };
  updateClock();
  setInterval(updateClock, 1000);

  return header;
}

function buildSidebarSection(def: SidebarSectionDefinition): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'sidebar-section-wrap';

  const el = document.createElement('div');
  el.className = 'sidebar-section' + (def.estado === 'placeholder' ? ' sidebar-section--placeholder' : '');
  el.dataset.sectionKey = def.key;

  const icon = document.createElement('span');
  icon.className = 'sidebar-section__icon';
  icon.textContent = def.icono;

  const label = document.createElement('span');
  label.className = 'sidebar-section__label';
  label.textContent = def.label;

  el.append(icon, label);

  if (def.estado === 'placeholder') {
    const tag = document.createElement('span');
    tag.className = 'sidebar-section__tag';
    tag.textContent = 'Próximamente';
    el.append(tag);
  }

  wrap.appendChild(el);

  if (def.estado === 'disponible' && def.render) {
    el.classList.add('sidebar-section--interactive');
    const content = def.render();
    content.hidden = true;
    el.addEventListener('click', () => {
      content.hidden = !content.hidden;
      el.classList.toggle('is-open', !content.hidden);
    });
    wrap.appendChild(content);
  }

  return wrap;
}

function buildSidebar(): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.id = 'app-sidebar';

  const expandedInicial = localStorage.getItem(SIDEBAR_EXPANDED_KEY) === '1';
  if (expandedInicial) sidebar.classList.add('is-expanded');

  const toggle = document.createElement('button');
  toggle.id = 'app-sidebar__toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Mostrar/ocultar barra lateral');
  toggle.textContent = expandedInicial ? '⟨' : '☰';
  toggle.addEventListener('click', () => {
    const expanded = sidebar.classList.toggle('is-expanded');
    toggle.textContent = expanded ? '⟨' : '☰';
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, expanded ? '1' : '0');
  });

  const sections = document.createElement('div');
  sections.id = 'app-sidebar__sections';
  SIDEBAR_REGISTRY.forEach((def) => sections.appendChild(buildSidebarSection(def)));

  const footer = document.createElement('div');
  footer.id = 'app-footer-attrib';
  footer.textContent = 'Uso interno — no es un servicio público';

  sidebar.append(toggle, sections, footer);
  return sidebar;
}

/** Monta cabecera + sidebar. Llamar una vez, al inicio de main(). */
export function mountChasis(): void {
  document.body.appendChild(buildHeader());
  document.body.appendChild(buildSidebar());
}
