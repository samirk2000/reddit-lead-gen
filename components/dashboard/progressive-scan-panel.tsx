"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import type { ScanEvent, ScanLeadPreview, ScanMode } from "@/lib/pipeline/scan-types";

/**
 * Progressive scan controls: Reddit / Quora separate, live progress, pause,
 * and leads appearing as they are found.
 */
export function ProgressiveScanPanel() {
  const { toast } = useToast();
  const router = useRouter();
  const [running, setRunning] = React.useState<ScanMode | null>(null);
  const modeRef = React.useRef<ScanMode>("reddit");
  const [pausedLabel, setPausedLabel] = React.useState(false);
  const [status, setStatus] = React.useState("Listo para escanear.");
  const [progress, setProgress] = React.useState({
    current: 0,
    total: 0,
    label: "",
    phase: "",
  });
  const [liveLeads, setLiveLeads] = React.useState<ScanLeadPreview[]>([]);
  const abortRef = React.useRef<AbortController | null>(null);

  async function start(mode: ScanMode) {
    if (running) return;
    setRunning(mode);
    modeRef.current = mode;
    setPausedLabel(false);
    setLiveLeads([]);
    setProgress({ current: 0, total: 0, label: "", phase: "" });
    setStatus(
      mode === "quora" ? "Iniciando Quora…" : "Iniciando Reddit…",
    );

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/scan?mode=${mode}`, {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: ScanEvent;
          try {
            event = JSON.parse(line) as ScanEvent;
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setPausedLabel(true);
        setStatus("Pausado. Lo encontrado ya quedó guardado.");
        toast("Escaneo pausado.", "success");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message);
        toast(message, "error");
      }
    } finally {
      setRunning(null);
      abortRef.current = null;
      router.refresh();
    }
  }

  function handleEvent(event: ScanEvent) {
    switch (event.type) {
      case "status":
        setStatus(event.message);
        break;
      case "progress":
        setProgress({
          current: event.current,
          total: event.total,
          label: event.label,
          phase: event.phase,
        });
        break;
      case "lead":
        setLiveLeads((prev) => [event.lead, ...prev].slice(0, 30));
        break;
      case "error":
        setStatus(event.message);
        toast(event.message, "error");
        break;
      case "done": {
        const s = event.summary;
        setPausedLabel(event.paused);
        setStatus(
          event.paused
            ? `Pausado · ${s.stored} nuevos · ${s.skippedDedupe} ya vistos (skip)`
            : `Listo · ${s.stored} nuevos · ${s.alerted} alertas · ${s.fetched} revisados · ${s.skippedDedupe} ya vistos`,
        );
        if (!event.paused) {
          const mode = modeRef.current;
          if (s.fetched === 0) {
            toast(
              mode === "quora"
                ? "Quora sin datos: revisá SERPAPI_KEY en Vercel (la cuenta nueva) y redeploy. Si SerpAPI sigue en 0 créditos, la key no llegó al servidor."
                : "Reddit sin datos: bloqueo de IP o ScraperAPI sin créditos. Probá Escanear Quora o esperá créditos.",
              "error",
            );
          } else {
            toast(`Escaneo OK: ${s.stored} leads nuevos.`, "success");
          }
        }
        break;
      }
    }
  }

  function pause() {
    abortRef.current?.abort();
  }

  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : running
        ? 5
        : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={running !== null}
          onClick={() => start("reddit")}
        >
          {running === "reddit" ? (
            <Spinner />
          ) : (
            <Play className="size-4" />
          )}
          {running === "reddit" ? "Escaneando Reddit…" : "Escanear Reddit"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={running !== null}
          onClick={() => start("quora")}
        >
          {running === "quora" ? (
            <Spinner />
          ) : (
            <Search className="size-4" />
          )}
          {running === "quora" ? "Escaneando Quora…" : "Escanear Quora"}
        </Button>
        {running && (
          <Button type="button" variant="ghost" onClick={pause}>
            <Pause className="size-4" />
            Pausar
          </Button>
        )}
      </div>

      <p className="mt-3 text-sm text-foreground">{status}</p>

      {(running || progress.total > 0) && (
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.phase
                ? `${progress.phase}: ${progress.label}`
                : progress.label || "…"}
            </span>
            <span>
              {progress.total > 0
                ? `${progress.current}/${progress.total} (${pct}%)`
                : pausedLabel
                  ? "pausado"
                  : "…"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {liveLeads.length > 0 && (
        <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {liveLeads.map((lead) => (
            <li
              key={lead.id}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={lead.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-foreground hover:underline"
                >
                  {lead.title}
                </a>
                <Badge variant="muted">r/{lead.subreddit}</Badge>
                {lead.intent_score != null && (
                  <Badge
                    variant={lead.intent_score >= 7 ? "success" : "muted"}
                  >
                    {lead.intent_score}/10
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
