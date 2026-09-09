// Dashboard de indicadores — spec 034 v2.
//
// Agregación en cliente: cada panel, al refrescarse, empuja aquí su cifra
// clave (mismo patrón que `estado-frescura.ts`). No hay endpoint ni caché
// nuevos — reutiliza datos que el frontend ya fetchea para sus paneles.

export type TonoKpi = 'neutro' | 'ok' | 'aviso' | 'urgente';

export type ClaveKpi = 'temperatura' | 'aire' | 'trafico' | 'pulso' | 'alertas';

export interface Kpi {
  clave: ClaveKpi;
  etiqueta: string;
  valor: string;
  tono: TonoKpi;
  /** id de checkbox del selector (spec 033) a activar al hacer clic. */
  capaRelacionada?: string;
}

const ORDEN: ClaveKpi[] = ['temperatura', 'aire', 'trafico', 'pulso', 'alertas'];

const kpis = new Map<ClaveKpi, Kpi>();
const subs = new Set<(k: Kpi[]) => void>();

function ordenados(): Kpi[] {
  return ORDEN.map((c) => kpis.get(c)).filter((k): k is Kpi => k !== undefined);
}

export function registrarKpi(kpi: Kpi): void {
  kpis.set(kpi.clave, kpi);
  const lista = ordenados();
  subs.forEach((cb) => cb(lista));
}

export function onCambioKpis(cb: (k: Kpi[]) => void): void {
  subs.add(cb);
  cb(ordenados());
}

/**
 * Monta `#dashboard-kpis` y lo mantiene sincronizado con el store.
 * `onClicCapa(id)` se invoca al pulsar un chip con `capaRelacionada`.
 */
export function montarDashboardKpis(onClicCapa: (idToggle: string) => void): HTMLDivElement {
  const barra = document.createElement('div');
  barra.id = 'dashboard-kpis';
  document.body.appendChild(barra);

  onCambioKpis((lista) => {
    barra.replaceChildren(
      ...lista.map((kpi) => {
        const chip = document.createElement(kpi.capaRelacionada ? 'button' : 'div');
        chip.className = `kpi-chip kpi-chip--${kpi.tono}`;
        if (kpi.capaRelacionada && chip instanceof HTMLButtonElement) {
          chip.type = 'button';
          chip.addEventListener('click', () => onClicCapa(kpi.capaRelacionada!));
        }
        const et = document.createElement('span');
        et.className = 'kpi-chip__etiqueta';
        et.textContent = kpi.etiqueta;
        const val = document.createElement('span');
        val.className = 'kpi-chip__valor';
        val.textContent = kpi.valor;
        chip.append(et, val);
        return chip;
      }),
    );
    barra.hidden = lista.length === 0;
  });

  return barra;
}
