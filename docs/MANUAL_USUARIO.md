# Manual: leads de IPTV desde tu PC

La app en Vercel es el tablero. Tu programa de Windows (BuscadorSubredditsZombies) es el que lee Reddit, con tu Chrome, cada 15 minutos. Cuando encuentra un post o un comentario, se lo manda a esta app. Aquí Gemini le pone una calificación del 1 al 10, escribe un borrador y, si la calificación llega al umbral, te avisa por Telegram.

Tú abres el enlace, copias el texto y lo pegas en Reddit. **Esta app nunca publica, comenta ni vota.**

## Qué tienes que configurar en Vercel

En el proyecto de Vercel: **Settings → Environment Variables**. Ponlas en Production (y en Preview si pruebas antes). Después de guardar, vuelve a desplegar. Si no redespliegas, el servidor sigue con los valores viejos.

Genera el secreto en tu PC:

```bash
openssl rand -base64 32
```

### Obligatorias para recibir leads

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dirección de tu proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave pública para entrar al tablero. |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave privada. Solo en el servidor. Con esta se guardan los leads. No la pongas en la app de Windows ni en el navegador. |
| `GEMINI_API_KEY` | Llave de Google Gemini. Sin ella no hay calificación ni borrador. |
| `REDDIT_INGEST_SECRET` | Secreto compartido. La app de Windows lo manda en el header. |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram. También puedes pegarlo en el tablero, en Ajustes. |

Si en Supabase hay **más de un usuario**, también pon:

| Variable | Para qué |
|---|---|
| `REDDIT_INGEST_USER_ID` | UUID de tu usuario. Supabase → Authentication → Users. Si solo hay una cuenta, puedes omitirla. |

Para que el aviso de Telegram salga aunque no hayas guardado el chat en Ajustes:

| Variable | Para qué |
|---|---|
| `TELEGRAM_CHAT_ID` | El id de tu chat con el bot. Si ya lo guardaste en Ajustes, esta sobra. |

### Opcionales

| Variable | Si no la pones |
|---|---|
| `GEMINI_MODEL` | Usa `gemini-3.6-flash` (ese modelo sí existe en la API de Gemini). |
| `TELEGRAM_ALERT_MIN_SCORE` | Avisa solo con calificación **7 o más** (escala de 1 a 10). |
| `CLOUD_SCRAPER_ENABLED` | El cron de Vercel **no** busca en Reddit. Déjala vacía o en `false`. |
| `CRON_SECRET` | Solo hace falta si enciendes el respaldo de la nube. |
| `SCRAPER_API_KEY` | Solo para ese respaldo, cuando Reddit bloquea la IP del servidor. |

La lista completa está en `.env.example`.

## Supabase

Los leads nuevos caen en la tabla `detected_leads`, la misma que ya usa el tablero principal. **No hay migración nueva** para este flujo.

Si el tablero te dice que falta una tabla, el proyecto todavía no tiene el esquema base de leads. En ese caso el ingest responde error al guardar y hay que crear `detected_leads` como ya la espera la app (usuario, url, título, texto, subreddit, calificación, borradores y estado).

Cada lead queda amarrado a tu usuario (`user_id`). En el tablero solo ves los tuyos.

La misma URL no se guarda dos veces. Si el programa la manda otra vez, la app responde que ya existía y **no** vuelve a gastar Gemini ni a sonar Telegram.

## Telegram

1. En Telegram, habla con `@BotFather`.
2. Crea un bot con `/newbot` y copia el token. Ese token es `TELEGRAM_BOT_TOKEN`.
3. Escríbele un “hola” a tu bot.
4. Abre en el navegador `https://api.telegram.org/botTU_TOKEN/getUpdates` y copia el `chat.id`. Ese número es `TELEGRAM_CHAT_ID`, o lo pegas en el tablero → Ajustes.
5. Guarda y redespliega.

El aviso sale solo si Gemini da **7 o más** (o el número que hayas puesto en `TELEGRAM_ALERT_MIN_SCORE`). Un 6 se guarda, pero no te escribe. Lo ves en el tablero, pestaña Archivados.

## Cómo conecta la app de Windows

Un POST por lead. No mandes un arreglo.

- **URL:** `https://TU-DOMINIO.vercel.app/api/leads/ingest`
- **Método:** `POST`
- **Header:** `Authorization: Bearer TU_REDDIT_INGEST_SECRET`
- **Header:** `Content-Type: application/json`

Cuerpo:

```json
{
  "url": "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv_para_firestick/",
  "subreddit": "firetvstick",
  "title": "Busco IPTV para Firestick",
  "body": "Se me cayó mi IPTV y quiero otra opción. Uso Firestick en México.",
  "author": "ejemplo_mx",
  "created_at": "2026-10-13T04:00:00Z",
  "kind": "post",
  "local_score": 8,
  "keywords": ["busco iptv", "iptv firestick"]
}
```

