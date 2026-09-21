/**
 * Cliente compartido de Postgres (Neon, ADR-006) — mismo espíritu que
 * `_shared/cache.ts`: un único punto de acceso, degradación silenciosa si
 * no hay credenciales. Driver HTTP/WebSocket de Neon (no `pg` estándar):
 * es el que funciona en runtime `edge`, que es el que usan todos los
 * handlers de `src/server/*.ts` (ver `CLAUDE.md` §6).
 *
 * Esquema real: `scripts/migrations/*.sql`, aplicadas con
 * `scripts/aplicar-migracion.ts`. Fuente de verdad conceptual:
 * `docs/04_MODELO_DE_DATOS.md`.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let cliente: NeonQueryFunction<false, false> | null = null;

export function tieneBaseDeDatos(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** `null` si no hay `DATABASE_URL` — el llamador decide cómo degradar (nunca lanza por esto). */
export function db(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!cliente) cliente = neon(url);
  return cliente;
}
