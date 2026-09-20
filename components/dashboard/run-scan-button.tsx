"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { triggerPipelineAction } from "@/app/actions/pipeline";

/**
 * Runs the lead pipeline manually and refreshes the dashboard once done.
 *
 * Wraps the run in `useTransition` so the pipeline's Server Action never blocks
 * or freezes the main thread, and reflects that state with immediate spinner
 * feedback on the button.
 */
export function RunScanButton() {
  const { toast } = useToast();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const inFlight = React.useRef(false);

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;

    startTransition(async () => {
      try {
        const result = await triggerPipelineAction();
        if (!result.ok) {
          toast(result.error ?? "No se pudo ejecutar el escaneo.", "error");
          return;
        }
        const s = result.summary;
        const fetched = s?.fetched ?? 0;
        const stored = s?.stored ?? 0;
        const alerted = s?.alerted ?? 0;
        if (fetched === 0) {
          toast(
            "Escaneo sin datos: Reddit bloqueó o ScraperAPI sin créditos. Revisá Billing de ScraperAPI / poné SCRAPER_API_ENABLED=false y redeploy.",
            "error",
          );
        } else {
          toast(
            `Escaneo completado: ${stored} leads nuevos, ${alerted} alertas, ${fetched} items revisados (posts+comentarios+quora).`,
            "success",
          );
        }
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast(message, "error");
      } finally {
        inFlight.current = false;
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      {isPending ? (
        <Spinner />
      ) : (
        <RefreshCw className="size-4" aria-hidden="true" />
      )}
      {isPending ? "Escaneando…" : "Run Scan Now"}
    </Button>
  );
}
