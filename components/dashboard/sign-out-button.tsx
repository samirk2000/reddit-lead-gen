"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/signout";
import { cn } from "@/lib/utils";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <LogOut className="size-4" aria-hidden="true" />
        Cerrar sesión
      </button>
    </form>
  );
}
