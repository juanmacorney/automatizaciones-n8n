# Automatizaciones en n8n para un negocio de cursos online

Seis automatizaciones **en producción** que construí para **Flor Corney** ([florcorney.com](https://www.florcorney.com)), creadora de contenido que vende cursos online y hace un podcast semanal. Cubren ventas (Stripe y PayPal), email marketing (Brevo), comunidad (Telegram) y monitoreo de errores.

No son demos: atienden pagos, alumnas y suscriptores reales todos los días. Por eso el foco no es solo que funcionen, sino que **no fallen en silencio, no dupliquen nada y avisen cuando algo se rompe**.

> 🇬🇧 **English summary below** · [Jump to English](#english-summary)

---

## Qué hay en este repo

| # | Automatización | Qué resuelve | Tecnologías |
|---|---|---|---|
| 01 | [Aviso de nuevo episodio del podcast](automatizaciones/01-aviso-nuevo-episodio-podcast) | Detecta el episodio nuevo en Spotify, lo empareja con su video de YouTube, arma el mail con diseño de marca y lo manda a toda la lista **después de que Flor lo aprueba con un clic** | Spotify Web API, YouTube Data API v3, Brevo API, Gmail (aprobación), n8n Data Tables |
| 02 | [Ventas por PayPal](automatizaciones/02-ventas-paypal) | Cada pago se registra en la planilla de finanzas, la clienta entra a la lista de su curso y recibe su bienvenida | PayPal webhooks + REST (OAuth2), Brevo, Google Sheets, Gmail |
| 03 | [Ventas por Stripe: auditoría y blindaje](automatizaciones/03-ventas-stripe-seguridad) | Rediseño de seguridad de un flujo que ya existía: encontré una venta perdida, bienvenidas que se iban a duplicar cada mes y un webhook que creía cualquier aviso | Stripe API, Google Sheets, Brevo, Gmail |
| 04 | [Recordatorios del vivo semanal (mail)](automatizaciones/04-recordatorios-vivo-mail) | Mails automáticos el día anterior y 1 hora antes del vivo, con la hora en 5 países y un calendario de pausas que maneja la asistente | Brevo Campaigns API, Google Sheets, Luxon (zonas horarias) |
| 05 | [Recordatorios del vivo semanal (Telegram)](automatizaciones/05-recordatorios-vivo-telegram) | Los mismos recordatorios en el tema correcto del grupo de Telegram de las alumnas | Telegram Bot API (grupos con temas), Google Sheets |
| 06 | [Alertas de errores](automatizaciones/06-alertas-de-errores) | Un solo flujo vigila a todos los demás: dice qué falló, dónde, una pista de cómo arreglarlo, y no inunda la bandeja si el error se repite | n8n Error Trigger, Gmail + Brevo como respaldo, Data Tables |

## Cómo trabajo (lo que se repite en todos los flujos)

**1. Nada se manda dos veces.** Cada envío o pago se registra en una tabla *antes* de actuar y se consulta antes de volver a hacerlo. Si n8n se reinicia, si el webhook llega repetido o si alguien ejecuta el flujo a mano, el resultado es el mismo.

**2. Nada falla en silencio.** Todos los flujos están conectados a un flujo central de alertas. Además, cada flujo comprueba que lo que hizo pasó de verdad: no le alcanza con que Brevo responda "OK", vuelve a consultar la campaña para ver que quedó enviada. Lo mismo con Telegram: comprueba que el mensaje cayó en el grupo y en el tema correctos.

**3. Guardas antes de actuar.** Si un recordatorio se dispara fuera de horario (por ejemplo, porque el servidor estuvo caído), no se manda tarde. Si una fecha está mal cargada en la planilla, no se adivina: se frena y se avisa.

**4. Los datos de afuera no son de confianza.** Un webhook de pago no se cree tal cual: se vuelve a leer el pago en Stripe o PayPal. Los nombres que escribe la clienta se limpian antes de ir a un mail (HTML) o a una planilla (fórmulas).

**5. Probado por el camino real, y después limpio.** Cada flujo tiene un *modo prueba* que usa los mismos nodos pero manda a una lista o un grupo de prueba. Las pruebas se confirman en el dato real (el mail en la bandeja, la fila en la planilla, el mensaje en el grupo), no en una ejecución "verde". Después se borran los datos de prueba.

**6. Romper a propósito.** Las alertas se validaron rompiendo cosas a propósito (una URL, una credencial) para ver que el aviso llegara de verdad.

**7. Sin IA donde no hace falta.** Todo esto es determinista: reglas en JavaScript dentro de n8n. Es más barato, más predecible y más fácil de auditar. Cada decisión que mueve dinero o llega a clientes la toma el flujo, no un modelo.

## Stack

- **n8n** self-hosted (Easypanel), con Schedule, Webhook, Error Trigger, Code, IF/Switch, HTTP Request y Data Tables
- **JavaScript** en nodos Code (validaciones, armado de HTML, fechas con Luxon)
- **APIs REST:** Stripe, PayPal (OAuth2), Brevo, Spotify Web API (OAuth2), YouTube Data API v3, Telegram Bot API, Gmail, Google Sheets
- **Patrones:** idempotencia, compare-and-set, verificación posterior al envío, aprobación humana (Gmail *send and wait*), alertas con deduplicación, modo prueba/producción con un solo interruptor
- **Desarrollo asistido por IA:** construido con Claude Code conectado a n8n por MCP, con revisión y auditoría de cada flujo antes de publicarlo

## Cómo leer los archivos

- Los archivos `.js` son el código fuente del flujo escrito con el **SDK de workflows de n8n** (`@n8n/workflow-sdk`). Se leen de arriba hacia abajo: nodos primero y, al final, cómo se conectan.
- Los archivos `.json` son exportaciones de n8n que se pueden importar directo.
- **Todos los datos privados fueron reemplazados** por marcadores (`ID_CRED_BREVO`, `correo@ejemplo.com`, `ID_HOJA_A`, etc.). Las credenciales nunca estuvieron en el código: n8n las guarda aparte y los flujos solo las referencian por id.

---

## English summary

Six **production** n8n automations I built for an online course creator and podcaster ([florcorney.com](https://www.florcorney.com)). They handle real payments, students and subscribers every day.

- **Podcast release emails:** detects new Spotify episodes, matches the YouTube video, builds a branded email, and sends it to the whole list **only after a one-click approval** by email. Guards against double sending (compare-and-set), stuck approvals, and silent failures.
- **PayPal and Stripe sales:** webhook → re-verify the payment with the provider's API → idempotency table → finance sheet, course mailing list, welcome email. For the existing Stripe flow I ran a security audit that found a lost USD 127 sale, welcome emails that would have been resent every month to subscribers, and a webhook that trusted any incoming payload. Then I fixed all three.
- **Weekly live-session reminders** by email (Brevo campaigns, times shown in 5 time zones) and Telegram (forum topic in the students' group), with a pause calendar that a non-technical assistant manages in Google Sheets, plus time-window and duplicate-send guards.
- **Central error alerting:** says which workflow failed, at which node, with a diagnostic hint. It falls back to a second provider if Gmail is down and suppresses repeated alerts (from ~96 to ~4 emails/day during an outage).

**Principles:** idempotency everywhere, verify-after-send, validate before acting, never trust webhook payloads, test on the real path then clean up test data, break things on purpose to prove the alerts work, and no LLM where deterministic rules do the job.

**Stack:** n8n (self-hosted), JavaScript, REST APIs (Stripe, PayPal, Brevo, Spotify, YouTube, Telegram, Google), OAuth2, webhooks, cron, AI-assisted development with Claude Code + n8n MCP.

---

Autor: **Juan Manuel Corney** · Automatizaciones con n8n e integración de APIs
