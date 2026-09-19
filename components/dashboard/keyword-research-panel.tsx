"use client";

import * as React from "react";
import { Search, Sparkles, TrendingUp } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  runKeywordResearch,
  applyResearchedKeywords,
} from "@/app/actions/keyword-research";
import type { KeywordCandidate } from "@/lib/ai/keyword-research";

/**
 * In-app Semrush-style keyword research panel.
 * Runs Gemini (+ optional Google Trends via SERPAPI_KEY) and lets the user
 * one-click activate selected phrases into the monitoring pipeline.
 */
export function KeywordResearchPanel() {
  const { toast } = useToast();
  const [niche, setNiche] = React.useState(
    "IPTV Fire Stick Android TV TiviMate",
  );
  const [busy, setBusy] = React.useState<"idle" | "research" | "apply">("idle");
  const [candidates, setCandidates] = React.useState<KeywordCandidate[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState<string[]>([]);
  const [trendsEnriched, setTrendsEnriched] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleResearch() {
    setBusy("research");
    setMessage(null);
    try {
      const result = await runKeywordResearch(niche);
      if (!result.ok || !result.result) {
        toast(result.message, "error");
        return;
      }
      setCandidates(result.result.candidates);
      setNotes(result.result.notes);
      setTrendsEnriched(result.result.trendsEnriched);
      // Pre-select high intent (>= 8).
      setSelected(
        new Set(
          result.result.candidates
            .filter((c) => c.intent_score >= 8)
            .map((c) => keyOf(c)),
        ),
      );
      setMessage(result.message);
      toast(result.message, "success");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Research falló.",
        "error",
      );
    } finally {
      setBusy("idle");
    }
  }

  async function handleApply() {
    const rows = candidates.filter((c) => selected.has(keyOf(c)));
    if (rows.length === 0) {
      toast("Selecciona al menos una keyword.", "error");
      return;
    }
    setBusy("apply");
    try {
      const result = await applyResearchedKeywords(
        rows.map((c) => ({
          phrase: c.phrase,
          suggested_subreddit: c.suggested_subreddit,
        })),
      );
      toast(result.message, result.ok ? "success" : "error");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "No se pudieron activar.",
        "error",
      );
    } finally {
      setBusy("idle");
    }
  }

  function toggle(c: KeywordCandidate) {
    const k = keyOf(c);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectAll(on: boolean) {
    if (!on) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(candidates.map(keyOf)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden="true" />
          Keyword Research
        </CardTitle>
        <CardDescription>
          Investiga frases de alta intención automáticamente (Gemini
          {trendsEnriched ? " + Google Trends" : ""}). Activá las que quieras
          monitorear — sin pegar listas a mano.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="research-niche">Nicho / semilla</Label>
            <Input
              id="research-niche"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="IPTV Fire Stick Android TV"
              disabled={busy !== "idle"}
            />
          </div>
          <Button
            type="button"
            onClick={handleResearch}
            disabled={busy !== "idle"}
          >
            {busy === "research" ? <Spinner /> : <Search className="size-4" />}
            {busy === "research" ? "Investigando…" : "Investigar keywords"}
          </Button>
        </div>

          <p className="text-xs text-muted-foreground">
            Tip: agregá <span className="font-mono">SERPAPI_KEY</span> en{" "}
            <span className="font-mono">.env.local</span> (servidor) para
            enriquecer con Google Trends. Sin ella, Gemini investiga igual.
          </p>

        {message && (
          <p className="text-sm text-foreground">{message}</p>
        )}

        {notes.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}

        {candidates.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => selectAll(true)}
                  disabled={busy !== "idle"}
                >
                  Seleccionar todas
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => selectAll(false)}
                  disabled={busy !== "idle"}
                >
                  Ninguna
                </Button>
              </div>
              <Button
                type="button"
                onClick={handleApply}
                disabled={busy !== "idle" || selected.size === 0}
              >
                {busy === "apply" ? <Spinner /> : null}
                {busy === "apply"
                  ? "Activando…"
                  : `Activar seleccionadas (${selected.size})`}
              </Button>
            </div>

            <ul className="divide-y divide-border rounded-md border border-border">
              {candidates.map((c) => {
                const k = keyOf(c);
                const checked = selected.has(k);
                return (
                  <li
                    key={k}
                    className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-muted/40"
                    onClick={() => toggle(c)}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggle(c)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Seleccionar ${c.phrase}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {c.phrase}
                        </span>
                        <Badge
                          variant={
                            c.intent_score >= 8
                              ? "success"
                              : c.intent_score >= 6
                                ? "default"
                                : "muted"
                          }
                        >
                          Intent {c.intent_score}/10
                        </Badge>
                        <Badge variant="muted">r/{c.suggested_subreddit}</Badge>
                        {c.trend === "rising" && (
                          <Badge variant="default">
                            <TrendingUp className="mr-1 size-3" />
                            rising
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.rationale}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function keyOf(c: KeywordCandidate): string {
  return `${c.phrase.toLowerCase()}|${c.suggested_subreddit.toLowerCase()}`;
}
