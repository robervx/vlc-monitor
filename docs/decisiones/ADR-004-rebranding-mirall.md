# ADR-004 — Rebranding a "Mirall"

**Fecha:** 2026-09-16
**Estado:** Aceptado — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).

---

## Contexto

ADR-002 (2026-08-29) fijó el nombre de producto "Intelligent City Monitor" y su tagline
"Datos abiertos de València" al hacer el repositorio público con marca genérica. Un año de
trabajo después, el usuario quiere que el proyecto tenga una identidad propia y
memorable de cara a darlo a conocer, sin que eso suponga volver a cerrarlo ni crear una
empresa detrás.

## Decisión

### Qué cambia

- **Nuevo nombre de producto: Mirall.**
- **Descriptor, visible en la cabecera de la app junto al nombre:** "Urban Intelligence
  Platform" (`MARCA.descriptor`, `src/config/marca.ts`). El nombre se pinta con una
  tipografía de palo con más carácter (Space Grotesk, cargada solo para el wordmark de la
  cabecera) en vez del tipo de letra genérico del resto de la interfaz.
- **Eslogan (ES), de presentación externa — no se muestra dentro de la app:** "La ciudad
  reflejada en tiempo real" (`MARCA.tagline`) — para README, LinkedIn y material de
  difusión, no para la cabecera ni el manifest de PWA.
- El cambio es **hacia adelante**: se actualizan el nombre y la identidad visible en el
  producto (config de marca, título, manifest PWA, README, `CLAUDE.md` §1) y en cualquier
  material de difusión nuevo. **No se reescribe el historial** — `specs/INDEX.md`, las
  specs ya cerradas y ADR-002/ADR-003 se dejan tal cual, como registro de lo que se decidió
  y con qué nombre en su momento. Lo relevante es cómo se presenta el proyecto **a partir
  de ahora**, no reescribir cómo se llamaba antes.
- El logo se mantiene como el placeholder abstracto ya generado por
  `scripts/generar-marca.ts` (ADR-002) — no lleva texto, así que el cambio de nombre no lo
  invalida. Si en el futuro se quiere un motivo más literal (p. ej. un espejo/reflejo,
  coherente con "Mirall" y la tagline), es una decisión de diseño aparte, no un requisito
  de este ADR.

### Qué NO cambia (se reafirma explícitamente)

- **Sigue siendo un proyecto de código abierto, licencia MIT.** No hay una empresa detrás
  de esta decisión — es un cambio de nombre e identidad del producto, hecho por el usuario
  como co-autor, no la creación de una entidad comercial.
- **Excepción ya existente, sin cambios**: las cámaras en vivo (spec `038`) siguen siendo
  una fuente "personal" gateada por variable de entorno (ADR-003), no activa por defecto
  en un despliegue público — eso ya era así antes de este ADR y sigue igual.
- Todo lo que ADR-002 reafirmó sigue vigente sin tocar: `CLAUDE.md` §4 (límite ético/legal)
  íntegro, `CLAUDE.md` §5 (decisiones técnicas), el flujo spec-driven de `CLAUDE.md` §2, el
  gate de acceso opcional (spec `018`).

## Consecuencias

- `CLAUDE.md` §1 se reescribe con el nuevo nombre.
- Spec `030` v4 implementa el cambio en código: `src/config/marca.ts`, `index.html`
  (`<title>`, meta de PWA), `vite.config.ts` (manifest de `vite-plugin-pwa`, hoy
  hardcodeado en vez de leer de `marca.ts`), `README.md`, `src/ui/chasis.ts` (título de
  modal hardcodeado), `docs/PRESENTACION_LINKEDIN.md`, y las descripciones de los agentes
  internos (`.claude/agents/*.md`) que citan el nombre de producto.
- No se tocan los prefijos internos `imc:*` usados en claves de `localStorage` — son
  detalle de implementación invisible para quien usa la app, y cambiarlos rompería
  preferencias ya guardadas de usuarios reales sin ningún beneficio real.
- `ROADMAP.md` y `specs/INDEX.md` incorporan el nombre nuevo en las filas que se editan de
  aquí en adelante; las filas ya cerradas no se reescriben.
