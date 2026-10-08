# Negocios sin web (Google Maps)

Módulo para encontrar profesionistas locales (dentistas, dermatólogos, cirujanos plásticos, ortodoncistas, veterinarios, etc.) que **no tienen sitio web**, o cuyo “sitio” es solo un perfil social, y contactarlos **a mano** por WhatsApp.

No raspa Google Maps. Usa la API oficial **Places API (New)**, Text Search, desde el servidor. No envía WhatsApp solo: abre `https://wa.me/<número>?text=<mensaje>`.

La sección vive en **Dashboard → Negocios sin web** (`/dashboard/maps`) y usa el mismo login de Supabase que el resto de la app. Cada usuario solo ve sus prospectos (RLS por `auth.uid()`).

## Variable de entorno

```bash
GOOGLE_PLACES_API_KEY=tu_clave
```

- Va en `.env.local` y en Vercel → Settings → Environment Variables (Production y Preview).
- **No** uses `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`. Si la clave llega al navegador, cualquiera puede gastarla.
- Después de cambiarla en Vercel, vuelve a desplegar.
- Si falta, la página muestra un aviso en español y no llama a Google.

La búsqueda también puede usar la `GEMINI_API_KEY` que ya tiene la app (o la clave pegada en Settings) solo si pulsas **Personalizar con IA**. Sin esa clave, el resto del módulo sigue funcionando.

## Activar Places API (New) y restringir la clave

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) con facturación activa en el proyecto. Sin facturación, Places rechaza las llamadas.
2. **APIs y servicios → Biblioteca**. Busca **Places API (New)** y actívala.
   - El servicio es `places.googleapis.com`.
   - No uses la Places API heredada (legacy).
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**.
4. Edita la clave:
   - **Restricciones de API**: limita la clave solo a **Places API (New)**.
   - **Restricciones de aplicación**: en Vercel las IPs del servidor cambian, así que lo habitual es dejarla en “Ninguna” y apoyarte en la restricción de API. No la incrustes en el cliente. Si más adelante tienes salida con IP fija, puedes restringir por IP.
5. Copia la clave a `GOOGLE_PLACES_API_KEY`.

## Aplicar la migración en Supabase

El archivo base es `supabase/migrations/20260925_maps_leads.sql`. Crea `maps_leads`, `maps_settings` y `maps_search_log`, con RLS para que cada usuario solo lea y escriba sus filas.

La lista diaria necesita además `supabase/migrations/20261007_maps_digest.sql` (estado `enviado_a_lista` y tabla `maps_digest_log`). Sin ese archivo el endpoint responde que falta la migración.

1. Abre el proyecto en Supabase → **SQL Editor**.
2. Pega el contenido del archivo y ejecútalo. Se puede volver a correr: usa `if not exists` y recrea las políticas.
3. Recarga `/dashboard/maps`.

Si la tabla no existe, la pantalla lo dice en español y no se cae. `place_id` es único **por usuario** (`user_id`, `place_id`), porque la app ya es multiusuario. Volver a buscar el mismo negocio actualiza teléfono, reseñas, dirección y puntuación, y **no pisa** `status` ni `notes`.

Estados: `nuevo`, `contactado`, `respondió`, `cerrado`, `descartado`.

## Qué cuenta como prospecto

- Sin `websiteUri`, o con un valor que no es una URL.
- O el sitio es solo un perfil: Facebook, Instagram, TikTok, Linktree, `wa.me`, X, YouTube, Telegram, LinkedIn, Google Maps, etc.
- Se omiten los negocios `CLOSED_PERMANENTLY`.
- Se deduplica por `place_id`.
- Si el negocio ya está guardado para ese usuario, la búsqueda lo actualiza pero no lo vuelve a mostrar como nuevo.
- La ciudad del mensaje sale de la dirección de Google cuando se puede leer (por ejemplo «dentista en Monterrey»). Si no, se usa la ciudad que se buscó. No hay una ciudad fija en el texto.
- La prioridad (0–100) ordena al mejor prospecto primero. Suma el giro (estudio de mercado: dentistas e implantes 89, ortodoncistas 89, abogados 86, carpinteros y cocinas 85, constructoras y arquitectos 83, clínicas estéticas y salones de eventos 83, cirujanos plásticos 81; notarías, barberías y restaurantes van al final), el teléfono (WhatsApp móvil por encima de un número mexicano sin marca de móvil; sin teléfono queda por debajo de quien sí se puede escribir), sin sitio por encima de solo Facebook o Instagram, reseñas de un negocio activo (4.0 o más y al menos 15 reseñas) y si sigue en operación. La tarjeta muestra el número y el motivo.

