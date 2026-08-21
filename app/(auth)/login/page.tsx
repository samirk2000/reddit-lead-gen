import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Iniciar sesión"
      subtitle="Accede a tu panel de monitoreo de Reddit."
    >
      {/* useSearchParams requires a Suspense boundary in static rendering. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
