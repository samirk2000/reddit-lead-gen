import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MapsPanel } from "@/components/dashboard/maps-panel";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  MISSING_PLACES_KEY_MESSAGE,
} from "@/lib/maps/constants";
import { mapsDbErrorMessage } from "@/lib/maps/errors";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import type { MapsLead } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Negocios sin web",
};

export default async function MapsLeadsPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data, error } = await supabase
    .from("maps_leads")
    .select("*")
    .eq("user_id", userId)
    .order("priority_score", { ascending: false })
    .order("user_rating_count", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .limit(500);

  let loadError: string | null = null;
  let leads: MapsLead[] = [];
  if (error) {
    console.error("[maps] list failed", {
      code: error.code,
      message: error.message,
    });
    loadError = mapsDbErrorMessage(error);
  } else {
    leads = data ?? [];
  }

  let template = DEFAULT_WHATSAPP_TEMPLATE;
  if (!loadError) {
    const settings = await supabase
      .from("maps_settings")
      .select("whatsapp_template")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings.error) {
      console.error("[maps] template load failed", {
        code: settings.error.code,
        message: settings.error.message,
      });
      loadError = mapsDbErrorMessage(settings.error);
    } else if (settings.data?.whatsapp_template.trim()) {
      template = settings.data.whatsapp_template;
    }
  }

  const placesReady = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Negocios sin web
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Consultorios y clínicas en Google Maps sin sitio propio. El mensaje
          se abre en WhatsApp; no se envía solo.
        </p>
      </div>

      {loadError ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {loadError}
        </p>
      ) : null}

      {!placesReady ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {MISSING_PLACES_KEY_MESSAGE}
        </p>
      ) : null}

      <MapsPanel
        initialLeads={leads}
        initialTemplate={template}
        placesReady={placesReady}
        schemaReady={loadError === null}
      />
    </div>
  );
}
