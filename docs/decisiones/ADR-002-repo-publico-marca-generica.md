# ADR-002 — Repositorio público con marca genérica

**Fecha:** 2026-08-29
**Estado:** Aceptado — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).

---

## Contexto

El proyecto se publica como repositorio abierto: una herramienta que unifica las
fuentes de datos abiertas del Ajuntament de València y otras fuentes públicas
(movilidad, meteorología, aire, eventos, incidencias) en un único mapa en tiempo
real, para que cualquier persona u organización pueda desplegarla y partir de ella.

Iteraciones anteriores del proyecto habían explorado una orientación de producto más
específica, con identidad de marca propia. Esa línea queda fuera del repositorio
público y, en su caso, se continúa en un proyecto privado independiente con su propia
autorización y cumplimiento.

## Decisión

### Qué es este repositorio

- **Un monitor de ciudad de datos abiertos de València, de propósito general.** Sin
  audiencia institucional declarada y sin marca de ningún organismo. Nombre de
  producto: **"Intelligent City Monitor"**. Tagline: "Datos abiertos de València".
- **Licencia MIT** (`LICENSE`).
- **Las herramientas de gestión municipal se mantienen.** El grafo viario (`020`), la
  propuesta de perímetro por incidente (`021`), el simulador de cortes de calle
  (`022`, `031`) y el motor de insights (`013`, `024`) son genéricas —obras, eventos,
  emergencias— y las puede usar cualquier ayuntamiento o equipo cívico. Se retira el
  lenguaje de un caso de uso concreto; no se retiran funcionalidades.
- **El acceso con contraseña (spec `018`) es opcional.** Sin `AUTH_SECRET`
  configurado, la app se sirve abierta (modo demo / repo público). Con `AUTH_SECRET`
  + `APP_USERS`, queda tras el gate (despliegues privados). El middleware pasa de
  fail-closed a fail-open.

### Qué se mantiene sin cambios

- **`CLAUDE.md` §4 (límite ético/legal)** — íntegro. Ningún dato de localización
  individual, ninguna fuente fuera de cauce legal, "avisa no actúa", capas simuladas
  siempre marcadas. Un proyecto público hace estas reglas más importantes, no menos.
- **Decisiones técnicas de `CLAUDE.md` §5** (TypeScript/Vite/MapLibre + deck.gl, sin
  globo 3D, patrón seed → caché → endpoint, registro único de capas).
- **El flujo spec-driven de `CLAUDE.md` §2.**

## Consecuencias

- `CLAUDE.md` §1 se reescribe para reflejar esto (spec `030`).
- Spec `030` implementa: logo → placeholder neutro generado, tagline y pie de la app,
  gate opcional, `LICENSE`, README orientado a público, e inventario de fuentes y
  licencias (`docs/FUENTES_Y_LICENCIAS.md`).
- Spec `019` v4: la nota de procedencia del asset de marca cambia a "placeholder
  neutro, sustituible".
- Spec `018` v3: el middleware pasa de fail-closed a fail-open cuando no hay
  `AUTH_SECRET`.
