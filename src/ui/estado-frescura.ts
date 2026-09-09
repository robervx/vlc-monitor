// Indicador de frescura global — spec 034b (valor añadido).
//
// Cada panel/capa que trae datos de un endpoint reporta aquí su último
// resultado; la cabecera (`chasis.ts`) se suscribe y pinta un rollup:
// verde = todo al día, ámbar = alguna fuente con retraso, gris = aún cargando.
// No sustituye la frescura por panel (`metaFrescura` en `main.ts`) — la resume.

export interface ResultadoFuente {
  /** `false` si la última llamada falló (se sirvió stale o nada). */
  ok: boolean;
  /** `false` si el dato servido no está "en vivo" (stale-on-error). */
  fresh: boolean;
  /** ISO 8601 del dato servido, si se conoce. */
  fetchedAt?: string;
}

export interface RollupFrescura {
  total: number;
  alDia: number;
  conRetraso: number;
  /** ISO 8601 del `fetchedAt` más reciente entre las fuentes conocidas. */
  masReciente: string | null;
  estado: 'cargando' | 'al-dia' | 'retraso';
}

const fuentes = new Map<string, ResultadoFuente>();
const subs = new Set<(r: RollupFrescura) => void>();

function calcular(): RollupFrescura {
  const vals = [...fuentes.values()];
  const total = vals.length;
  const alDia = vals.filter((v) => v.ok && v.fresh).length;
  const conRetraso = total - alDia;
  let masReciente: string | null = null;
  for (const v of vals) {
    if (v.fetchedAt && (masReciente === null || v.fetchedAt > masReciente)) masReciente = v.fetchedAt;
  }
  const estado: RollupFrescura['estado'] = total === 0 ? 'cargando' : conRetraso === 0 ? 'al-dia' : 'retraso';
  return { total, alDia, conRetraso, masReciente, estado };
}

export function registrarFrescura(id: string, resultado: ResultadoFuente): void {
  fuentes.set(id, resultado);
  const r = calcular();
  subs.forEach((cb) => cb(r));
}

export function onCambioFrescura(cb: (r: RollupFrescura) => void): void {
  subs.add(cb);
  cb(calcular());
}
