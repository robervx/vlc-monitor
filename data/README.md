# data/

Assets estáticos versionados generados por los scripts de `scripts/seed-*`.
No subir aquí ningún dato generado a partir de una fuente no verificada
manualmente (ver la tabla de fuentes de cada spec en `specs/`).

- `distritos-valencia.json` — GeoJSON (extensión `.json` a propósito, para que
  tsc/Vite lo importen como módulo tipado sin plugins) con los 19 distritos de
  Valencia, contrato `Distrito` de `specs/000-mapa-base-distritos.md` §3.
  Generado por `npm run seed:distritos` (`scripts/seed-distritos.mjs`). Fuente:
  Geoportal ArcGIS del Ayuntamiento — ver spec 000 §2.
- `poblacion-distritos-valencia-2024.json` — población oficial por distrito
  (Padrón Municipal 2024), usada solo como peso de plausibilidad del generador
  sintético de la spec 003 — no es una fuente en vivo, no tiene script de seed.
  Ver `specs/003-capa-movimiento-personas-mock.md` §2.
