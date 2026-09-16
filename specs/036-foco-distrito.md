# 036 — Foco de distrito

```yaml
id: 036
titulo: "Un distrito seleccionado filtra/resalta los paneles con dato por distrito"
estado: Implemented
tipo: capa
depende_de: [000, 009, 010, 023]
propietario: ""
version: 2
```

> **Estado:** v1 `Implemented` y en producción. **v2 (2026-09-16)**: consumidor de spec
> 010 v4 — ver §8.

## 1. Problema / motivación

El mapa ya deja seleccionar un distrito (clic). Esa selección, por sí sola, no hace
nada más: para responder *"¿qué está pasando en Ciutat Vella?"* hay que leer todos los
paneles y filtrar mentalmente. Esta spec convierte la selección en un **foco**: los
paneles que tienen dato por distrito se acotan a él. (El resaltado visual del polígono
al seleccionar se retiró en spec `000` v4 — el foco sigue funcionando igual, el único
indicador visual pasa a ser el chip "Foco: X".)

## 2. Fuente(s) de datos

Ninguna nueva. Reutiliza lo que ya está en memoria: `distritosMencionados` del
contexto mediático (spec `023`) y el índice por distrito del Pulso (spec `010`).

## 3. Contrato de datos (normalizado)

Store en memoria, sin persistencia (patrón de `estado-frescura.ts` / `dashboard-kpis.ts`):

```typescript
interface FocoDistrito { codigo: string; nombre: string; }
setFocoDistrito(f: FocoDistrito | null): void;
getFocoDistrito(): FocoDistrito | null;
onCambioFoco(cb: (f: FocoDistrito | null) => void): void;
```

## 4. Pipeline (seed → caché → endpoint)

No aplica — sin endpoint ni caché nuevos.

## 5. Contrato de capa de mapa

No es una capa. Cambios de UI:

- **Selección → foco.** El `onClick` del distrito (ya existente) además de
  `selectedDistrito` llama a `setFocoDistrito`. Clic en el distrito ya seleccionado lo
  quita (toggle).
- **Chip** `#foco-distrito-chip` ("Foco: <distrito> ✕") bajo la tira de KPIs; ✕ limpia
  el foco y deselecciona el distrito en el mapa.
- **Contexto mediático** (`renderMediaticoPanel`): con foco, se muestra solo el grupo
  de ese distrito + los buckets "València (ciudad)" y "general" (que también pueden
  afectarle); los demás distritos se ocultan. Cabecera "Foco: <distrito>" y mensaje de
  vacío específico.
- **Pulso de Distrito** (`renderPulsoLeyenda`): se antepone una línea con el índice y
  la categoría del distrito en foco.
- El foco no se persiste ni va en la URL (a diferencia de `selectedDistrito`, spec
  `012`) — es una vista de trabajo momentánea.

## 6. Criterios de aceptación (Definition of Done)

- [x] `src/ui/foco-distrito.ts` con el store + `montarChipFoco`.
- [x] Clic en un distrito → chip visible con su nombre; clic de nuevo / ✕ → se limpia.
- [x] Contexto mediático se filtra al distrito en foco (verificado en navegador con
      prensa activa).
- [x] Pulso de Distrito antepone el índice del distrito en foco (verificado por DOM:
      "Ciutat Vella: 8 · Tranquilo").
- [x] `npm run typecheck` / `test` (284/284) / `build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance (posible v2):** filtrar también incidencias de vía pública (`026`,
  tienen `distritoCodigo`) y tráfico por distrito; una "tarjeta resumen de distrito"
  que agregue todo aunque las capas no estén activas (requeriría fetch por distrito);
  persistir el foco en la URL.
- **Riesgo bajo:** si el distrito en foco no tiene noticias propias, el panel muestra
  solo los buckets de ciudad — es correcto (esas noticias sí pueden afectarle), con
  mensaje explícito.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-09 | Creación + implementación. Store `foco-distrito.ts`, chip, filtro del contexto mediático y línea de índice en el Pulso. typecheck/test 284/284, verificado en navegador. Pasa a `Implemented`. |
| 2 | 2026-09-16 | Consumidor de spec 010 v4: la línea de "antepone" en `renderPulsoLeyenda` pasa de mostrar `índice`/`categoria` a mostrar `nivel` (`prioritario`/`seguimiento`/`sin señal`). El resaltado por hover/clic del distrito se retira en spec `000` v4 (§1 actualizado); el foco en sí no cambia de mecanismo. |
