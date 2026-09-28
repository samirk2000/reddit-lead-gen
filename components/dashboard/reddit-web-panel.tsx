"use client";

import * as React from "react";
import { Copy, ExternalLink, Scale } from "lucide-react";
import { updateRedditWebLead } from "@/app/actions/reddit-web";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  REDDIT_WEB_ESTADOS,
  REDDIT_WEB_ESTADO_LABELS,
  REDDIT_WEB_IDIOMA_LABELS,
  REDDIT_WEB_IDIOMAS,
  isRedditWebLeadEstado,
} from "@/lib/reddit-web/constants";
import { redditPostHref, subredditRulesHref } from "@/lib/reddit-web/links";
import { cn } from "@/lib/utils";
import type {
  RedditWebLead,
  RedditWebLeadEstado,
  RedditWebLeadIdioma,
} from "@/lib/supabase/types";

type IdiomaFilter = "" | RedditWebLeadIdioma | "sin-idioma";

type RedditWebPanelProps = {
  initialLeads: RedditWebLead[];
  schemaReady: boolean;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const scoreFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

export function RedditWebPanel({
  initialLeads,
  schemaReady,
}: RedditWebPanelProps) {
  const [leads, setLeads] = React.useState(initialLeads);
  const [estado, setEstado] = React.useState<"" | RedditWebLeadEstado>("");
  const [idioma, setIdioma] = React.useState<IdiomaFilter>("");

  React.useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  const scoped = leads.filter((lead) => matchesIdioma(lead, idioma));

  const counts = REDDIT_WEB_ESTADOS.reduce(
    (acc, key) => {
      acc[key] = scoped.filter((lead) => lead.estado === key).length;
      return acc;
    },
    {} as Record<RedditWebLeadEstado, number>,
  );

  const visible = estado
    ? scoped.filter((lead) => lead.estado === estado)
    : scoped;

  function replaceLead(updated: RedditWebLead) {
    setLeads((current) =>
      current.map((lead) => (lead.id === updated.id ? updated : lead)),
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <section aria-label="Leads guardados" className="space-y-4">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por estado"
        >
          <FilterChip
            active={estado === ""}
            onClick={() => setEstado("")}
            label="Todos"
            count={scoped.length}
          />
          {REDDIT_WEB_ESTADOS.map((value) => (
            <FilterChip
              key={value}
              active={estado === value}
              onClick={() => setEstado(value)}
              label={REDDIT_WEB_ESTADO_LABELS[value]}
              count={counts[value]}
            />
          ))}
        </div>

        <div className="max-w-sm space-y-2">
          <Label htmlFor="filter-idioma">Idioma</Label>
          <select
            id="filter-idioma"
            className={selectClass}
            value={idioma}
            onChange={(event) => setIdioma(event.target.value as IdiomaFilter)}
          >
            <option value="">Todos</option>
            {REDDIT_WEB_IDIOMAS.map((value) => (
              <option key={value} value={value}>
                {REDDIT_WEB_IDIOMA_LABELS[value]}
              </option>
            ))}
            <option value="sin-idioma">Sin idioma</option>
          </select>
        </div>

        <p className="text-sm text-muted-foreground">
          Los más recientes primero. Volver a ingerir el mismo post actualiza
          el borrador y conserva el estado y las notas.
        </p>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-sm leading-6 text-muted-foreground">
            {!schemaReady
              ? "Cuando la migración esté aplicada, aquí aparecerán los leads."
              : leads.length === 0
                ? "Todavía no hay leads. Cuando el bot publique en /api/reddit-web/ingest, se verán aquí."
                : "Ningún lead coincide con esos filtros."}
          </p>
        ) : (
          <ul className="space-y-4">
            {visible.map((lead) => (
              <li key={lead.id}>
                <LeadCard lead={lead} onUpdated={replaceLead} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function matchesIdioma(lead: RedditWebLead, idioma: IdiomaFilter): boolean {
  if (!idioma) return true;
  if (idioma === "sin-idioma") return lead.idioma == null;
  return lead.idioma === idioma;
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("ml-1", active ? "opacity-80" : "text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}

function LeadCard({
  lead,
  onUpdated,
}: {
  lead: RedditWebLead;
  onUpdated: (lead: RedditWebLead) => void;
}) {
  const { toast } = useToast();
  const [notesDraft, setNotesDraft] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const notes = notesDraft ?? lead.notas;
  const postHref = redditPostHref(lead.url);
  const rulesHref = subredditRulesHref(lead.subreddit);
  const postedOn = formatWhen(lead.created_utc);
  const receivedOn = formatWhen(lead.inserted_at);

  async function onStatus(next: RedditWebLeadEstado) {
    const previous = lead;
    onUpdated({ ...lead, estado: next });
    setBusy(true);
    try {
      const result = await updateRedditWebLead(lead.id, { estado: next });
      if (!result.ok || !result.lead) {
        onUpdated(previous);
        toast(result.message, "error");
        return;
      }
      onUpdated(result.lead);
    } catch (error) {
      onUpdated(previous);
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onNotesBlur() {
    if (notes === lead.notas) return;
    setBusy(true);
    try {
      const result = await updateRedditWebLead(lead.id, { notas: notes });
      if (!result.ok || !result.lead) {
        toast(result.message, "error");
        return;
      }
      setNotesDraft(null);
      onUpdated(result.lead);
      toast("Notas guardadas.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft(text: string | null, language: "español" | "inglés") {
    const value = text?.trim() ?? "";
    if (!value) {
      toast(`No hay borrador en ${language}.`, "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast(`Borrador en ${language} copiado.`, "success");
    } catch {
      toast("No se pudo copiar. Selecciona el texto y cópialo a mano.", "error");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">r/{lead.subreddit}</Badge>
              {lead.idioma ? (
                <Badge variant="muted">{REDDIT_WEB_IDIOMA_LABELS[lead.idioma]}</Badge>
              ) : (
                <Badge variant="muted">Sin idioma</Badge>
              )}
              {lead.intencion ? <Badge>{lead.intencion}</Badge> : null}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {postHref ? (
                <a
                  href={postHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-start gap-1 break-words underline-offset-4 hover:underline"
                >
                  {lead.title}
                  <ExternalLink className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="break-words">{lead.title}</span>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {lead.author ? `u/${lead.author}` : "Autor no disponible"}
              {lead.pais_detectado ? ` · ${lead.pais_detectado}` : " · País no detectado"}
              <span className="ml-2 font-medium text-primary">
                {lead.score_intencion == null
                  ? "Sin puntuación"
                  : `Intención ${scoreFormat.format(lead.score_intencion)}`}
              </span>
            </p>
          </div>
          <div className="w-full space-y-2 sm:w-48">
            <Label htmlFor={`estado-${lead.id}`}>Estado</Label>
            <select
              id={`estado-${lead.id}`}
              className={selectClass}
              aria-label={`Estado de ${lead.title}`}
              value={lead.estado}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== lead.estado && isRedditWebLeadEstado(next)) {
                  void onStatus(next);
                }
              }}
            >
              {REDDIT_WEB_ESTADOS.map((value) => (
                <option key={value} value={value}>
                  {REDDIT_WEB_ESTADO_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm leading-6 text-foreground">
          {lead.problema?.trim()
            ? lead.problema
            : "Sin resumen del problema."}
        </p>

        {lead.keywords.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Palabras clave">
            {lead.keywords.map((keyword, index) => (
              <li key={`${keyword}-${index}`}>
                <Badge variant="secondary">{keyword}</Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {rulesHref ? (
            <a
              href={rulesHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <Scale className="size-3.5" aria-hidden="true" />
              Reglas de r/{lead.subreddit}
            </a>
          ) : null}
          {lead.clasificador ? (
            <span className="text-muted-foreground">
              Clasificado por {lead.clasificador}
            </span>
          ) : null}
          {postedOn ? (
            <span className="text-muted-foreground">Publicado el {postedOn}</span>
          ) : null}
          {receivedOn ? (
            <span className="text-muted-foreground">Recibido el {receivedOn}</span>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`notas-${lead.id}`}>Notas</Label>
          <Textarea
            id={`notas-${lead.id}`}
            value={notes}
            onChange={(event) => setNotesDraft(event.target.value)}
            onBlur={() => {
              void onNotesBlur();
            }}
            rows={2}
            maxLength={4000}
            placeholder="Qué respondiste, si ya cotizaste, o por qué lo descartaste."
          />
        </div>

        <DraftBlock
          id={`borrador-es-${lead.id}`}
          label="Borrador en español"
          text={lead.borrador_es}
          onCopy={() => void copyDraft(lead.borrador_es, "español")}
        />
        <DraftBlock
          id={`borrador-en-${lead.id}`}
          label="Borrador en inglés"
          text={lead.borrador_en}
          onCopy={() => void copyDraft(lead.borrador_en, "inglés")}
        />
      </CardContent>
    </Card>
  );
}

function DraftBlock({
  id,
  label,
  text,
  onCopy,
}: {
  id: string;
  label: string;
  text: string | null;
  onCopy: () => void;
}) {
  const value = text?.trim() ?? "";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {value ? (
        <Textarea id={id} value={value} readOnly rows={5} className="min-h-28" />
      ) : (
        <p id={id} className="text-sm text-muted-foreground">
          Este lead no trae {label.toLowerCase()}.
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        className="w-full sm:w-auto"
        onClick={onCopy}
        disabled={!value}
      >
        <Copy className="size-4" aria-hidden="true" />
        Copiar {label.toLowerCase()}
      </Button>
    </div>
  );
}

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dateFormat.format(date);
}
