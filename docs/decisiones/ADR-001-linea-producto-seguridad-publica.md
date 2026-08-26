# ADR-001 — Línea de producto de apoyo a decisión para seguridad pública (gemelo digital agregado)

**Fecha:** 2026-08-18
**Estado:** 🟢 Aceptado (2026-08-18) — Opción C, orientación de producto decidida por el product owner. Ver sección "Decisión" para el detalle y lo que queda por resolver antes de escribir código de cabecera/sidebar.
**Documento de referencia:** `docs/investigacion/GEMELO_DIGITAL_SEGURIDAD_PUBLICA_PROPUESTA.md` (diseño técnico completo — este ADR es solo la decisión, no repite el detalle).
**Quién decide:** product owner del proyecto, fuera de una sesión de código, tal como exige `CLAUDE.md` §3 y §8.

---

## Contexto

`CLAUDE.md` §1 fija que VLC Monitor no es una herramienta operativa policial — ese pivote ya se cerró (`docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §3.6). En sesión de diseño se ha explorado si tiene sentido abrir una línea nueva, separada, de apoyo a la toma de decisiones para Policía Local, construida exclusivamente sobre datos agregados por calle (nunca individuales) y bajo el principio "avisa, no actúa" ya fijado en `CLAUDE.md` §4. El resultado de esa exploración es la propuesta técnica de referencia. Este ADR existe para decidir **si** y **con qué alcance** se activa.

---

## Decisión a tomar

¿Se aprueba iniciar trabajo formal (specs en `specs/`) sobre esta línea, y con qué alcance inicial?

## Opciones

### A — No iniciar (statu quo)
VLC Monitor sigue siendo únicamente el panel ciudadano ya definido en el roadmap actual. La propuesta queda archivada como referencia.
- **A favor:** cero riesgo de desviar foco/recursos del roadmap ciudadano ya en marcha; cero riesgo reputacional de mezclar "transparencia ciudadana" con "herramienta para la policía" en la percepción pública.
- **En contra:** se pierde el valor potencial identificado (gestión de grandes eventos, simulación de cortes de tráfico, detección temprana de aglomeraciones).

### B — Iniciar solo la infraestructura de valor dual (Fase 0 + Fase 2)
Grafo viario + simulador de escenarios de tráfico ("¿qué pasa si cortamos estas calles?"), sin la capa de línea base/anomalías ni el motor de alertas. Esta pieza tiene valor directo también para VLC Monitor ciudadano (ej. mostrar cortes de calle en Fallas, estado de movilidad) y es la de menor sensibilidad — no procesa ningún dato de densidad de personas.
- **A favor:** entrega valor rápido y de bajo riesgo; construye la base reutilizable sin comprometerse aún a la parte de alertas; puede vivir dentro del propio roadmap ciudadano sin necesitar un producto separado.
- **En contra:** no resuelve por sí sola el objetivo original (apoyo a decisión con anomalías de aglomeración).

### C — Iniciar la línea completa como producto separado
Todo lo descrito en la propuesta (Fase 0 a 4 + motor CEP), como producto distinto de VLC Monitor ciudadano, con interfaz y despliegue propios.
- **A favor:** cubre el objetivo completo planteado.
- **En contra:** mayor esfuerzo sostenido; requiere validar interlocución real con Policía Local/Ayuntamiento (sin un destinatario operativo confirmado, es una herramienta sin usuario); mantener dos líneas de producto duplica coste de mantenimiento; la Fase 3 (contrato de datos agregados de operadora) tiene un lead time de meses y requiere revisión de cumplimiento antes de activarse (`CLAUDE.md` §4).

### D — Posponer (backlog, sin fecha)
Se conserva la propuesta como está, sin asignar ningún trabajo todavía, a la espera de una señal externa (interés confirmado de Policía Local, disponibilidad de recursos).
- **A favor:** no cierra la puerta, no compromete nada ahora.
- **En contra:** ninguno relevante — es la opción de menor riesgo si hay duda real.

---

## Criterios que deberían pesar en la decisión

1. **¿Existe ya un interlocutor real en Policía Local/Ayuntamiento** interesado en usar esto, o es una hipótesis sin destinatario confirmado? Sin esto, la Opción C tiene riesgo alto de construir una herramienta sin usuario.
2. **Capacidad disponible** para sostener dos líneas de producto (ciudadana + apoyo a decisión) en paralelo, incluyendo el mantenimiento del motor de línea base/CEP a largo plazo.
3. **Coste reputacional** de que VLC Monitor, hoy conocido como panel de datos abiertos ciudadano, pase a tener una rama visible orientada a policía — aunque técnicamente estén separados.
4. **Lead time real de la Fase 3** (contrato de datos agregados de operadora + revisión de cumplimiento) — si no hay intención de iniciar esa conversación pronto, buena parte del valor diferencial de la propuesta (densidad más allá de tráfico vehicular) queda pospuesto de facto.

---

## Decisión

> **Actualización 2026-08-18:** el product owner ha fijado orientación de producto — **Opción C**, herramienta de despacho para mandos de Policía Local de València (no orientada al ciudadano), bajo nombre de marca propio ("Intelligent MonitorCity" — nombre corregido más tarde a **"Intelligent City Monitor"**, orden correcto en inglés, ver spec `019` v3), con cabecera de identidad institucional y una barra lateral plegable como chasis de navegación para ir añadiendo funcionalidades (empezando por lo descrito en la propuesta de gemelo digital).
>
> **Aclaración del product owner (mismo día):** no hay separación ciudadano/policía — es una única plataforma para un único usuario (Policía Local). La pantalla principal ya construida (mapa + capas F0-F4, estilo World Monitor) es el marco base sobre el que se añaden insights, widgets (p.ej. cuentas oficiales de X) y el resto de funcionalidad. Esto **supera la recomendación de §0 de la propuesta técnica** (que sugería línea de producto separada) — queda registrado aquí como la decisión real tomada, no la inicialmente propuesta. Reflejado ya en `CLAUDE.md` §1.
>
> Sub-decisión de logo: **resuelta** — el product owner confirma que dispone del archivo oficial y la autorización de Policía Local de València; pendiente solo de que aporte el fichero para incorporarlo a la cabecera.
>
> **Estado real de avance (no bloqueante, seguimiento):**
> - Spec `004` (tráfico tiempo real) y spec `013` (motor de insights/alertas "avisa, no actúa") ya estaban `Implemented` antes de este ADR y cubren buena parte de lo descrito en la propuesta técnica (§6 y §8 respectivamente) — no se parte de cero, se extiende lo ya construido.
> - Spec `012` (geolocalización / "qué tengo más cerca") estaba explícitamente bloqueada esperando "decisión sobre framing 'herramienta policial de campo'" — esta decisión la desbloquea; sigue pendiente de redactar como `Draft`.
> - Spec `011` (densidad de movilidad agregada real) sigue `Blocked` por contrato comercial + revisión de cumplimiento — esta decisión de audiencia no cambia esa condición.
> - Cabecera institucional + sidebar plegable: pendiente de reservar como entrada en `specs/INDEX.md` (chasis de aplicación, no una capa de datos) antes de escribir código, siguiendo `CLAUDE.md` §2.

## Próximos pasos si la decisión es B o C

1. Reservar número(s) de spec en `specs/INDEX.md` siguiendo `specs/SPEC_TEMPLATE.md` — separando la parte de grafo/simulador (Opción B, reutilizable por VLC Monitor ciudadano) de la parte de línea base + CEP orientada a apoyo policial (Opción C), como dos specs independientes aunque la segunda dependa de la primera.
2. Solo entonces arranca el flujo spec-driven habitual de `CLAUDE.md` §2 (spec → contrato → seed → endpoint → capa → verificación DoD).
3. Si se elige C, confirmar antes el punto 1 de los criterios (interlocutor real) — es la validación de menor coste y mayor impacto en la decisión antes de invertir esfuerzo de ingeniería.
