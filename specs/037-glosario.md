# 037 — Glosario / cómo funciona

```yaml
id: 037
titulo: "Sección del sidebar que explica los conceptos y cómo se calcula cada cosa"
estado: Draft
tipo: capa
depende_de: [019, 010]
propietario: ""
version: 1
```

## 1. Problema / motivación

La app tiene conceptos que no son obvios: qué incluye el **Pulso de Distrito** y cómo
se calcula, qué significa el badge **MOCK**, qué es "avisa, no actúa", qué mide cada
capa, qué quiere decir "no en vivo", los tipos de alerta, el foco de distrito… Ahora
mismo hay que deducirlo. Falta una página de referencia dentro de la propia app.

## 2. Fuente(s) de datos

Ninguna. Contenido estático + valores que se **leen de las constantes reales** del
código (pesos y umbrales del Pulso, umbrales de insights) para que el glosario no se
desincronice de lo que hace la app.

## 3. Contrato de datos (normalizado)

No hay dato de dominio. El contenido se estructura como secciones:

```typescript
interface EntradaGlosario {
  termino: string;
  cuerpo: string;        // HTML simple (párrafos, listas), sin scripts
}
```

Entradas de v1:

| Término | Qué explica |
|---|---|
| Pulso de Distrito | Qué combina (tráfico, incidencias, aire, meteo), con qué peso, la fórmula y los umbrales de categoría — **valores tomados de `pulso-distrito.ts`**. Que aire y meteo son de ciudad, solo tráfico e incidencias distinguen distrito. |
| Capas del mapa | Una línea por capa: qué mide, cada cuánto se actualiza, de qué fuente. |
| Prioritarias vs Contexto | Por qué el selector separa en dos grupos (spec 033). |
| "En vivo" / "no actualizado" | Qué significa el color de "EN VIVO" y el aviso de dato cacheado (spec 035). |
| Alertas e insights | Los tipos de alerta, qué los dispara, y el principio "avisa, no actúa" (`CLAUDE.md` §4). |
| MOCK | La capa "Densidad de personas" es 100 % sintética (spec 003) — no representa nada real. |
| Foco de distrito | Clic en un distrito filtra prensa y Pulso a ese distrito (spec 036). |
| Fuentes y licencias | Enlace a `docs/FUENTES_Y_LICENCIAS.md` en el repo; todo es dato público y gratuito. |

## 4. Pipeline (seed → caché → endpoint)

No aplica.

## 5. Contrato de capa de mapa

No es una capa. Nueva entrada en `SIDEBAR_REGISTRY` (`src/ui/chasis.ts`, spec `019`):

```typescript
{ key: 'glosario', label: 'Glosario', icono: '📖', estado: 'disponible', specId: '037' }
```

Al abrirla, el panel del sidebar muestra la lista de entradas (acordeón: una abierta a
la vez, o todas expandibles). No cambia el modo del panel principal (a diferencia del
cordón/simulador) — es contenido de lectura dentro del propio sidebar expandido.

Los valores del Pulso se generan llamando a helpers exportados de `pulso-distrito.ts`
(p. ej. `PESOS_PULSO`, `UMBRALES_CATEGORIA_PULSO`) — si alguien cambia un peso, el
glosario lo refleja sin editar texto.

## 6. Criterios de aceptación (Definition of Done)

- [ ] Entrada `glosario` en `SIDEBAR_REGISTRY`; al abrirla se ve el contenido en el
      sidebar.
- [ ] La entrada "Pulso de Distrito" muestra los pesos y umbrales **leídos de las
      constantes**, no escritos a mano (verificado cambiando un peso en dev y viendo
      que el texto cambia).
- [ ] Las 8 entradas de §3 presentes, legibles en escritorio y en la hoja móvil.
- [ ] Enlace a `docs/FUENTES_Y_LICENCIAS.md` correcto.
- [ ] `npm run typecheck` / `test` / `build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance:** i18n del glosario (ES, como el resto), un buscador, tooltips
  contextuales por toda la UI (esto es una página, no ayuda inline), versionar el
  contenido.
- **Riesgo bajo:** el contenido puede quedar algo desactualizado si se añaden capas y
  no se añade su línea — mitigado parcialmente generando la lista de capas desde
  `LAYER_REGISTRY`.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-09 | Creación (Draft). Sale de la petición del usuario de una página de glosario en el lateral, junto con la recalibración del Pulso (spec `010` v3). |
