"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { updateSettings, type SettingsActionResult } from "@/app/actions/settings";
import { BRAND_DEFAULTS } from "@/lib/sales/brand";
import type { UserSettings } from "@/lib/supabase/types";

type SettingsFormProps = {
  settings: Pick<
    UserSettings,
    | "telegram_bot_token"
    | "telegram_chat_id"
    | "gemini_api_key"
    | "whatsapp_number"
    | "whatsapp_url"
    | "website_url"
    | "business_name"
    | "is_active"
  > | null;
};

const EMPTY_STATE: SettingsActionResult = { ok: false, message: "" };

/** Placeholder shown inside masked password inputs when a value exists. */
const MASKED = "••••••••";

export function SettingsForm({ settings }: SettingsFormProps) {
  const [state, formAction] = useFormState(updateSettings, EMPTY_STATE);
  const { toast } = useToast();
  const shownRef = React.useRef<string | null>(null);

  // Fire a toast only when a new result arrives (avoid re-triggering on reuse).
  React.useEffect(() => {
    if (state.message && shownRef.current !== state.message) {
      shownRef.current = state.message;
      toast(state.message, state.ok ? "success" : "error");
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="mt-6 space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Venta / CTA</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Las respuestas públicas van sin WhatsApp (anti-ban Quora). El follow-up
            WA/web es solo para copiar vos al DM.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_name">Nombre del negocio (opcional)</Label>
          <Input
            id="business_name"
            name="business_name"
            type="text"
            defaultValue={
              settings?.business_name ?? BRAND_DEFAULTS.businessName
            }
            placeholder={BRAND_DEFAULTS.businessName}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="whatsapp_number">WhatsApp (con código de país)</Label>
          <Input
            id="whatsapp_number"
            name="whatsapp_number"
            type="tel"
            inputMode="numeric"
            defaultValue={
              settings?.whatsapp_number ?? BRAND_DEFAULTS.whatsappNumber
            }
            placeholder={BRAND_DEFAULTS.whatsappNumber}
          />
          <p className="text-xs text-muted-foreground">
            Solo números. México: 52 + 1 + 10 dígitos.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="whatsapp_url">Link WhatsApp Business</Label>
          <Input
            id="whatsapp_url"
            name="whatsapp_url"
            type="url"
            defaultValue={
              settings?.whatsapp_url ?? BRAND_DEFAULTS.whatsappUrl
            }
            placeholder={BRAND_DEFAULTS.whatsappUrl}
          />
          <p className="text-xs text-muted-foreground">
            Preferido en las respuestas (click-to-chat).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="website_url">Página web / landing</Label>
          <Input
            id="website_url"
            name="website_url"
            type="url"
            defaultValue={
              settings?.website_url ?? BRAND_DEFAULTS.websiteUrl
            }
            placeholder={BRAND_DEFAULTS.websiteUrl}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="telegram_bot_token">Telegram Bot Token</Label>
        <Input
          id="telegram_bot_token"
          name="telegram_bot_token"
          type="password"
          autoComplete="new-password"
          placeholder={settings?.telegram_bot_token ? MASKED : "123456:ABC-... token del bot"}
        />
        <p className="text-xs text-muted-foreground">
          Déjalo vacío para mantener el token actual.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="telegram_chat_id">Telegram Chat ID</Label>
        <Input
          id="telegram_chat_id"
          name="telegram_chat_id"
          type="text"
          defaultValue={settings?.telegram_chat_id ?? ""}
          placeholder="-1001234567890"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gemini_api_key">Gemini API Key</Label>
        <Input
          id="gemini_api_key"
          name="gemini_api_key"
          type="password"
          autoComplete="new-password"
          placeholder={settings?.gemini_api_key ? MASKED : "AIza... clave de Gemini"}
        />
        <p className="text-xs text-muted-foreground">
          Déjalo vacío para mantener la clave actual.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <label
          htmlFor="is_active"
          className="flex cursor-pointer items-start gap-3"
        >
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            defaultChecked={settings?.is_active ?? false}
            className="mt-1 size-5 shrink-0 rounded border-border text-primary accent-orange-500 focus:ring-2 focus:ring-primary"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              Escaneo automático (cron)
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Marcá esta casilla y guardá para que Vercel te escanee solo (1
              vez al día). Sin marcar = solo &quot;Run Scan Now&quot; manual.
            </span>
          </span>
        </label>
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending && <Spinner />}
      {pending ? "Guardando…" : "Guardar configuración"}
    </Button>
  );
}
