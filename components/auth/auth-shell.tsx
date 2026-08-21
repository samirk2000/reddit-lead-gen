import type { ReactNode } from "react";
import { Search } from "lucide-react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

/** Shared centered card used by the login and signup screens. */
export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div className="flex items-center gap-2 text-primary">
        <Search className="size-8" aria-hidden="true" />
        <span className="text-2xl font-bold">Reddit LeadGen</span>
      </div>

      <div className="mt-8 w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}
