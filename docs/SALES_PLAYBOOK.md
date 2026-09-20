# Playbook de ventas — Reddit + Quora + YouTube

Objetivo: validar que este canal genera **DMs y ventas** en 14–21 días.
El SaaS viene después. Ahora el producto sos vos + el bot.

---

## 0. Setup rápido (hoy)

1. Dashboard → **Keywords** → **Investigar keywords** (panel Keyword Research)
2. Revisá la lista (intent ≥ 8 ya viene preseleccionada) → **Activar seleccionadas**
3. Opcional: `Pausar keywords ruidosas` si aún tenés seeds viejos
4. **Settings** → Telegram + Gemini OK → **Escaneo automático = ON**
5. Deploy a Vercel con `CRON_SECRET` (y opcional `SERPAPI_KEY` para Google Trends)
6. Confirmar cron en Vercel → Project → Cron Jobs

Prueba manual del cron:

```bash
curl "https://TU-DOMINIO.vercel.app/api/cron?token=TU_CRON_SECRET"
```

## Canales automatizados

| Canal | Estado | Requiere |
|---|---|---|
| Reddit posts | ✅ | ScraperAPI |
| Reddit **comentarios** | ✅ | ScraperAPI (+1 request/sub) |
| Quora | ✅ (Google `site:quora.com`) | **SERPAPI_KEY** |
| YouTube comments | Manual por ahora | — |
---

## 1. Reddit (bot + respuesta humana)

### Rutina diaria (30–45 min)
| Momento | Acción |
|---|---|
| Mañana | Revisar Telegram (score ≥ 7) |
| Mediodía | Responder leads pendientes (<15 min ideal) |
| Noche | Marcar Respondido / Archivado + anotar en el sheet |

### Tono de reply (copiar/adaptar)
- Útil primero, venta después
- No pegar links de pago en el primer mensaje
- Soft CTA: ofrecer ayuda por DM

Plantilla A (setup / ayuda):
> Yo pasé por lo mismo con el Fire Stick. Lo que me funcionó fue [paso concreto 1–2]. Si querés te paso la config que uso por DM (sin spam).

Plantilla B (recomendación IPTV/player):
> Depende de si priorizás estabilidad o canales. Para Android TV / Fire Stick mucha gente anda bien con TiviMate + un provider decente. Si me decís país + dispositivo te oriento por DM.

### Reglas anti-ban
- No copiar el mismo reply en 10 threads
- No hard-sell en el primer comentario
- Si el sub prohíbe promo, solo ayudar y esperar DM inbound

---

## 2. Quora (manual, 30–45 min/día)

### Búsquedas (pegá en Quora Search)
- Best IPTV for Fire Stick
- TiviMate vs IPTV Smarters
- How to set up IPTV on Android TV
- Cord cutting alternatives
- Best IPTV provider 2026
- Fire Stick buffering IPTV fix
- Looking for reliable IPTV service

### Filtro de pregunta “caliente”
Respondé solo si:
- Tiene <30 respuestas útiles O la top answer es vieja/genérica
- El asker menciona dispositivo (Fire Stick, Shield, Android TV)
- Hay dolor real (buffering, scams, setup)

### Estructura de respuesta Quora
1. Respuesta directa (1–2 líneas)
2. Pasos concretos (3–5 bullets)
3. Errores comunes
4. Soft CTA al final:

> Si te trabás en el setup, dejá un comentario con tu dispositivo y te digo el siguiente paso (o escribime).

### Cadencia
- 3–5 respuestas/día de calidad > 20 basura
- Revisitá tus answers a los 2–3 días (editar + responder comentarios)

---

## 3. YouTube comments (15–20 min/día)

### Dónde comentar
Buscá videos recientes (últimos 30–90 días):
- “TiviMate setup 2026”
- “Fire Stick IPTV install”
- “Best IPTV apps Android TV”
- “Cord cutters Fire Stick”

Ordená por **Fecha de subida** y comentá en videos con actividad reciente.

### Comentario tipo
> Buen video. Tip rápido: si te bufferéa en Fire Stick, bajá el buffer en el player y probá un DNS limpio. Si alguien está armando su primer setup, puedo orientar.

Evitar: links de affiliate en el primer comentario.

---

## 4. Tracking (obligatorio)

Usá `docs/sales-tracking.csv` (Google Sheets / Excel).

### Criterio de validación (14–21 días)
| Señal | Meta mínima |
|---|---|
| Leads score ≥ 7 / semana | 10+ |
| Respuestas publicadas / semana | 15+ |
| DMs inbound o iniciados | 5+ |
| Ventas atribuibles | ≥ 1 |

Si hay leads pero **0 DMs** → el problema es el reply/CTA, no el scraper.  
Si hay DMs pero **0 ventas** → oferta/precio/confianza.  
Si no hay leads → keywords/subs.

---

## 5. Qué NO hacer esta fase
- Landing / Stripe / multi-usuario
- Auto-post a Reddit o Quora
- Scraper de Quora (te queman la cuenta)

Cuando el sheet muestre DMs/ventas consistentes → ahí sí automatizamos más canales.
