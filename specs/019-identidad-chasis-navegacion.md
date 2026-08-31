# 019 — Identidad de marca + chasis de navegación (cabecera + sidebar plegable)

```yaml
id: 019
titulo: "Cabecera (Intelligent City Monitor) + barra lateral plegable de funcionalidades"
estado: Implemented
tipo: fundacional
depende_de: [000]
propietario: ""
version: 4
```

## 0. Contexto de la decisión

Ver `docs/decisiones/ADR-001-linea-producto-seguridad-publica.md` (Aceptado, 2026-08-18) y `CLAUDE.md` §1. El producto pivota de audiencia — de panel ciudadano a herramienta de despacho para mandos de Policía Local de València, bajo el nombre de marca **"Intelligent City Monitor"**. Es una única plataforma: la pantalla principal ya construida (mapa + capas F0-F4) pasa a ser el marco base sobre el que se añade identidad institucional y un punto de entrada organizado para funcionalidad futura (insights, widgets de cuentas oficiales, y — si se aprueba por spec propia — lo descrito en `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md`).

Esta spec cubre únicamente el **chasis**: cabecera + navegación lateral. No implementa ninguna funcionalidad nueva de datos — esas son specs propias que cuelgan de este chasis (empezando por spec `012`, ya desbloqueada por el ADR-001).

## 1. Problema / motivación

Hasta ahora la pantalla no tenía identidad institucional ni un sitio organizado donde ir añadiendo funcionalidad nueva sin amontonarla en el mapa. Un mando policial que abre la herramienta en su despacho necesita reconocer de un vistazo que es su herramienta (marca + escudo), y necesita un punto de navegación estable a medida que se añaden piezas (configuración, gemelo digital, lo que venga) sin que cada una compita por espacio con el mapa.

## 2. Fuente(s) de datos

No aplica — esta spec no consume ninguna fuente externa ni añade ningún dato nuevo. Es chasis de interfaz (cabecera + navegación) sobre datos que ya sirven las specs existentes.

**Activo de marca (v4, spec `030` / ADR-002):** placeholder neutro generado (`public/assets/logo.png`, marca tipo radar sobre transparente; `scripts/generar-marca.ts`, Node puro). El escudo oficial de Policía Local de València que introdujo ADR-001 se retiró al publicar el repo. El nombre/tagline/pie viven en `src/config/marca.ts`.

## 3. Contrato de datos (normalizado)

No hay dato de dominio que normalizar. Sí conviene fijar el **registro de secciones del sidebar** como catálogo único, mismo patrón que `map-layer-definitions.ts` (`CLAUDE.md` §5: "una capa = una entrada, no tocar N sitios"):

```typescript
interface SidebarSectionDefinition {
  key: string;               // ej. 'configuracion', 'gemelo-digital'
  label: string;
  icono: string;
  estado: 'disponible' | 'placeholder'; // 'placeholder' = entrada visible, funcionalidad aún no implementada (ninguna spec Implemented la respalda todavía)
  specId?: string;            // spec que la implementa, si existe
}

const SIDEBAR_REGISTRY: SidebarSectionDefinition[] = [
  // v1: al menos una entrada real o un placeholder explícito — ver DoD
];
```

Una sección `placeholder` se muestra pero deja claro que no hace nada todavía (ej. "Próximamente") — nunca se simula funcionalidad que no existe.

## 4. Pipeline (seed → caché → endpoint)

No aplica — no hay pipeline de datos. Cabecera y sidebar son estado de UI local (plegado/desplegado persistido en `localStorage`, sin backend).

## 5. Contrato de capa de mapa

No es una capa de mapa — es chasis de aplicación (cabecera fija + navegación lateral), presente siempre, no activable/desactivable como una capa de datos. El mapa y los paneles existentes (meteo, aire, insights) se renderizan dentro de este marco sin cambios en su propio contrato.

## 6. Criterios de aceptación (Definition of Done)

