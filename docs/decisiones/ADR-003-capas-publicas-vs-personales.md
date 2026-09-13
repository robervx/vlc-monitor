# ADR-003 — Capas y paneles "personales" vs. repo público

**Fecha:** 2026-09-14
**Estado:** Aceptado — decisión del product owner, fuera de una sesión de código (`CLAUDE.md` §3 y §8).

---

## Contexto

Al investigar dos capacidades nuevas (`038` cámaras urbanas en vivo, `039` actualidad institucional en redes) aparece un caso que no encajaba en las categorías que ya teníamos:

- Algunas fuentes tienen un cauce de reuso **inequívoco** (un embed de YouTube, pensado y autorizado explícitamente por la plataforma para terceros; un widget oficial de Facebook/X, gratuito y sin revisión de app). Estas pueden ir en el repo público, activas por defecto, igual que cualquier otra spec `Implemented`.
- Otras son técnicamente accesibles (CORS abierto, sin autenticación) pero su titular **no ha dado un permiso escrito de reuso** — solo un aviso legal genérico de "derechos reservados" sin mención de embebido. No llegan al nivel de "cauce legal explícito" que pide `CLAUDE.md` §4 para el repo público (donde cualquiera puede desplegar y quedaría expuesto a esa ambigüedad sin saberlo), pero para un uso personal, no comercial, de una sola persona, el riesgo es de otro orden.

Hasta ahora el proyecto no tenía una tercera categoría entre "lo implementamos" y "lo descartamos" — y el product owner ha decidido explícitamente que sí hace falta, y que esto va a repetirse ("nos interesa ir más allá").

## Decisión

**Toda fuente nueva se clasifica, en su propia spec, en una de tres categorías:**

1. **Pública** — cauce explícito (licencia abierta, mecanismo de embebido ofrecido por la propia plataforma para terceros, o permiso escrito). Va en el repo, activa por defecto, sin flag.
2. **Personal (gateada)** — técnicamente viable pero sin permiso escrito explícito del titular; asunción de riesgo por uso personal y no comercial de una sola persona. El código vive en el repo público (transparencia total, MIT — cualquiera audita exactamente qué hace), pero **no se activa nunca por defecto**: requiere una variable de entorno `VITE_PERSONAL_<NOMBRE>` que solo pone quien despliega su propia instancia y asume la responsabilidad de ese uso. Ausencia de la variable = comportamiento idéntico al repo público estándar.
3. **Descartada** — como hasta ahora (prohibición explícita del titular, o ninguna vía legal ni técnica razonable).

**Mecanismo técnico**: mismo patrón que el gate de acceso opcional de spec `018` (`AUTH_SECRET` ausente → app abierta; presente → gate activo). Aquí: `VITE_PERSONAL_<NOMBRE>` ausente → la capa/panel no se registra ni se muestra; presente (`"1"` o cualquier valor no vacío) → se registra igual que cualquier otra capa. Se lee en build/runtime de cliente vía `import.meta.env` (prefijo `VITE_` obligatorio en Vite para que llegue al bundle del navegador). Nombre por variable, no un interruptor maestro — cada fuente personal se activa por separado y queda auditable cuál está encendida.

**En la spec de cada fuente** (tabla de fuentes, mismo sitio donde ya se documenta "verificada manualmente el ___"): columna o nota explícita de en qué categoría cae y por qué, para que quede escrito el razonamiento, no solo el resultado.

### Ejemplo ya identificado (spec `038`)

- Embed de YouTube de un directo público → **Pública**.
- Stream DASH de la Red de Webcams de la Comunitat Valenciana (Turisme CV) → **Personal**, `VITE_PERSONAL_CAMARA_TURISME_CV`, hasta que exista un permiso escrito — momento en el que pasaría a Pública sin cambiar el código, solo quitando el gate.

## Qué NO cambia

- `CLAUDE.md` §4 (límite ético/legal) sigue íntegro — esta categoría "personal" es sobre **derechos de reutilización de contenido de terceros**, no sobre datos de localización individual ni sobre ninguna de las cuatro reglas duras de §4. No es una puerta trasera para saltárselas.
- El código de una fuente "personal" sigue siendo código público, legible y auditable — MIT íntegro. Lo único que cambia es si se activa por defecto.
- Sigue haciendo falta spec `Draft`/`Approved` antes de implementar, igual que cualquier otra fuente (`CLAUDE.md` §2).

## Consecuencia en `CLAUDE.md`

Se añade una entrada corta a la sección 5 (decisiones técnicas) que remite a este ADR, siguiendo el mismo patrón que la referencia a ADR-002.
