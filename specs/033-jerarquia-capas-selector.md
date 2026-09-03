# 033 — Jerarquía de capas en el selector

```yaml
id: 033
titulo: "Agrupar el selector de capas en 'estado en tiempo real' vs 'contexto e informativas'"
estado: Draft
tipo: capa
depende_de: [019]
propietario: ""
version: 1
```

## 1. Problema / motivación

El selector de capas (`#controls`) es hoy una lista plana de 9 casillas con el mismo
peso visual. No todas merecen la misma prominencia: el estado del tráfico, el Pulso de
Distrito o las incidencias de vía pública son "qué está pasando ahora", mientras que
Valenbisi, aparcamiento, Fallas, el contexto de prensa o los términos en tendencia son
información de apoyo que no hace falta tener siempre delante. Agruparlas reduce la
carga visual y deja claro qué mirar primero.

**Framing (decidido con el usuario, 2026-09-04):** los grupos se nombran con criterio
**neutro** — *estado en tiempo real* vs *contexto e informativas*. No se etiqueta por
tipo de usuario (p. ej. "policía" / "ciudadano"): eso reintroduciría la orientación de
audiencia institucional que [ADR-002](../docs/decisiones/ADR-002-repo-publico-marca-generica.md)
retiró (`CLAUDE.md` §1).

## 2. Fuente(s) de datos

No aplica — no consume ninguna fuente externa. Es una reorganización de UI sobre capas
que ya existen.

## 3. Contrato de datos (normalizado)

Se añade un campo al registro único de capas (`src/config/map-layer-definitions.ts`),
manteniendo el patrón "una capa = una entrada" de `CLAUDE.md` §5:

```typescript
type GrupoCapa = 'tiempo-real' | 'contexto';

interface LayerDefinition {
  // ...campos actuales...
  grupo: GrupoCapa;   // en qué sección del selector aparece
}
```

Asignación inicial (revisable cambiando solo el registro):

| Capa | `grupo` |
|---|---|
| `trafico` (`004`) | `tiempo-real` |
| `pulsoDistrito` (`010`) | `tiempo-real` |
| `incidenciasViaPublica` (`026`) | `tiempo-real` |
| `valenbisi` (`005`) | `contexto` |
| `aparcamiento` (`006`) | `contexto` |
| `fallas` (`008`) | `contexto` |
| `contextoMediatico` (`009`) | `contexto` |
| `tendenciaTerminos` (`025`) | `contexto` |
| `movimientoPersonasMock` (`003`) | `contexto` |

`distritos` (`000`) no aparece en el selector (capa base), no necesita grupo.

## 4. Pipeline (seed → caché → endpoint)

No aplica. No hay endpoint nuevo ni caché.

## 5. Contrato de capa de mapa

No es una capa nueva. Cambios de chasis (spec `019`), en `buildControlPanel()`
(`src/main.ts`) y su CSS:

- El selector se divide en dos secciones con encabezado:
  1. **"Estado en tiempo real"** — siempre visible y expandida.
  2. **"Contexto e informativas"** — encabezado con contador (`3 / 6 activas`) y
     plegable (`<details>`), **plegada por defecto** salvo que haya alguna capa del
     grupo activa (en ese caso arranca abierta) o que el estado venga de una URL
     compartida con capas de ese grupo.
- La casilla `Densidad de personas` conserva su badge `MOCK` dentro del grupo
  `contexto`.
- El orden dentro de cada grupo se toma del registro (orden de declaración).
- En móvil (spec `029`, `#controls` reparentado al bottom sheet) el mismo plegado
  aplica; el grupo plegado ahorra scroll en la hoja.
- El estado abierto/plegado del grupo `contexto` se recuerda en `localStorage`
  (`vlc:selector:contexto-abierto`) — conveniencia por visitante, con `try/catch`.

Sin cambios en `LayerToggle`, en el registro de paneles de datos (`#info-panels`) ni
en el estado en URL (spec `012`): esto solo reordena y agrupa casillas.

## 6. Criterios de aceptación (Definition of Done)

- [ ] `grupo` añadido a `LayerDefinition` y poblado para las 9 capas del selector;
      `tsc` obliga a que ninguna entrada del selector se quede sin grupo.
- [ ] `buildControlPanel()` renderiza dos secciones con encabezado a partir del
      registro (no lista plana hardcodeada); el grupo `contexto` es un `<details>`
      plegable con contador de activas.
- [ ] El grupo `contexto` arranca plegado en un primer arranque limpio, y abierto si
      alguna de sus capas está activa (por defecto ninguna lo está).
- [ ] Activar/desactivar cualquier capa sigue funcionando igual que antes
      (verificado en navegador con las 9 capas).
- [ ] Layout correcto en escritorio y en el bottom sheet móvil (spec `029`), targets
      táctiles ≥ 44 px.
- [ ] `npm run typecheck`, `npm run test` y `npm run build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance:** reordenar o agrupar los paneles de datos de `#info-panels`
  (meteo, aire, predicción, insights) — esos no están en el selector y se abordan, si
  hace falta, junto con la spec `034` (dashboard). Personalización del grupo por el
  usuario. Un tercer nivel de jerarquía. Cambiar qué capas existen.
- **Riesgo bajo:** el nombre de los grupos es una decisión de copy; si no convence,
  se cambia en un único literal sin tocar lógica.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-04 | Creación (Draft). Framing neutro de los grupos decidido con el usuario (no "policía/ciudadano", por ADR-002). Pendiente de aprobación antes de implementar. |
