"use client";

import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { signup, type AuthActionState } from "@/app/actions/auth";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors",
        "hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <UserPlus className="size-4" aria-hidden="true" />
      )}
      {pending ? "Creando cuenta…" : "Crear cuenta"}
    </button>
  );
}

export function SignupForm() {
  const [state, formAction] = useFormState(signup, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground"
        >
          Email
        </label>
        <div className="mt-2">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="tu@empresa.com"
            className="block w-full rounded-md border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Contraseña
        </label>
        <div className="mt-2">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
            className="block w-full rounded-md border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-1 ring-inset ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
          />
        </div>
      </div>

      {state.error && (
        <div
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </div>
      )}

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-primary hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
