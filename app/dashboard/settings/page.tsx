import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/supabase/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata: Metadata = {
  title: "Configuración",
};

export default async function SettingsPage() {
  const userId = await requireUserId();
  const supabase = await createClient(cookies());

  const { data } = await supabase
    .from("user_settings")
    .select("telegram_bot_token, telegram_chat_id, gemini_api_key, is_active")
    .eq("id", userId)
    .maybeSingle();

  const settings = data ?? null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Configuración
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Conecta tus cuentas de Telegram y Gemini, y controla el escaneo
        automático.
      </p>

      <Card className="mt-6 max-w-xl">
        <CardHeader>
          <CardTitle>Preferencias de integración</CardTitle>
          <CardDescription>
            Tus credenciales se guardan de forma segura y se usan solo para
            enviar alertas y ejecutar el análisis de leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
