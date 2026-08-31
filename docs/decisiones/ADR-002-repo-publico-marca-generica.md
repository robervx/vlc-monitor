# ADR-002 — Repo público con marca genérica; capa operativa privada fuera de este repo

**Fecha:** 2026-08-29
**Estado:** 🟢 Aceptado (2026-08-29) — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).
**Relación con ADR-001:** **revierte la decisión de audiencia** de ADR-001 (Opción C — "herramienta de despacho para mandos de Policía Local de València"). **Mantiene íntegro** el límite ético/legal de `CLAUDE.md` §4, que aplica igual o con más razón a un proyecto público.

---

## Contexto

ADR-001 fijó el producto como herramienta interna de despacho para Policía Local de València, con identidad institucional (nombre de marca + escudo oficial, con autorización del cuerpo). Sobre esa base se construyeron el chasis (spec `019`), la geolocalización de campo (`012`), el grafo viario (`020`), el motor de cordón (`021`), el simulador de cortes (`022`) y el motor de insights v2 (`024`).

El product owner ha decidido ahora:

1. **Publicar este repositorio** como proyecto abierto: una herramienta que **unifica las fuentes de datos abiertas del Ajuntament de València** (movilidad, meteo, aire, eventos, incidencias) en un único mapa en tiempo real, para que cualquier persona u organización pueda desplegarla y partir de ella.
2. **Retirar el escudo oficial de Policía Local de València** y toda marca institucional. La autorización del cuerpo cubría un uso interno, no una publicación abierta.
3. **Mantener su propia versión aumentada** —con capacidades ampliadas de apoyo a la decisión— como despliegue privado en su entorno de trabajo (con reescritura prevista a .NET). Ese trabajo **no vive en este repo**.

## Decisión

### Qué es este repo a partir de ahora

- **Un monitor de ciudad de datos abiertos de València, de propósito general.** Sin audiencia institucional declarada, sin marca de ningún cuerpo. Nombre de producto: **"Intelligent City Monitor"** (genérico — inteligencia + ciudad + monitorización en tiempo real; no menciona a nadie). Tagline: "Datos abiertos de València en tiempo real".
- **Licencia MIT** (`LICENSE`), para que "quien quiera incorporarse la herramienta" pueda hacerlo sin fricción.
- **Las funcionalidades ya construidas se quedan.** El cordón de incidente, el simulador de cortes de calle y el motor de insights son herramientas genéricas de gestión municipal (obras, eventos, emergencias) que cualquier ayuntamiento o equipo cívico puede usar. Se **desmarca el lenguaje** (se quita "despacho", "mando policial", "uso interno" como identidad), no se borran las features.
- **El acceso con contraseña (spec `018`) pasa a ser opcional.** Sin `AUTH_SECRET` configurado, la app se sirve abierta (modo demo / repo público). Con `AUTH_SECRET` + `APP_USERS`, queda tras el gate (despliegues privados). Antes era fail-closed; ahora fail-open.

### Qué NO es este repo

- No es una herramienta operativa policial ni lleva identidad de ningún cuerpo. Cualquier despliegue que quiera esa orientación la añade por su cuenta, fuera de aquí, y asume su propia autorización y cumplimiento.
- La "versión aumentada para toma de decisiones" del product owner es un proyecto aparte (previsiblemente .NET, en su infraestructura). Este repo es su base común, no su hogar.

### Qué se mantiene sin cambios

- **`CLAUDE.md` §4 (límite ético/legal)** — íntegro. Ningún dato de localización individual, ninguna fuente fuera de cauce legal, "avisa no actúa", capas simuladas siempre marcadas. Un proyecto público hace estas reglas más importantes, no menos.
- **Decisiones técnicas de `CLAUDE.md` §5** (TypeScript/Vite/MapLibre+deck.gl, sin globo 3D, patrón seed→caché→endpoint, registro único de capas).
- **El flujo spec-driven de `CLAUDE.md` §2.**

## Consecuencias

- `CLAUDE.md` §1 se reescribe para reflejar esto (hecho en la spec `030`).
- Spec `030` (re-marca genérica) implementa: escudo → placeholder neutro generado, tagline y pie de la app, gate opcional, `LICENSE`, README orientado a público.
- Spec `019` v4: la nota de procedencia del asset de marca cambia (ya no es "escudo oficial con autorización" sino "placeholder neutro, sustituible").
- Spec `018` v3: el middleware pasa de fail-closed a fail-open cuando no hay `AUTH_SECRET`.
- ADR-001 queda como registro histórico: su decisión de audiencia está revertida por este ADR; su aportación viva es haber desbloqueado specs `012` y `020`-`022`, que siguen válidas como herramientas genéricas.
- Los documentos de investigación con enfoque policial (`GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`) se conservan como contexto histórico; no son guía de producto del repo público.