- [x] Cabecera visible con el nombre y tagline de `src/config/marca.ts` y el logo `public/assets/logo.png` (v4: placeholder neutro, ver spec `030`); `<img>` con `onerror` que oculta el logo sin romper la cabecera si el fichero faltara.
- [x] Sidebar plegado por defecto, desplegable con el control `☰`/`⟨`, dos secciones registradas en `SIDEBAR_REGISTRY` (`gemelo-digital` como `placeholder`; `configuracion` como `disponible` con contenido real desplegable — ver v3 abajo) — verificado visualmente expandido y colapsado.
- [x] Sección "Configuración" (v3): panel desplegable con un checkbox por cada uno de los 5 paneles fijos del panel principal (`PANEL_PREFERENCES_REGISTRY` en `src/ui/panel-preferences.ts`), que oculta/muestra ese panel al instante y persiste la preferencia en `localStorage` (`imc:panel-visibility-hidden`) — verificado desmarcando "Calidad del aire" y confirmando que se oculta y sigue oculto tras recargar.
- [x] `#info-panels` (v3): `flex-wrap` + `max-height` con scroll interno — con varias leyendas de capa activas a la vez, las tarjetas ya no se amontonan en una sola fila ni invaden el panel de capas; se reparten en filas y, si no caben, el bloque hace scroll interno — verificado con 5 leyendas de capa activas simultáneamente (10 tarjetas en total).
- [x] Estado plegado/desplegado persiste entre recargas (`localStorage`, clave `imc:sidebar-expanded`) — verificado recargando con el sidebar expandido.
- [x] Ninguna capa ni panel existente (F0-F4, insights) pierde funcionalidad ni queda tapado por la cabecera/sidebar en su estado de reposo (colapsado) — verificado visualmente en navegador con el panel de capas, los paneles inferiores y el control de zoom de MapLibre, los tres reposicionados con `calc(var(--header-h) + 12px)` / `calc(var(--sidebar-w-collapsed) + 12px)`. El mapa se reancla con `top: var(--header-h)` para que el control nativo `top-right` de MapLibre no quede bajo la cabecera.
- [x] Responsive básico: sidebar expandido se abre como overlay temporal sobre el panel de capas (no reflow permanente) — comportamiento de cajón estándar, aceptado explícitamente en §7.
- [x] Pie del sidebar con `MARCA.pie` (v4: "Proyecto de datos abiertos · sin relación con ningún organismo oficial"); tagline de cabecera con `MARCA.tagline`. Ambos desde `src/config/marca.ts`.
- [x] Reloj de cabecera (v3): formato "pro" (monoespaciado, con segundos) + fecha completa en español debajo, indicador "EN VIVO" separado con divisor visual.
- [x] `npm run typecheck` y `npm run test` (108/108) verificados tras el cambio, sin regresiones.

## 7. Riesgos y fuera de alcance

- **Riesgo — control de acceso**: esta spec no añade autenticación. Si la herramienta pasa a contener información operativa real (más allá de datos públicos ya abiertos), publicarla sin protección de acceso es un problema antes de que sea un problema de diseño de sidebar. Spec `018` (Planned, "Publicación con contraseña en dominio propio") cubre exactamente esto — recomendable resolverla antes o junto con el primer despliegue de esta identidad, no después.
- **Riesgo — activo de marca ausente**: si el fichero de logo no llega, esta spec no se bloquea entera — se implementa con placeholder y se sustituye en una revisión menor cuando el archivo esté disponible.
- **Fuera de alcance de esta spec**: cualquier funcionalidad nueva de datos (gemelo digital, configuración real, etc.) — esta spec solo construye el sitio donde esas piezas futuras se van a enganchar, cada una con su propia spec.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-08-18 | Creación, `Draft`. Pendiente: fichero de logo oficial y verificación visual en navegador antes de pasar a `Implemented`. |
| 2 | 2026-08-19 | DoD completo: `src/ui/chasis.ts` (cabecera + sidebar con `SIDEBAR_REGISTRY`), CSS en `index.html`, mapa reanclado bajo la cabecera, paneles existentes reposicionados sin pérdida de funcionalidad. Logo oficial recibido y colocado en `public/assets/policia-local-valencia-logo.png`. Verificado con `npm run typecheck`, `npm run test` (105/105) y en navegador (colapsado, expandido, persistencia tras recarga). Spec pasa a `Implemented`. |
| 3 | 2026-08-19 | Ajustes tras feedback de uso: (1) renombrado "Intelligent MonitorCity" → "Intelligent City Monitor" (el orden original no es inglés correcto); (2) tagline sin "— herramienta interna"; (3) `#info-panels` con `flex-wrap` + scroll interno, corrige amontonamiento de leyendas de capa; (4) sección "Configuración" pasa de `placeholder` a `disponible`, con `src/ui/panel-preferences.ts` nuevo (registro + persistencia de qué paneles fijos se muestran); (5) reloj de cabecera rediseñado con fecha. Verificado con `npm run typecheck`, `npm run test` (108/108) y en navegador (checkboxes de capa simultáneos, toggle de Configuración, persistencia tras recarga). |
| 4 | 2026-08-29 | Re-marca genérica (spec `030` / ADR-002): se retira el escudo oficial de Policía Local de València (`public/assets/policia-local-valencia-logo.png` eliminado) y el lenguaje institucional. Logo → placeholder neutro `public/assets/logo.png` (`scripts/generar-marca.ts`). Nombre/tagline/pie centralizados en `src/config/marca.ts`, consumidos por `chasis.ts` y `pagina-login.ts`. El contexto §0 y la motivación §1 de esta spec quedan como registro histórico de ADR-001. |
