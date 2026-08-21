"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  CheckCircle2,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { updateLeadStatus } from "@/app/actions/leads";
import type { DetectedLead } from "@/lib/supabase/types";

export type LeadView = Pick<
  DetectedLead,
  | "id"
  | "reddit_post_id"
  | "title"
  | "subreddit"
  | "post_url"
  | "intent_score"
  | "analysis_reasoning"
  | "suggested_reply"
  | "status"
  | "created_at"
>;

type LeadListProps = {
  leads: LeadView[];
};

const TABS = [
  { key: "all", label: "Todos" },
  { key: "notified", label: "Notificados" },
  { key: "replied", label: "Respondidos" },
  { key: "archived", label: "Archivados" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function LeadList({ leads }: LeadListProps) {
  const [tab, setTab] = React.useState<TabKey>("all");
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = tab === "all" ? leads : leads.filter((l) => l.status === tab);

  async function changeStatus(id: string, status: "replied" | "archived") {
    setBusyId(id);
    try {
      await updateLeadStatus(id, status);
      toast(status === "replied" ? "Marcado como respondido." : "Lead archivado.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function copyReply(reply: string) {
    try {
      await navigator.clipboard.writeText(reply);
      toast("Respuesta copiada al portapapeles.", "success");
    } catch {
      toast("No se pudo copiar la respuesta.", "error");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <TabBar active={tab} onChange={setTab} counts={countByTab(leads)} />

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay leads en esta vista. Ejecuta un escaneo para detectar nuevos
          oportunidades.
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              onChangeStatus={changeStatus}
              onCopy={copyReply}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBar({
  active,
  onChange,
  counts,
}: {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  counts: Record<string, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar leads por estado"
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {counts[tab.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function countByTab(leads: LeadView[]): Record<string, number> {
  const counts: Record<string, number> = {
    all: leads.length,
    notified: 0,
    replied: 0,
    archived: 0,
  };
  for (const lead of leads) {
    if (lead.status in counts) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    }
  }
  return counts;
}

function LeadCard({
  lead,
  busy,
  onChangeStatus,
  onCopy,
}: {
  lead: LeadView;
  busy: boolean;
  onChangeStatus: (id: string, status: "replied" | "archived") => void;
  onCopy: (reply: string) => void;
}) {
  const score = lead.intent_score ?? null;
  const scoreVariant =
    score === null
      ? "muted"
      : score >= 8
        ? "success"
        : score >= 6
          ? "warning"
          : "muted";
  const reply = lead.suggested_reply ?? "";
  const date = lead.created_at
    ? new Date(lead.created_at).toLocaleDateString("es", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  return (
    <li>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {score !== null && (
              <Badge variant={scoreVariant}>Score: {score}/10</Badge>
            )}
            <Badge variant="secondary">r/{lead.subreddit}</Badge>
            <Badge variant="muted">
              {lead.status === "notified"
                ? "Notificado"
                : lead.status === "replied"
                  ? "Respondido"
                  : "Archivado"}
            </Badge>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy(reply)}
              disabled={!reply}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copiar respuesta
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="no-underline"
              asChild
            >
              <a
                href={lead.post_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                Ver en Reddit
              </a>
            </Button>
          </div>
        </div>

        <h3 className="mt-3 font-medium leading-snug text-foreground">
          {lead.title}
        </h3>

        {lead.analysis_reasoning && (
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Análisis: </span>
            {lead.analysis_reasoning}
          </p>
        )}

        {reply && (
          <blockquote className="mt-3 rounded-md border-l-2 border-primary bg-muted/50 p-3 text-sm text-foreground">
            <span className="font-medium">Respuesta sugerida: </span>
            {reply}
          </blockquote>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onChangeStatus(lead.id, "replied")}
          >
            {busy ? <Spinner /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
            Marcar como respondido
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onChangeStatus(lead.id, "archived")}
          >
            {busy ? <Spinner /> : <Archive className="size-4" aria-hidden="true" />}
            Archivar
          </Button>
        </div>
      </div>
    </li>
  );
}
