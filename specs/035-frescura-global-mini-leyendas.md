# 035 — Indicador de frescura global + mini-leyendas plegables

```yaml
id: 035
titulo: "Resumen de frescura en la cabecera y leyendas de capa que se colapsan"
estado: Implemented
tipo: capa
depende_de: [019]
propietario: ""
version: 1
```

## 1. Problema / motivación

Dos ruidos visuales de la pantalla actual:

1. **Frescura repartida.** Cada panel dice "actualizado hace N min" por su cuenta. No
   hay forma de saber de un vistazo si *todo* está al día o si alguna fuente está
   sirviendo datos viejos, sin recorrer panel por panel.
2. **Leyendas que ocupan mucho.** Con varias capas activas, `#info-panels` se llena de
   tarjetas de leyenda (conteos por estado, atribución, frescura) que casi siempre se
   miran una vez y estorban el resto del tiempo.

## 2. Fuente(s) de datos

Ninguna nueva. Reutiliza el `fresh` / `fetchedAt` que ya devuelven todos los endpoints.

## 3. Contrato de datos (normalizado)

Módulo nuevo `src/ui/estado-frescura.ts` — registro en memoria, sin persistencia:

```typescript
interface ResultadoFuente { ok: boolean; fresh: boolean; fetchedAt?: string; }
interface RollupFrescura {
  total: number; alDia: number; conRetraso: number;
  masReciente: string | null;
  estado: 'cargando' | 'al-dia' | 'retraso';
}
registrarFrescura(id: string, r: ResultadoFuente): void;
onCambioFrescura(cb: (r: RollupFrescura) => void): void;
```

Cada refresco de panel llama a `registrarFrescura` con su resultado (éxito o fallo).
v1 cablea las 5 fuentes siempre activas: meteo, predicción, aire, insights, histórico
de tráfico. Las capas opcionales (tráfico, Valenbisi…) tienen su frescura visible en
su propia leyenda y no entran en el rollup.

## 4. Pipeline (seed → caché → endpoint)

No aplica. Sin endpoint ni caché nuevos.

## 5. Contrato de capa de mapa

No es una capa.

### 5.1 Rollup en la cabecera (spec `019`)

Junto a "EN VIVO": un texto corto (`· N fuentes · hace N min`, o `· N/M con retraso`)
y el color de "EN VIVO" + el punto pasan a **verde** (todo al día), **ámbar** (alguna
fuente con retraso) o **gris** (aún cargando). `title` con el desglose. En móvil solo
cambia el color (el texto se oculta, cabecera compacta — spec `029`).

### 5.2 Mini-leyendas (spec `019` §1 / `#info-panels`)

Cada tarjeta de leyenda de capa (`trafico-leyenda`, `valenbisi-leyenda`,
`aparcamiento-leyenda`, `pulso-leyenda`, `fallas-leyenda`, `via-publica-leyenda`)
arranca **colapsada** a una línea: título + el dato de cabecera (p. ej. "Tráfico —
406 fluido"). Al pasar el ratón por encima (o al hacer foco / tocar) se expande a la
leyenda completa. Los paneles fijos de datos (meteo, aire, predicción, insights,
histórico) **no** se colapsan — son el contenido principal, no leyendas.

## 6. Criterios de aceptación (Definition of Done)

- [x] `estado-frescura.ts` con su contrato; 5 fuentes cableadas (éxito y `catch`).
- [x] Cabecera: color verde/ámbar/gris + texto de rollup + `title`; el texto se oculta
      en móvil. Verificado por DOM y en navegador (al-día → verde "5 fuentes · hace N
      min"; forzar una fuente stale → ámbar "1/5 con retraso").
- [x] Mini-leyendas: las 6 leyendas de capa (`buildInfoPanel(id, { colapsable: true })`)
      arrancan colapsadas a su primera línea (título enriquecido con el dato clave) y se
      expanden al `:hover` / `:focus-within` / tap (`.is-expandida`). Los 5 paneles de
      datos fijos no cambian. Verificado en navegador con las 3 capas prioritarias
      activas (colapsadas a una línea; expandir una muestra la leyenda entera).
- [x] `npm run typecheck` / `test` (276/276) / `build` sin regresiones.

## 7. Riesgos y fuera de alcance

- **Fuera de alcance:** persistir el estado colapsado/expandido por leyenda;
  configurar qué fuentes entran en el rollup; un histórico de caídas de fuente.
- **Riesgo bajo:** en táctil no hay `hover` — la leyenda se expande al tocar el título
  (toggle), se vuelve a tocar para colapsar.

## 8. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1 | 2026-09-09 | Creación + implementación completa. §5.1 rollup de frescura en la cabecera (`estado-frescura.ts` + 5 fuentes + color verde/ámbar/gris). §5.2 mini-leyendas colapsables (`buildInfoPanel(..., { colapsable })` + CSS `:hover`/`:focus-within`/`.is-expandida`), títulos de leyenda enriquecidos con el dato clave. typecheck/test 276/276, verificado en navegador. Pasa a `Implemented`. |
