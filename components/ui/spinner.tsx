import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Lightweight inline spinner used in buttons and loading states. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden="true" />
  );
}
