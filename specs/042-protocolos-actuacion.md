# 042 — Página de protocolos de actuación

```yaml
id: 042
titulo: "Contenido de referencia: qué hacer antes/durante de fenómenos adversos, punto de vista policía local"
estado: Implemented
tipo: capa
depende_de: [040]
propietario: ""
version: 2
```

> **Estado:** v2 `Implemented` (2026-09-17) — el usuario confirmó el borrador de "Lluvias
> intensas" tal cual (§2/§6), queda como contenido válido de v1 de esta spec. Bloqueante de
> revisión (§7) resuelto — deja de ser un riesgo abierto.

## 1. Problema / motivación

Cuando se decreta una alerta (p. ej. lluvia intensa), a nadie le vendría mal tener a mano,
en el mismo sitio donde ve la alerta, qué se recomienda hacer antes y durante desde el
punto de vista de la policía local — sin tener que buscarlo en otro sitio. Es contenido de
referencia, no una capa de datos en vivo.

## 2. Fuente(s) de datos

**No verificada todavía.** Esta spec se congela en `Draft` hasta que el contenido real de
cada protocolo se redacte con y sea revisado por el usuario (o una fuente oficial que él
señale) — no se inventa un procedimiento operativo real sin que él lo confirme, por el
mismo motivo que spec `021` no inventa cifras de perímetro sin fuente citada. No hay
llamada a ninguna API externa; es contenido estático versionado en el repo.

| Fuente | URL | Licencia / condiciones | ¿Requiere API key? | Verificada manualmente el ___ |
|---|---|---|---|---|
| Contenido a redactar/revisar con el usuario | — | — | No | **Confirmado por el usuario el 2026-09-17** — "Lluvias intensas" (recomendaciones generales de protección civil, sin fuente oficial citada) aprobado tal cual, sin cambios |

## 3. Contrato de datos (normalizado)

```typescript
interface ProtocoloActuacion {
  id: string;
  titulo: string;               // p.ej. "Lluvias intensas"
  antes: string[];               // medidas preventivas, lenguaje llano
  durante: string[];
  fuente?: string;                // si se basa en un protocolo oficial citable
  ultimaRevision: string;         // ISO 8601 — fecha de la última revisión de contenido con el usuario
}
```

## 4. Pipeline (seed → caché → endpoint)

No aplica — contenido estático versionado en `src/config/protocolos-actuacion.ts` (mismo
patrón `def()` que el resto de config estática del proyecto, `CLAUDE.md` §5), sin fuente
externa ni caché.

## 5. Contrato de capa de mapa

No aplica — es una página de contenido, no una capa geoespacial. Vive dentro de la vista
`/inteligencia` de spec `040`.

## 6. Criterios de aceptación (Definition of Done)

- [x] Contenido de cada protocolo redactado y **revisado explícitamente por el usuario**
      antes de publicarse — "Lluvias intensas" confirmado tal cual el 2026-09-17, sin
      cambios.
- [x] Al menos el protocolo de "lluvias intensas" cubierto (motivador de esta spec).
- [x] Página accesible desde la vista `/inteligencia` (`#protocolos-panel`), con fecha de
      última revisión siempre visible ("Última revisión: 16 de septiembre de 2026") — el
      mecanismo funciona; lo pendiente es el contenido en sí, no la infraestructura.
      Verificado en navegador (escritorio y móvil).
- [x] `npm run typecheck` / `npm run test` (367/367) / `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo principal, explícito — mitigado, no eliminado**: publicar un procedimiento
  operativo real inventado o desactualizado. El contenido de "Lluvias intensas" está
  confirmado por el usuario, pero sigue sin una fuente oficial citada (§2) — cada
  protocolo lleva su fecha de última revisión visible para que se note si queda
  desactualizado, y cualquier protocolo nuevo pasa por el mismo cauce de revisión.
- **Fuera de alcance v1**: cualquier protocolo más allá de los que el usuario confirme
  explícitamente; no se generaliza a todos los fenómenos posibles de una vez.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-16 | Creación (Draft), como parte del DoD de V1 (`docs/02_DEFINITION_OF_DONE_V1.md`). Contenido real pendiente de redactar y revisar con el usuario — bloqueante explícito para `Approved`. **Mismo día:** infraestructura implementada — `src/config/protocolos-actuacion.ts` (3 tests), `src/ui/protocolos-panel.ts` dentro de `/inteligencia`, fecha de "última revisión" siempre visible. Contenido de "Lluvias intensas" redactado como **borrador** (recomendaciones generales de protección civil, sin fuente oficial citada) — presentado al usuario para revisión explícita, sigue en `Draft` hasta su confirmación (§0/§7, bloqueante no resuelto). |
| 2 | 2026-09-17 | El usuario confirmó el borrador de "Lluvias intensas" tal cual, sin cambios. Bloqueante de revisión resuelto. Spec pasa a `Implemented`. |
