# 033 — Jerarquía de capas en el selector

```yaml
id: 033
titulo: "Agrupar el selector de capas: primarias vs contexto, con peso visual y preset de vista"
estado: Implemented
tipo: capa
depende_de: [019]
propietario: ""
version: 2
```

## 1. Problema / motivación

El selector de capas (`#controls`) es hoy una lista plana de 9 casillas con el mismo
peso visual. No todas merecen la misma prominencia: el estado del tráfico, el Pulso de
Distrito o las incidencias de vía pública son "qué está pasando ahora", mientras que
Valenbisi, aparcamiento, Fallas, el contexto de prensa o los términos en tendencia son
información de apoyo que no hace falta tener siempre delante. Agruparlas reduce la
carga visual y deja claro qué mirar primero.

**Framing:** los grupos se nombran con criterio **neutro** — *estado en tiempo real*
vs *contexto e informativas*. No se etiqueta por tipo de usuario ni audiencia, en
coherencia con [ADR-002](../docs/decisiones/ADR-002-repo-publico-marca-generica.md) y
`CLAUDE.md` §1.

## 2. Fuente(s) de datos

No aplica — no consume ninguna fuente externa. Es una reorganización de UI sobre capas
que ya existen.

## 3. Contrato de datos (normalizado)

Se añade un campo al registro único de capas (`src/config/map-layer-definitions.ts`)
como fuente de verdad de a qué grupo pertenece cada capa (`CLAUDE.md` §5, "una capa =
una entrada"):

```typescript
type GrupoCapa = 'primaria' | 'contexto';

interface LayerDefinition {
  // ...campos actuales...
  grupo: GrupoCapa;
}
```

| Capa | `grupo` |
|---|---|
| `trafico` (`004`) | `primaria` |
| `pulsoDistrito` (`010`) | `primaria` |
| `incidenciasViaPublica` (`026`) | `primaria` |
| `valenbisi` (`005`) | `contexto` |
| `aparcamiento` (`006`) | `contexto` |
| `fallas` (`008`) | `contexto` |
| `contextoMediatico` (`009`) | `contexto` |
| `tendenciaTerminos` (`025`) | `contexto` |
| `movimientoPersonasMock` (`003`) | `contexto` |

`distritos` (`000`) no aparece en el selector (capa base), no necesita grupo.

**Nota de alcance:** `buildControlPanel()` sigue siendo HTML con ids fijos
(`#toggle-trafico`…) por los que el resto de `main()` engancha los listeners; esta
spec **agrupa y da peso visual** a esos nodos, no reescribe el selector como bucle
sobre el registro (eso sería un refactor con riesgo de regresión, aparte). El campo
`grupo` documenta la asignación en un solo sitio y `tsc` obliga a mantenerlo.

## 4. Pipeline (seed → caché → endpoint)

No aplica. No hay endpoint nuevo ni caché.

## 5. Contrato de capa de mapa

No es una capa nueva. Cambios en `buildControlPanel()` (`src/main.ts`) y su CSS:

### 5.1 Dos grupos

1. **"Prioritarias"** — `trafico`, `pulsoDistrito`, `incidenciasViaPublica`. Siempre
   visible y expandida. **Peso visual**: borde izquierdo de acento (`#f2c744`), etiqueta
   algo más marcada, más aire entre filas.
2. **"Contexto e informativas"** — `valenbisi`, `aparcamiento`, `fallas`,
   `contextoMediatico`, `tendenciaTerminos`, `movimientoPersonasMock`. `<details>` con
   encabezado + contador (`2 / 6`), **plegado por defecto** salvo que (a) alguna de sus
   capas esté activa o (b) el estado venga de una URL compartida con capas del grupo.
   Filas atenuadas (`opacity` ~0.85, sin borde de acento).
- La casilla `Densidad de personas` conserva su badge `MOCK`, dentro de `contexto`.
- El estado abierto/plegado de `contexto` se recuerda en `localStorage`
  (`imc:selector-contexto-abierto`), con `try/catch`.
- Móvil (spec `029`, `#controls` reparentado al bottom sheet): el mismo plegado aplica
  y ahorra scroll en la hoja.

### 5.2 Preset "Vista operativa"

Botón en la cabecera del selector. Al pulsarlo:

- Activa las 3 capas `primaria` que estén apagadas; **no toca** las de `contexto`
  (respeta lo que el usuario ya tenía).
- Pliega el grupo `contexto`.
- Es un atajo de un solo sentido — no hay "desactivar vista operativa"; el usuario
  apaga capas a mano si quiere. Un segundo clic no hace nada nuevo (idempotente).
- No persiste estado propio: solo dispara los toggles existentes, que ya persisten por
  su cuenta (spec `012`, estado en URL).

Sin cambios en `LayerToggle`, en `#info-panels` ni en el contrato del estado en URL.

## 6. Criterios de aceptación (Definition of Done)

- [x] `grupo?: GrupoCapa` en `LayerDefinition`, poblado para las 9 capas del selector
      (`meteo`/`calidadAire`/`distritos` no están en el selector, exentas).
- [x] El selector muestra dos grupos: "Prioritarias" (borde de acento `#f2c744`,
      siempre abierto) y "Contexto e informativas" (`<details>` con contador `N / 6`,
      plegado por defecto, filas atenuadas).
- [x] `contexto` arranca plegado; se abre solo si alguna de sus capas se activa
      (verificado por DOM: toggle → `details.open = true`). Estado abierto/plegado
      recordado en `localStorage` (`imc:selector-contexto-abierto`).
- [x] Botón "Vista operativa": enciende las 3 prioritarias apagadas (dispara su
      `change` real), no toca contexto, pliega contexto. Idempotente. Verificado por DOM.
- [x] Las 9 capas siguen activándose/desactivándose igual (verificado en navegador con
      6 capas activas simultáneas + sus leyendas).
- [x] Layout correcto en escritorio y en móvil (`#controls` reparentado al bottom
      sheet, spec `029`).
- [x] `npm run typecheck`, `npm run test` (276/276), `npm run build` sin regresiones.

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
| 1 | 2026-09-04 | Creación (Draft). Framing neutro de los grupos (no por audiencia, por ADR-002). |
| 2 | 2026-09-09 | Draft ampliada tras revisión con el usuario: grupos "Prioritarias" / "Contexto e informativas", **peso visual** en el grupo primario, **preset "Vista operativa"**. Alcance acotado: se agrupan los nodos HTML actuales, no se reescribe el selector como bucle sobre el registro. **Implementado y verificado el mismo día**: `grupo` en `map-layer-definitions.ts`, `buildControlPanel()` reestructurado (`#controls__head`, grupos, `<details>` con contador y persistencia), CSS en `index.html`, preset + contador en `main()`. Pasa a `Implemented`. |
