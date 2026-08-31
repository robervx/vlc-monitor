// Helper de caché compartido (patrón seed -> caché -> endpoint, ver
// docs/01_VIABILIDAD_VISION_Y_PROCESO.md §3.3 y CLAUDE.md §5).
//
// Implementación actual: Map en memoria de proceso. No es Upstash Redis real
// porque este entorno no tiene credenciales provisionadas (`UPSTASH_REDIS_REST_URL`
// / `UPSTASH_REDIS_REST_TOKEN`) y crear esa cuenta requiere una persona, no una
// sesión de Claude Code — ver spec 001 §4. Sustituir el cuerpo de `getOrFetch`
// por llamadas a Upstash cuando esas variables existan; la firma no debería
// cambiar para el código que la consume.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export interface CacheResult<T> {
  value: T;
  /** false si la fuente falló y se sirvió el último valor bueno (stale-on-error). */
  fresh: boolean;
}

/**
 * Devuelve el valor cacheado si sigue vigente; si no, llama a `fetcher()`.
 * Si `fetcher()` falla y hay un valor previo (aunque caducado), lo sirve
 * marcado como `fresh: false` en vez de romper — nunca dejar una capa sin
 * dato por un fallo puntual de la fuente (CLAUDE.md, patrón stale-on-error).
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<CacheResult<T>> {
  const now = Date.now();
  const cached = store.get(key) as CacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return { value: cached.value, fresh: true };
  }

  try {
    const value = await fetcher();
    store.set(key, { value, expiresAt: now + ttlMs });
    return { value, fresh: true };
  } catch (err) {
    if (cached) {
      return { value: cached.value, fresh: false };
    }
    throw err;
  }
}