## Costo

Cada página de Text Search es un evento facturable. Una búsqueda pide como máximo **3 páginas** (hasta 60 negocios).

La máscara de campos pide nombre, dirección, teléfonos, calificación, número de reseñas, sitio, URL de Maps y estado. Teléfono, sitio, calificación y reseñas caen en el SKU **Text Search Enterprise**. No pedimos el texto de las reseñas, fotos ni horarios, para no subir a **Enterprise + Atmosphere**.

Precios de referencia (USD, [lista oficial](https://developers.google.com/maps/billing-and-pricing/pricing), septiembre 2026):

| SKU | Cupo gratis / mes | Después, hasta 100,000 |
|---|---|---|
| Text Search Enterprise | 1,000 | $35 / 1,000 |
| Text Search Enterprise + Atmosphere (no lo usamos) | 1,000 | $40 / 1,000 |

Tres páginas = 3 eventos. 1,000 eventos gratis ≈ 333 búsquedas completas al mes por cuenta de facturación de Google, compartidas por todo el proyecto. La app además corta en **30 búsquedas por usuario por hora**.

La lista diaria (`GET /api/maps/daily-list`) no usa ese tope de 30. Tiene el suyo: **máximo 8 llamadas** a Text Search por invocación, **una página** cada una (8 eventos Enterprise). Se detiene antes si ya juntó los prospectos pedidos. Ocho al día, una vez, son 8 de los 1,000 eventos gratis. Si se vuelve a llamar el mismo día sin `city` ni `giros`, responde la lista ya guardada y no llama a Places.

Revisa el uso en Google Cloud → Google Maps Platform → Quotas, y pon una alerta de presupuesto.

## WhatsApp

Cada prospecto tiene dos textos. No se guardan por persona: se arman al mostrar la tarjeta.

- **Apertura.** Primer contacto, corto y según el giro. No usa la plantilla guardada. Pregunta si puede mandar un ejemplo.
- **Seguimiento.** La plantilla editable de abajo (la que vive en `maps_settings`). El texto de Torio Web se manda después de que el prospecto acepta el ejemplo, así que abre con «¡Gracias por su respuesta!» y pasa a lo que incluye la página (servicios, fotos, botón de WhatsApp, blog opcional y `Desde $8,000 MXN`). No repite la calificación de Google Maps. Si ese giro tiene página de ejemplo, cierra con `Aquí puede ver un ejemplo de cómo quedaría la suya: {url}/?nombre={nombre}`. Si no tiene, cierra con `Si gusta, le preparo una propuesta para su negocio.` Una plantilla ya guardada no se reescribe; si el giro tiene ejemplo y el texto no lo trae, al final se agrega `Aquí un ejemplo: {url}`. La base `https://torioweb.com/ejemplos` está en una constante y se puede cambiar con `NEXT_PUBLIC_DEMOS_BASE_URL`.

Si el giro no está en la tabla, el seguimiento usa "clientes", el giro buscado, "contactar", "negocio" y un artículo del tipo "5 cosas que debe saber antes de contratar un {giro} en {ciudad}" (con "una" si el giro es femenino).

Tokens del seguimiento: `{{nombre}}`, `{{especialidad}}`, `{{calificacion}}`, `{{reseñas}}`, `{{ciudad}}`, `{{reputacion}}`, `{{clientes}}`, `{{busqueda}}`, `{{accion}}`, `{{lugar}}`, `{{accion_corta}}`, `{{ejemplo_blog}}`, `{{demo_url}}`, `{{cierre}}`. `{{reputacion}}` y la apertura acortan la frase si falta la calificación o las reseñas. "Muy buena reputación" solo entra con 4 estrellas o más y al menos una reseña. `{{cierre}}` pone el enlace o la propuesta. Una plantilla ya guardada no se reemplaza: sigue siendo el seguimiento.

**Abrir WhatsApp** (hay uno por mensaje) normaliza números mexicanos a `52` + 10 dígitos y, si el prospecto estaba en `nuevo`, lo marca `contactado`. **Copiar mensaje** no cambia el estado. **Personalizar con IA** reescribe solo la apertura, en unas tres líneas, sin precio ni promesa de posiciones.

## Páginas de ejemplo

Las páginas de ejemplo viven en torioweb.com. Esta app solo guarda el mapa de giro a URL (`lib/demo/links.ts`). El giro sale de la palabra que se buscó, no del tipo de Google Places. El nombre del prospecto va en `?nombre=`.

| Demo | Giros |
|---|---|
| `https://torioweb.com/ejemplos/dentista/` | dentista, odontólogo, clínica dental, consultorio dental, implantes dentales, ortodoncista, ortodoncia |
| `https://torioweb.com/ejemplos/cocinas/` | carpintería, carpintero, cocinas integrales, cocinas, muebles a medida, closets, mueblería, tienda de muebles |
| `https://torioweb.com/ejemplos/abogado/` | abogado, abogada, despacho jurídico, bufete, bufete jurídico |
| `https://torioweb.com/ejemplos/clinica-estetica/` | médico estético, medicina estética, clínica estética, spa médico, cirujano plástico |
| `https://torioweb.com/ejemplos/constructora/` | constructora, arquitecto, arquitecta, despacho de arquitectura, remodelaciones |
| `https://torioweb.com/ejemplos/salon-eventos/` | salón de eventos, salón de fiestas, jardín de eventos, quinta |

Notarías no entran en el demo de abogado. Un spa o una estética que no son clínica médica tampoco usan el demo de clínica estética. Los demás giros no agregan enlace.

## Ciudad

El formulario trae las ciudades grandes (Querétaro queda seleccionada) y la opción «Otra ciudad o estado…» para escribir cualquier ciudad o estado, por ejemplo Jalisco o Playa del Carmen. `CDMX` se busca como Ciudad de México.

## Lista diaria

`GET /api/maps/daily-list` arma una lista lista para enviar por Telegram.

```bash
curl -sS \
  -H "Authorization: Bearer $MAPS_DIGEST_SECRET" \
  "https://reddit-lead-gen.vercel.app/api/maps/daily-list?count=20"
```

Con filtros:

```bash
curl -sS \
  -H "Authorization: Bearer $MAPS_DIGEST_SECRET" \
  "https://reddit-lead-gen.vercel.app/api/maps/daily-list?count=10&city=Monterrey&giros=dentista,abogado"
```

- `count`: default 20, máximo 40.
- `city` y `giros` son opcionales. Sin ellos, cada día (hora de Ciudad de México) recorre otros giros de alto valor y otras ciudades grandes, de 8 búsquedas en 8.
- Respuesta: `name`, `giro`, `city`, `rating`, `reviews`, `phone` (52 + 10 dígitos), `maps_url`, `score`, `apertura`, `wa_link` (`https://wa.me/<teléfono>?text=<apertura>`).
- No incluye negocios sin teléfono mexicano, cerrados temporalmente, ya contactados o ya devueltos otro día.
- Los guarda en `maps_leads` con estado **Enviado a lista**, así aparecen en el dashboard.
- Dueño de las filas: `REDDIT_INGEST_USER_ID` si hay más de un usuario; si solo hay uno, ese usuario. Misma regla que `/api/reddit-web/ingest`.

Variables nuevas y las que este endpoint necesita en Vercel (Production), sin prefijo `NEXT_PUBLIC_`:

```bash
MAPS_DIGEST_SECRET=   # openssl rand -base64 32
GOOGLE_PLACES_API_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
# REDDIT_INGEST_USER_ID=  # solo si hay más de un usuario en Auth
```

Migración, en el SQL Editor, después de `20260925_maps_leads.sql`:

`supabase/migrations/20261007_maps_digest.sql`
