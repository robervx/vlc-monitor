// Marca del producto — spec 030 / ADR-002, renombrado en ADR-004.
// Sitio principal con el nombre visible (el manifest de PWA en vite.config.ts
// y el <title> de index.html también lo citan, ver ADR-004). Cambiar aquí (y
// el logo en public/assets/logo.png) es la mayor parte de lo necesario para
// re-marcar un despliegue.
export const MARCA = {
  nombre: 'Mirall',
  /** Descriptor corto, el que se ve en la cabecera de la app junto al nombre. */
  descriptor: 'Urban Intelligence Platform',
  /** Eslogan de presentación externa (README, LinkedIn) — no se muestra dentro de la app. */
  tagline: 'La ciudad reflejada en tiempo real',
  /** Pie visible siempre en la app. */
  pie: 'Proyecto de datos abiertos · sin relación con ningún organismo oficial',
} as const;
