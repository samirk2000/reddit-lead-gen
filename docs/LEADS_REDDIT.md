# Leads de Reddit

Sección del dashboard para los posts que encuentra el bot de Python de Torio Web: gente que pide una página web, una landing o una app de Roku. El bot lee RSS públicos cada 2 horas, arma un borrador en español (`borrador_es`) y otro en inglés (`borrador_en`), y los manda a esta app.

La pantalla está en **Dashboard → Leads de Reddit** (`/dashboard/reddit-web`). Usa el mismo login de Supabase que el resto. Cada usuario solo ve sus filas (RLS por `auth.uid()`, igual que Negocios sin web).

Tú publicas la respuesta en Reddit. La app no comenta sola. Antes de publicar, abre las reglas del subreddit: en muchos está prohibido vender o poner enlaces.

## 1. Correr el SQL

El archivo es `supabase/migrations/20260928_reddit_web_leads.sql`. Crea `reddit_web_leads` con RLS: el usuario autenticado puede leer sus filas y actualizar `estado`, `notas` y `updated_at`. El bot no escribe con la sesión del navegador.

1. Abre el proyecto en Supabase → **SQL Editor**.
2. Pega el contenido del archivo y ejecútalo. Se puede volver a correr.
3. Recarga `/dashboard/reddit-web`.

Si la tabla no existe, la pantalla lo dice en español y no se cae.

`reddit_id` es único **por usuario** (`user_id`, `reddit_id`). Volver a enviar el mismo post actualiza título, resumen, puntuación y borradores, y **no pisa** `estado` ni `notas`.

Estados: `nuevo`, `respondido`, `contactado`, `cotizado`, `ganado`, `descartado`.

Si ya habías creado el borrador del bot (id numérico, sin `user_id`) y **está vacío**, este SQL lo reemplaza. Si **tiene filas**, no las borra: les agrega `user_id`. Esas filas no aparecen hasta que les pongas dueño:

```sql
update public.reddit_web_leads
   set user_id = 'UUID-DEL-USUARIO'
 where user_id is null;
```

El UUID está en Supabase → Authentication → Users.

## 2. Variables en Vercel

En el proyecto de Vercel → **Settings → Environment Variables** (Production y Preview). Después de guardarlas, vuelve a desplegar.

| Variable | Para qué |
|---|---|
| `REDDIT_INGEST_SECRET` | Secreto nuevo. El bot lo manda en `Authorization: Bearer …`. Sin prefijo `NEXT_PUBLIC_`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya la usa la app (cron y pipeline). El ingest escribe con esta clave, solo en el servidor. |
| `NEXT_PUBLIC_SUPABASE_URL` | Ya la usa la app. |
| `REDDIT_INGEST_USER_ID` | UUID del usuario que debe ver los leads. **Obligatoria si hay más de una cuenta** en Authentication. Si solo hay una, puedes omitirla y el ingest usa esa cuenta. |

Genera el secreto en tu máquina:

```bash
openssl rand -base64 32
```

No pongas `SUPABASE_SERVICE_ROLE_KEY` en el bot. El bot solo necesita la URL de la app y `REDDIT_INGEST_SECRET`.

En local, las mismas variables van en `.env.local` (hay un ejemplo en `.env.local.example`).

## 3. Qué debe enviar el bot

`POST /api/reddit-web/ingest`

- Header `Authorization: Bearer <REDDIT_INGEST_SECRET>`
- Header `Content-Type: application/json`
- Cuerpo: **un arreglo JSON** en la raíz (no un objeto `{ "leads": [...] }`)
- Máximo **100** leads y **1 MB** por request
- Si un elemento es inválido, **no se escribe ninguno** de ese lote

La forma de cada objeto es la misma que arma `to_row` en el sync del bot. `estado` y `notas`, si vienen, se ignoran.

| Campo | Obligatorio | Notas |
|---|---|---|
| `reddit_id` | sí | Id estable del post (`abc123` o `t3_abc123`). Es la llave del upsert. |
| `url` | sí | `https` de `reddit.com`, un subdominio o `redd.it`. |
| `title` | sí | Texto del título. |
| `subreddit` | sí | Nombre del foro, con o sin `r/`. Se guarda sin el prefijo. |
| `author` | no | Texto o `null`. |
| `created_utc` | no | Fecha ISO-8601 (`created_iso` del bot) o `null`. |
| `problema` | no | Resumen del problema. |
| `pais_detectado` | no | País detectado, por ejemplo `MX`. |
| `idioma` | no | Solo `es-MX` o `en-US`. |
| `score_intencion` | no | Número entre 0 y 1. |
| `intencion` | no | Etiqueta corta del clasificador. |
| `clasificador` | no | Por ejemplo `reglas`. |
| `keywords` | no | Arreglo de textos. Si falta, queda `[]`. |
| `borrador_es` | no | Borrador para copiar y publicar en español. |
| `borrador_en` | no | Borrador para copiar y publicar en inglés. |

Respuesta correcta:

```json
{ "ok": true, "upserted": 1, "received": 1, "deduped": 0 }
```

`deduped` cuenta `reddit_id` repetidos dentro del mismo arreglo; se guarda el último. Un arreglo vacío responde `upserted: 0` y no toca la base.

Errores:

- `401` si falta el header o el secreto no coincide: `{ "ok": false, "error": "No autorizado." }`
- `400` si el JSON o algún lead no sirve. `issues` trae `index` (desde 0), `field` y `message`.
- `413` si el cuerpo pasa de 1 MB.
- `500` si falta el secreto en Vercel, falta la service role, el UUID del dueño no existe, o la tabla no está creada.

Ejemplo:

```bash
curl -X POST "https://TU-DOMINIO.vercel.app/api/reddit-web/ingest" \
  -H "Authorization: Bearer $REDDIT_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "reddit_id": "abc123",
      "url": "https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_website/",
      "title": "Need a simple website for my shop",
      "subreddit": "smallbusiness",
      "author": "example_user",
      "created_utc": "2026-09-28T00:00:00.000Z",
      "problema": "Quiere una landing para su negocio local.",
      "pais_detectado": "MX",
      "idioma": "en-US",
      "score_intencion": 0.86,
      "intencion": "pide_landing",
      "clasificador": "reglas",
      "keywords": ["website", "landing page"],
      "borrador_es": "Hola, vi tu publicación. Armamos landing pages y lo dejamos claro desde el primer mensaje, sin hacernos pasar por un conocido.",
      "borrador_en": "Hi, I saw your post. We build landing pages and I want to be upfront about that from the first reply."
    }
  ]'
```

En el sync del bot, deja de pegarle a `rest/v1/reddit_web_leads` con la service key. Manda este `POST` con el mismo arreglo que ya construye `to_row`.
