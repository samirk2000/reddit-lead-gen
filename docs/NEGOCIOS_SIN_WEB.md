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

El archivo es `supabase/migrations/20260925_maps_leads.sql`. Crea `maps_leads`, `maps_settings` y `maps_search_log`, con RLS para que cada usuario solo lea y escriba sus filas.

1. Abre el proyecto en Supabase → **SQL Editor**.
2. Pega el contenido del archivo y ejecútalo. Se puede volver a correr: usa `if not exists` y recrea las políticas.
3. Recarga `/dashboard/maps`.

Si la tabla no existe, la pantalla lo dice en español y no se cae. `place_id` es único **por usuario** (`user_id`, `place_id`), porque la app ya es multiusuario. Volver a buscar el mismo negocio actualiza teléfono, reseñas, dirección y puntuación, y **no pisa** `status` ni `notes`.

Estados: `nuevo`, `contactado`, `respondió`, `cerrado`, `descartado`.

## Qué cuenta como prospecto

- Sin `websiteUri`, o con un valor que no es una URL.
- O el sitio es solo un perfil: Facebook, Instagram, TikTok, Linktree, `wa.me`, X, YouTube, Telegram, LinkedIn, Google Maps, etc.
- Se omiten los negocios `CLOSED_PERMANENTLY`.
- Se deduplica por el id de Google.
- La prioridad (0–100) sube con la calificación y, en escala logarítmica, con el número de reseñas. Un 5.0 con dos reseñas no le gana a una clínica de 4.7 muy reseñada.

## Costo

Cada página de Text Search es un evento facturable. Una búsqueda pide como máximo **3 páginas** (hasta 60 negocios).

La máscara de campos pide nombre, dirección, teléfonos, calificación, número de reseñas, sitio, URL de Maps y estado. Teléfono, sitio, calificación y reseñas caen en el SKU **Text Search Enterprise**. No pedimos el texto de las reseñas, fotos ni horarios, para no subir a **Enterprise + Atmosphere**.

Precios de referencia (USD, [lista oficial](https://developers.google.com/maps/billing-and-pricing/pricing), septiembre 2026):

| SKU | Cupo gratis / mes | Después, hasta 100,000 |
|---|---|---|
| Text Search Enterprise | 1,000 | $35 / 1,000 |
| Text Search Enterprise + Atmosphere (no lo usamos) | 1,000 | $40 / 1,000 |

Tres páginas = 3 eventos. 1,000 eventos gratis ≈ 333 búsquedas completas al mes por cuenta de facturación de Google, compartidas por todo el proyecto. La app además corta en **30 búsquedas por usuario por hora**.

Revisa el uso en Google Cloud → Google Maps Platform → Quotas, y pon una alerta de presupuesto.

## WhatsApp

El mensaje sale de una plantilla editable (`{{nombre}}`, `{{especialidad}}`, `{{calificacion}}`, `{{reseñas}}`, `{{ciudad}}`). **Abrir WhatsApp** normaliza números mexicanos a `52` + 10 dígitos (quita el `1` viejo de `521`, y prefijos `044` / `045` / `01`) y, si el prospecto estaba en `nuevo`, lo marca `contactado`. **Copiar mensaje** no cambia el estado. **Personalizar con IA** reescribe el texto con Gemini y no lo envía.