| Campo | Obligatorio | Notas |
|---|---|---|
| `url` | sí | Permalink `https` del post o del comentario. Con o sin `www`, con o sin barra final: se trata como la misma URL. |
| `subreddit` | sí | Con o sin `r/`. |
| `title` | sí | Título del post, o un resumen corto si es comentario. |
| `body` | sí | Texto. Si no hay, manda `""`. |
| `author` | no | Texto o `null`. |
| `created_at` | sí | Fecha ISO-8601 de Reddit. |
| `kind` | sí | `"post"` o `"comment"`. |
| `local_score` | no | Pista de tu programa, de 0 a 10. No sustituye la nota de Gemini. |
| `keywords` | no | Frases que hicieron match, por ejemplo `busco iptv`. |

Respuesta cuando se guarda:

```json
{
  "ok": true,
  "duplicate": false,
  "id": "uuid",
  "url": "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv",
  "intent_score": 8,
  "alerted": true,
  "status": "notified"
}
```

Si esa URL ya estaba: `"duplicate": true` y `"alerted": false`.

Errores: `401` secreto mal, `400` JSON mal, `500` falta una variable, `502` o `503` Gemini no pudo calificar (no se guardó; puedes reintentar).

Hay dos ejemplos listos:

- `scripts/send-lead-example.ps1`
- `scripts/send-lead-example.py`

En PowerShell:

```powershell
$env:REDDIT_INGEST_URL = "https://TU-DOMINIO.vercel.app/api/leads/ingest"
$env:REDDIT_INGEST_SECRET = "el secreto"
powershell -File .\scripts\send-lead-example.ps1
```

La URL de ejemplo `abc123` no es un post real. Cámbiala por un permalink de verdad cuando pruebes contra tu servidor.

`POST /api/reddit-web/ingest` es otro contrato (borradores ya escritos, otro producto). El buscador de Windows no debe usarlo.

## El día a día

1. Deja el programa de Windows corriendo en tu PC, con la sesión de Chrome que ya usas. Cada 15 minutos busca. Solo lee.
2. Si un lead llega a 7 o más, te llega Telegram con el enlace y el borrador.
3. Entra al tablero → **Leads**. La pestaña **Todos** son los que todavía no contestas y pasan el umbral.
4. Lee el análisis. Pulsa **Copiar respuesta**.
5. Pulsa **Ver en Reddit**, abre el post y pega el texto tú mismo. Léelo antes. Quítale lo que no pegue en ese subreddit.
6. Cuando ya comentaste, pulsa **Marcar como respondido**.
7. Si no vale la pena, **Archivar**.

El borrador dice que tú vendes el servicio (Swiftya Latino), no que eres un cliente. Trae el código **REDDIT15** (10%) y el WhatsApp **+52 1 662 268 4690**. Habla de Android, Android TV, Firestick y Google TV. No debe mencionar problemas de audio en Roku. Si un borrador se desvía, el servidor lo corrige antes de guardarlo. **Regenerar** pide otro texto con las mismas reglas.

## Frases y subreddits

El programa de Windows es el que decide dónde buscar. En el tablero, el botón **Sembrar keywords de venta** deja frases de intención de compra en México, por ejemplo:

- busco iptv
- recomienden iptv
- se cayó mi iptv
- iptv firestick
- cancelar cable

Esas frases del tablero las usa el **respaldo** de la nube, no tu programa de Windows.

Ese respaldo no entra a `r/iptv`, `r/mexico` ni `r/ayudamexico` (muertos o prohiben promocionarte). Siguen en la lista de aparatos: firetvstick, smartersiptv, TiviMate, AndroidTV, cordcutters, Stremio, sideloaded.

## Respaldo en la nube

El cron de Vercel sigue declarado, pero no busca nada mientras `CLOUD_SCRAPER_ENABLED` no sea `true`. Reddit suele responder 403 a las IP de un datacenter.

Si un día tu PC está apagada y quieres intentar el respaldo:

1. Pon `CLOUD_SCRAPER_ENABLED=true`.
2. Pon `CRON_SECRET` y, si hace falta, `SCRAPER_API_KEY`.
3. Redespliega.

El botón de escanear del tablero sigue ahí por si quieres lanzarlo a mano. Es un respaldo, no el camino normal.

## Para que no te baneen

- No dejes que ningún programa publique por ti. Si Reddit pide captcha o huele a bot, el castigo es para tu cuenta.
- Lee las reglas del subreddit antes de pegar. En muchos está prohibido vender, poner WhatsApp o repetir el mismo anuncio.
- Si las reglas prohiben el teléfono o el código, no los pegues en ese foro. Contesta útil y, si te escriben, pasas el WhatsApp en privado.
- Di que vendes. Hacerte pasar por cliente contento es lo que más reportan.
- No copies el mismo párrafo en diez posts seguidos. Cambia la primera frase para que hable de lo que esa persona preguntó.
- Espacia los comentarios. Varios anuncios en minutos se ven como spam.
- Una sola cuenta. No abras cuentas extra para “cubrir” más subs.
- Si un moderador te borra el comentario, no lo repitas ni discutas en el hilo.
- El programa de Windows solo lee. No inicies sesión de más, no automatices votos ni mensajes directos.
