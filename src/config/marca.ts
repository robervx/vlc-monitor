// Marca del producto — spec 030 / ADR-002.
// Único sitio con el nombre visible. Cambiar aquí (y el logo en
// public/assets/logo.png) es todo lo necesario para re-marcar un despliegue.
export const MARCA = {
  nombre: 'Intelligent City Monitor',
  tagline: 'Datos abiertos de València',
  /** Pie visible siempre en la app. */
  pie: 'Proyecto de datos abiertos · sin relación con ningún organismo oficial',
} as const;
