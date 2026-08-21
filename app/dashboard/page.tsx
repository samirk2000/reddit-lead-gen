import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/auth";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="min-h-full">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Bienvenido, {user.email ?? "usuario"}.
            </p>
          </div>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-muted-foreground">
          Tu panel de monitoreo y automatización de Reddit está listo. Empieza
          añadiendo keywords y configurando tus preferencias.
        </p>
      </main>
    </div>
  );
}
