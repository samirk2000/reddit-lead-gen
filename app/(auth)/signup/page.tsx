import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Crear cuenta",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Configura tu cuenta para automatizar el engagement en Reddit."
    >
      <SignupForm />
    </AuthShell>
  );
}
