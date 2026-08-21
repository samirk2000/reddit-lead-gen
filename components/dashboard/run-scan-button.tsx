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
 */
export function RunScanButton() {
  const [running, setRunning] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  async function handleClick() {
    if (running) return;
    setRunning(true);
    try {
      const result = await triggerPipelineAction();
      if (!result.ok) {
        toast(result.error ?? "No se pudo ejecutar el escaneo.", "error");
        return;
      }
      const s = result.summary;
      toast(
        `Escaneo completado: ${s?.stored ?? 0} leads nuevos, ${s?.alerted ?? 0} alertas, ${s?.fetched ?? 0} posts revisados.`,
        "success",
      );
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={running}>
      {running ? (
        <Spinner />
      ) : (
        <RefreshCw className="size-4" aria-hidden="true" />
      )}
      {running ? "Escaneando…" : "Run Scan Now"}
    </Button>
  );
}
