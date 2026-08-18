# Backlog de funcionalidades futuras — sesión 2026-08-18

**Rol de este documento:** captura literal (reformulada) de las ideas que el usuario quiere ir tratando punto por punto en próximas sesiones. Ninguna de estas ideas tiene spec redactada ni código asociado todavía. No implementar nada de aquí sin pasar antes por el flujo de `CLAUDE.md` §2 (spec → contrato → seed → endpoint → capa → DoD).

Cada punto queda enlazado a un id nuevo en `specs/INDEX.md` (estado `Planned`, "no redactada aún") y a una fase en `ROADMAP.md`, salvo el punto 7 que no es una spec de producto.

---

## ⚠️ Dos tensiones con reglas ya fijadas del proyecto — requieren decisión explícita del usuario antes de redactar spec

Antes de convertir los puntos 1 y 2 en specs `Draft`, hace falta que el usuario decida esto explícitamente (no se puede improvisar, ver `CLAUDE.md` §1 y §4):

- **Punto 1 (herramienta policial de campo):** `CLAUDE.md` §1 dice explícitamente que este proyecto **no** es el antiguo "CISE Command Center" (sala de llamadas policial) y que ese pivote está zanjado. Usar VLC Monitor como herramienta operativa para agentes en calle (geolocalización + "qué tengo más cerca") es un caso de uso distinto del "mapa ciudadano" descrito en `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §2.1. No es necesariamente incompatible — puede ser el mismo mapa público con una función de proximidad añadida — pero conviene decidir explícitamente si el público objetivo se amplía a personal policial en campo o si esto se queda como una función genérica ("qué tengo cerca") disponible para cualquier usuario.
- **Punto 2 (protocolo automático + envío de correo):** `CLAUDE.md` §4 fija una regla dura sin excepciones: *"Avisa, no actúa"* — cualquier capa de anomalías genera una alerta visible para que la revise una persona; el producto **nunca decide ni ejecuta una acción**. El ejemplo dado (detectar temperatura alta → activar protocolo → enviar correo a todas las unidades de forma automática) tal cual está descrito sería el sistema ejecutando una acción, no solo avisando. Para encajar en la regla, el diseño tendría que separar: *sistema detecta patrón → genera alerta visible + borrador de comunicación* de *persona con responsabilidad revisa y decide activar/enviar*. Esto hay que decidirlo explícitamente al redactar la spec 013, no interpretarlo por libre.

Ninguna de las dos bloquea documentar la idea aquí; sí bloquean pasar de `Planned` a `Draft`.

---

## 1. Geolocalización del usuario + "qué tengo más cerca" — spec `012`

**Idea del usuario:** se va a poner a disposición como herramienta vía web/app para uso policial con información en tiempo real. Hace falta que la persona que lo usa pueda posicionarse en el lugar donde está y que el sistema le diga qué es lo más cercano (de cada capa activa: incidencia de tráfico más próxima, aparcamiento libre más próximo, estación Valenbisi más próxima, etc.).

**Ver tensión arriba** sobre el framing "herramienta policial".

**Alcance técnico si se aprueba:** Geolocation API del navegador (con permiso explícito, nunca automático ni oculto), cálculo de distancia del usuario a las features de cada capa activa (turf.js u homólogo), panel/lista "más cercano" ordenado por distancia y filtrable por capa.

**Depende de:** `000` (mapa base) y, en la práctica, de cada capa que se quiera incluir en el ranking de proximidad (`001`–`006`).

**Fase propuesta:** `F5` (Pulido y compartición).

## 2. Motor de insights y alertas operativas — spec `013`

**Idea del usuario:** falta la parte de "insights" — panel inferior bajo el mapa con información que aporte valor para tomar decisiones, no solo el mapa con filtros. Ejemplo dado: detectar una señal de temperatura alta y disparar un aviso para activar el protocolo de calor en las unidades, con correo a las unidades con las especificaciones.

**Ver tensión crítica arriba** sobre "avisa, no actúa" — el diseño final debe generar alerta + borrador, nunca enviar/ejecutar por sí solo.

**Nota adicional:** el ejemplo original usaba "detectar un tuit" como disparador — la API de X/Twitter está fuera de alcance (`CLAUDE.md` §3, sin tier gratuito viable). Los disparadores de insights tendrían que salir de fuentes ya contempladas (meteo `001`, aire `002`, tráfico `004`, agenda `008`, contexto mediático RSS/GDELT `009`), no de X.

**Depende de:** `001`, `002`, `004`, `008`, `009` (cuantas más capas fuente existan, más insights posibles — no bloquea empezar con las que ya estén `Implemented`).

**Fase propuesta:** nueva `F3.6` — Motor de insights y alertas operativas.

## 3. Sistema de notificaciones sobre eventos y cortes de calle — spec `014`

**Idea del usuario:** alertas de interés — por ejemplo un evento cercano y las calles que se van a cortar por él.

**Relación con specs existentes:** esto es, en esencia, el propósito de la spec `008` (Agenda y aglomeraciones previsibles, F3.5, ya `Planned` sin redactar). Al redactar `008` habrá que decidir si el requisito de notificación (in-app / push / email) forma parte de su propio DoD o si se extrae como infraestructura reutilizable compartida con `013` (mismo motor de notificaciones, distintos disparadores).

**Depende de:** `008`, y de la infraestructura de notificaciones que también usaría `013`.

**Fase propuesta:** `F3.6` (junto a `013`).

## 4. Integración con Google Maps / Waze para redirigir rutas por cortes — spec `015`

**Idea del usuario:** analizar cómo dar valor a la información agregada; en concreto, que si alguien traza una ruta un día de carrera popular en Valencia, su navegador (Waze/Google Maps) tenga en cuenta los cortes — hoy eso no pasa.

**Nota de viabilidad (importante antes de tratarlo como spec `Draft`):** esto no es una integración que VLC Monitor controle unilateralmente — requiere que Waze/Google *consuman* nuestros datos, no al revés.
- Waze tiene un programa real para esto: **Waze for Cities / Connected Citizens Program**, pensado para que administraciones publiquen cierres de vía en un formato que Waze ingiere. Pero normalmente exige que sea el propio Ayuntamiento (no un proyecto de terceros) quien tenga el convenio.
- Google no tiene un equivalente self-service público conocido para cierres de calle de terceros.

Por eso esta spec, igual que la `011`, probablemente deba quedar marcada `Planned` con nota de "necesita investigación de viabilidad + posible conversación con el Ayuntamiento" antes de poder pasar a `Draft` — no es solo trabajo de código.

**Depende de:** `004` (tráfico) y `008` (agenda de eventos/cortes) como fuente de los cierres a publicar.

**Fase propuesta:** nueva `F7` — Integraciones externas de navegación.

## 5. Predicción meteorológica a corto plazo (nowcasting) — spec `016`

**Idea del usuario:** además del estado actual, mostrar al lado una predicción de las próximas horas, aprovechando la ventana en la que la predicción es más fiable (el usuario pone de ejemplo 4h), presentada de forma visualmente cuidada. Sirve para anticipar lluvia o el impacto meteorológico en eventos concretos.

**Relación con specs existentes:** extiende `001` (meteorología, Open-Meteo). Hay que verificar con una llamada real qué resolución/ventana de confianza ofrece Open-Meteo para Valencia (p. ej. pronóstico horario o `minutely_15`) antes de fijar el contrato de datos.

**Depende de:** `001`.

**Fase propuesta:** nueva `F4.5` — Analítica temporal (junto a `017`).

## 6. Histórico de tráfico para detectar patrones — spec `017`

**Idea del usuario:** no está claro si existe histórico del tráfico actual; si no existe, plantearse almacenarlo para poder anticiparse en futuras fechas de eventos (una vez haya suficiente información acumulada).

**Estado actual:** `004` (tráfico tiempo real, Geoportal ArcGIS) solo sirve el estado actual con caché de TTL corto — no persiste histórico hoy. Haría falta decidir almacén (¿Upstash con retención larga? ¿otro almacén por volumen de escritura?) y política de agregación (frecuencia de snapshot, tiempo de retención).

**Depende de:** `004`.

**Fase propuesta:** `F4.5` (junto a `016`).

## 7. Agentes de revisión y pulido del proyecto ("nivel Palantir") — no es spec de producto

**Idea del usuario:** crear los agentes necesarios para ir revisando el proyecto, puliéndolo y dándole profesionalidad, con el objetivo declarado de llegar a un nivel de calidad/diseño comparable a Palantir.

**Por qué no es una spec de `specs/`:** las specs de este repo son de capas de datos/producto (ver plantilla). Esto es un objetivo de proceso de ingeniería — no se resuelve con un contrato de datos ni un endpoint.

**Queda pendiente, no implementado:** definir qué rol cubriría cada agente antes de crear ficheros reales en `.claude/agents/` (por ejemplo: revisor de cumplimiento de DoD de specs, revisor de contratos de datos, revisor de cumplimiento del límite ético/legal de `CLAUDE.md` §4, revisor de UI/diseño). Se anota aquí como objetivo estratégico a desglosar en una sesión dedicada.

---

## 8. Publicación con contraseña en dominio propio — spec `018`

**Idea del usuario (2026-08-18, turno posterior):** dar un paso más allá del `localhost` — publicar VLC Monitor en una web con contraseña, comprando un dominio propio si hace falta.

**Ya contemplado como opción, no como decisión tomada:** `docs/01_VIABILIDAD_VISION_Y_PROCESO.md` §1.1 ya menciona un dominio propio como coste opcional (~10-15€/año) sobre Vercel Hobby. Lo nuevo aquí es la intención explícita de comprarlo y añadir protección por contraseña.

**Dos cosas pendientes de verificar/decidir antes de `Draft`:**
- **Compra del dominio:** es un pago real — no lo puede ejecutar una sesión de Claude Code (ver reglas de la sesión: acciones con pago requieren que el usuario las haga él mismo). Una sesión puede guiar la configuración de DNS/Vercel una vez comprado, no comprarlo.
- **Protección por contraseña:** no verificado todavía si Vercel Hobby (plan gratuito) la incluye de serie o si hace falta construirla a mano (middleware con contraseña compartida, cookie de sesión). Antes de prometer nada hay que comprobarlo con la documentación real de Vercel, no asumirlo.

**Depende de:** ninguna spec de datos — es una pieza de despliegue/acceso, no de capa. Relacionado con `F5` (Pulido y compartición) del roadmap.

**Fase propuesta:** `F5`.

## Resumen de ids nuevos

| id | Título | Fase propuesta | Depende de | Notas |
|---|---|---|---|---|
| `012` | Geolocalización de usuario + "qué tengo más cerca" | F5 | `000` (+ capas activas) | Requiere decisión sobre framing "herramienta policial" — ver tensión arriba |
| `013` | Motor de insights y alertas operativas | F3.6 (nueva) | `001`,`002`,`004`,`008`,`009` | Debe cumplir "avisa, no actúa" — ver tensión arriba |
| `014` | Sistema de notificaciones (push/email) sobre alertas | F3.6 (nueva) | `008`, comparte infra con `013` | Puede fusionarse en el DoD de `008` en vez de ir separada |
| `015` | Integración de rutas externas (Waze/Google Maps) por cortes | F7 (nueva) | `004`, `008` | Necesita investigación de viabilidad antes de `Draft`, similar a `011` |
| `016` | Predicción meteorológica a corto plazo (nowcasting) | F4.5 (nueva) | `001` | Verificar ventana de confianza real de Open-Meteo |
| `017` | Histórico y analítica de tráfico | F4.5 (nueva) | `004` | Decidir almacén y política de retención |
| `018` | Publicación con contraseña en dominio propio | F5 | — | Compra de dominio la hace el usuario; verificar opciones reales de password-protection en Vercel antes de prometer nada |
