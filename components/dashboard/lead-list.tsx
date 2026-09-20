"use client";

import * as React from "react";
import {
  Copy,
  ExternalLink,
  CheckCircle2,
  Archive,
  MessageCircle,
  Globe,
  RefreshCw,
  Clock,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  updateLeadStatus,
  snoozeLeadFollowUp,
  clearLeadFollowUp,
  regenerateLeadReplies,
} from "@/app/actions/leads";
import {
  normalizeWebsiteUrl,
  resolveWhatsappHref,
} from "@/lib/sales/cta";
import {
  detectLeadChannel,
  channelLabel,
  type LeadChannel,
} from "@/lib/leads/channel";
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
  | "suggested_reply_wa"
  | "follow_up_at"
  | "status"
  | "created_at"
>;

type LeadListProps = {
  leads: LeadView[];
  salesCta?: {
    whatsappNumber?: string | null;
    whatsappUrl?: string | null;
    websiteUrl?: string | null;
  };
};

const TABS = [
  { key: "all", label: "Todos" },
  { key: "notified", label: "Notificados" },
  { key: "followup", label: "Follow-up" },
  { key: "replied", label: "Respondidos" },
  { key: "archived", label: "Archivados" },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type ChannelFilter = "all" | LeadChannel;

const MIN_OPPORTUNITY_SCORE = 7;

function isSnoozed(lead: LeadView, now = Date.now()): boolean {
  if (!lead.follow_up_at) return false;
  return new Date(lead.follow_up_at).getTime() > now;
}

/** Actionable queue: high intent, not replied/archived/rejected, not snoozed. */
function isOpportunity(lead: LeadView): boolean {
  if (
    lead.status === "replied" ||
    lead.status === "archived" ||
    lead.status === "rejected"
  ) {
    return false;
  }
  if (isSnoozed(lead)) return false;
  if (lead.status === "notified" || lead.status === "new") {
    return lead.intent_score === null || lead.intent_score >= MIN_OPPORTUNITY_SCORE;
  }
  return false;
}

function isFollowUp(lead: LeadView): boolean {
  return Boolean(lead.follow_up_at) && lead.status !== "replied" && lead.status !== "archived";
}

export function LeadList({ leads: initialLeads, salesCta }: LeadListProps) {
  const [leads, setLeads] = React.useState(initialLeads);
  const [tab, setTab] = React.useState<TabKey>("all");
  const [channel, setChannel] = React.useState<ChannelFilter>("all");
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  const waHref = resolveWhatsappHref(salesCta ?? {});
  const website = normalizeWebsiteUrl(salesCta?.websiteUrl);

  const channelFiltered =
    channel === "all"
      ? leads
      : leads.filter((l) => detectLeadChannel(l) === channel);

  const filtered = channelFiltered.filter((l) => {
    if (tab === "all") return isOpportunity(l);
    if (tab === "followup") return isFollowUp(l);
    return l.status === tab;
  });

  function patchLead(id: string, patch: Partial<LeadView>) {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  async function changeStatus(
    id: string,
    status: "replied" | "archived" | "notified",
  ) {
    setBusyId(id);
    const prev = leads.find((l) => l.id === id);
    patchLead(id, { status, follow_up_at: null });
    try {
      await updateLeadStatus(id, status);
      toast(
        status === "replied"
          ? "Marcado como respondido."
          : status === "archived"
            ? "Lead archivado."
            : "Lead reabierto en cola.",
        "success",
      );
    } catch (error) {
      if (prev) patchLead(id, prev);
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function snooze(id: string) {
    setBusyId(id);
    const when = new Date();
    when.setDate(when.getDate() + 1);
    patchLead(id, { follow_up_at: when.toISOString(), status: "notified" });
    try {
      await snoozeLeadFollowUp(id);
      toast("Follow-up mañana. Sacado de Todos.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function unsnooze(id: string) {
    setBusyId(id);
    patchLead(id, { follow_up_at: null, status: "notified" });
    try {
      await clearLeadFollowUp(id);
      toast("Vuelve a la cola.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function regenerate(id: string) {
    setBusyId(id);
    try {
      const result = await regenerateLeadReplies(id);
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      patchLead(id, {
        suggested_reply: result.suggested_reply ?? null,
        suggested_reply_wa: result.suggested_reply_wa ?? null,
      });
      toast(result.message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function copyText(label: string, text: string) {
    if (!text) {
      toast(`No hay ${label}.`, "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copiada.`, "success");
    } catch {
      toast("No se pudo copiar.", "error");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Canal:</span>
        {(
          [
            ["all", "Todos"],
            ["reddit", "Reddit"],
            ["quora", "Quora"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setChannel(key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              channel === key
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <TabBar
        active={tab}
        onChange={setTab}
        counts={countByTab(channelFiltered)}
      />

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay leads en esta vista.
        </p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              busy={busyId === lead.id}
              waHref={waHref}
              website={website}
              onChangeStatus={changeStatus}
              onSnooze={snooze}
              onUnsnooze={unsnooze}
              onRegenerate={regenerate}
              onCopy={copyText}
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
  counts: Record<TabKey, number>;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === t.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t.label} {counts[t.key]}
        </button>
      ))}
    </div>
  );
}

function countByTab(leads: LeadView[]): Record<TabKey, number> {
  return {
    all: leads.filter(isOpportunity).length,
    notified: leads.filter((l) => l.status === "notified").length,
    followup: leads.filter(isFollowUp).length,
    replied: leads.filter((l) => l.status === "replied").length,
    archived: leads.filter((l) => l.status === "archived").length,
  };
}

function LeadCard({
  lead,
  busy,
  waHref,
  website,
  onChangeStatus,
  onSnooze,
  onUnsnooze,
  onRegenerate,
  onCopy,
}: {
  lead: LeadView;
  busy: boolean;
  waHref: string | null;
  website: string | null;
  onChangeStatus: (id: string, status: "replied" | "archived" | "notified") => void;
  onSnooze: (id: string) => void;
  onUnsnooze: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCopy: (label: string, text: string) => void;
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
  const replyPublic = lead.suggested_reply ?? "";
  const replyWa = lead.suggested_reply_wa ?? "";
  const channel = detectLeadChannel(lead);
  const snoozed = isSnoozed(lead);
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
            <Badge variant="secondary">{channelLabel(channel)}</Badge>
            <Badge variant="muted">
              {lead.status === "notified"
                ? snoozed
                  ? "Follow-up"
                  : "Notificado"
                : lead.status === "replied"
                  ? "Respondido"
                  : lead.status === "new"
                    ? "Nuevo"
                    : "Archivado"}
            </Badge>
            <span className="text-xs text-muted-foreground">{date}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy("Respuesta pública", replyPublic)}
              disabled={!replyPublic}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copiar pública
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy("Follow-up WA", replyWa)}
              disabled={!replyWa}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copiar WA
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRegenerate(lead.id)}
            >
              {busy ? <Spinner /> : <RefreshCw className="size-4" aria-hidden="true" />}
              Regenerar
            </Button>
            {waHref && (
              <Button variant="outline" size="sm" className="no-underline" asChild>
                <a href={waHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  WhatsApp
                </a>
              </Button>
            )}
            {website && (
              <Button variant="outline" size="sm" className="no-underline" asChild>
                <a href={website} target="_blank" rel="noopener noreferrer">
                  <Globe className="size-4" aria-hidden="true" />
                  Web
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" className="no-underline" asChild>
              <a href={lead.post_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                {channel === "quora" ? "Ver en Quora" : "Ver en Reddit"}
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

        {replyPublic && (
          <blockquote className="mt-3 rounded-md border-l-2 border-primary bg-muted/50 p-3 text-sm text-foreground whitespace-pre-wrap">
            <span className="font-medium">Pública ({channelLabel(channel)}): </span>
            {replyPublic}
          </blockquote>
        )}

        {replyWa && (
          <blockquote className="mt-2 rounded-md border-l-2 border-border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
            <span className="font-medium text-foreground">Follow-up WA: </span>
            {replyWa}
          </blockquote>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {lead.status !== "replied" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onChangeStatus(lead.id, "replied")}
            >
              {busy ? <Spinner /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
              Marcar como respondido
            </Button>
          )}
          {(lead.status === "replied" || lead.status === "archived") && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onChangeStatus(lead.id, "notified")}
            >
              {busy ? <Spinner /> : <RotateCcw className="size-4" aria-hidden="true" />}
              Reabrir
            </Button>
          )}
          {lead.status !== "archived" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onChangeStatus(lead.id, "archived")}
            >
              {busy ? <Spinner /> : <Archive className="size-4" aria-hidden="true" />}
              Archivar
            </Button>
          )}
          {!snoozed && lead.status !== "replied" && lead.status !== "archived" && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onSnooze(lead.id)}
            >
              <Clock className="size-4" aria-hidden="true" />
              Follow-up mañana
            </Button>
          )}
          {snoozed && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onUnsnooze(lead.id)}
            >
              <Clock className="size-4" aria-hidden="true" />
              Quitar snooze
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
