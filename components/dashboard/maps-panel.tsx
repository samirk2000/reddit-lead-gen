"use client";

import * as React from "react";
import { Copy, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import {
  markMapsLeadContacted,
  personalizeMapsLeadMessage,
  saveMapsTemplate,
  searchMapsLeads,
  updateMapsLead,
} from "@/app/actions/maps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  REASON_LABELS,
  SPECIALTY_PRESETS,
  STATUS_LABELS,
  TEMPLATE_TOKENS,
} from "@/lib/maps/constants";
import { renderLeadMessage, whatsAppHref } from "@/lib/maps/message";
import { MAPS_LEAD_STATUSES, isMapsLeadStatus } from "@/lib/maps/types";
import type { MapsSearchSummary } from "@/lib/maps/types";
import { cn } from "@/lib/utils";
import type { MapsLead, MapsLeadStatus } from "@/lib/supabase/types";

type MapsPanelProps = {
  initialLeads: MapsLead[];
  initialTemplate: string;
  placesReady: boolean;
  schemaReady: boolean;
};

function sortLeads(leads: MapsLead[]): MapsLead[] {
  return [...leads].sort(
    (a, b) =>
      b.priority_score - a.priority_score ||
      (b.user_rating_count ?? 0) - (a.user_rating_count ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );
}

function mergeLeads(current: MapsLead[], incoming: MapsLead[]): MapsLead[] {
  const byId = new Map(current.map((lead) => [lead.id, lead]));
  for (const lead of incoming) byId.set(lead.id, lead);
  return sortLeads([...byId.values()]);
}

const selectClass =
  "flex h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MapsPanel({
  initialLeads,
  initialTemplate,
  placesReady,
  schemaReady,
}: MapsPanelProps) {
  const { toast } = useToast();
  const [leads, setLeads] = React.useState(initialLeads);
  const [specialty, setSpecialty] = React.useState("dentista");
  const [city, setCity] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [summary, setSummary] = React.useState<MapsSearchSummary | null>(null);
  const [status, setStatus] = React.useState<"" | MapsLeadStatus>("");
  const [filterSpecialty, setFilterSpecialty] = React.useState("");
  const [filterCity, setFilterCity] = React.useState("");
  const [template, setTemplate] = React.useState(initialTemplate);
  const [savingTemplate, setSavingTemplate] = React.useState(false);
  const templateTouched = React.useRef(false);

  React.useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  React.useEffect(() => {
    if (!templateTouched.current) setTemplate(initialTemplate);
  }, [initialTemplate]);

  const specialties = React.useMemo(() => {
    return [...new Set(leads.map((lead) => lead.specialty))].sort((a, b) =>
      a.localeCompare(b, "es"),
    );
  }, [leads]);

  const cities = React.useMemo(() => {
    return [...new Set(leads.map((lead) => lead.city))].sort((a, b) =>
      a.localeCompare(b, "es"),
    );
  }, [leads]);

  const scoped = leads.filter((lead) => {
    if (filterSpecialty && lead.specialty !== filterSpecialty) return false;
    if (filterCity && lead.city !== filterCity) return false;
    return true;
  });

  const counts = MAPS_LEAD_STATUSES.reduce(
    (acc, key) => {
      acc[key] = scoped.filter((lead) => lead.status === key).length;
      return acc;
    },
    {} as Record<MapsLeadStatus, number>,
  );

  const visible = status
    ? scoped.filter((lead) => lead.status === status)
    : scoped;

  function replaceLead(updated: MapsLead) {
    setLeads((current) =>
      current.map((lead) => (lead.id === updated.id ? updated : lead)),
    );
  }

  async function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!placesReady || !schemaReady) return;
    setSearching(true);
    setSummary(null);
    try {
      const result = await searchMapsLeads(specialty, city);
      if (!result.ok || !result.summary) {
        toast(result.message, "error");
        return;
      }
      setSummary(result.summary);
      setFilterSpecialty(specialty.trim().replace(/\s+/g, " "));
      setFilterCity(city.trim().replace(/\s+/g, " "));
      setStatus("");
      if (result.leads) setLeads((current) => mergeLeads(current, result.leads ?? []));
      toast(result.message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setSearching(false);
    }
  }

  async function onSaveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTemplate(true);
    try {
      const result = await saveMapsTemplate(template);
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      if (result.template) setTemplate(result.template);
      toast(result.message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={onSearch} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maps-specialty">Giro o palabra clave</Label>
                <Input
                  id="maps-specialty"
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value)}
                  placeholder="dentista"
                  maxLength={80}
                  required
                  disabled={!schemaReady}
                  onInvalid={(event) =>
                    event.currentTarget.setCustomValidity(
                      "Escribe un giro o palabra clave.",
                    )
                  }
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maps-city">Ciudad o zona</Label>
                <Input
                  id="maps-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="Querétaro"
                  maxLength={80}
                  required
                  disabled={!schemaReady}
                  onInvalid={(event) =>
                    event.currentTarget.setCustomValidity(
                      "Escribe una ciudad o zona.",
                    )
                  }
                  onInput={(event) => event.currentTarget.setCustomValidity("")}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Giros frecuentes">
              {SPECIALTY_PRESETS.map((preset) => {
                const active = specialty.trim().toLowerCase() === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSpecialty(preset)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted-foreground">
                Cada búsqueda consulta Google Places (hasta 3 páginas, tope de
                30 por hora). Solo se guardan negocios sin sitio, o cuyo sitio
                es una red social. Los que ya estaban conservan estado y notas.
              </p>
              <Button
                type="submit"
                className="w-full sm:w-auto disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
                disabled={searching || !placesReady || !schemaReady}
              >
                {searching ? <Spinner /> : null}
                {searching ? "Buscando…" : "Buscar"}
              </Button>
            </div>
          </form>

          {summary ? (
            <p
              role="status"
              className="mt-4 rounded-md bg-muted px-4 py-3 text-sm leading-6 text-foreground"
            >
              «{summary.query}»: {summary.found} negocios en {summary.pages}{" "}
              {summary.pages === 1 ? "página" : "páginas"}. Se guardaron{" "}
              {summary.leads} prospectos. {summary.withWebsite} ya tenían sitio
              {summary.skippedClosed > 0
                ? ` y ${summary.skippedClosed} estaban cerrados de forma permanente`
                : ""}
              {summary.duplicates > 0
                ? `. ${summary.duplicates} salieron repetidos`
                : ""}
              . Los que ya estaban en la lista conservan su estado y sus notas.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section aria-label="Prospectos guardados" className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          <FilterChip
            active={status === ""}
            onClick={() => setStatus("")}
            label="Todos"
            count={scoped.length}
          />
          {MAPS_LEAD_STATUSES.map((value) => (
            <FilterChip
              key={value}
              active={status === value}
              onClick={() => setStatus(value)}
              label={STATUS_LABELS[value]}
              count={counts[value]}
            />
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="filter-specialty">Giro guardado</Label>
            <select
              id="filter-specialty"
              className={selectClass}
              value={filterSpecialty}
              onChange={(event) => setFilterSpecialty(event.target.value)}
            >
              <option value="">Todos</option>
              {specialties.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="filter-city">Ciudad guardada</Label>
            <select
              id="filter-city"
              className={selectClass}
              value={filterCity}
              onChange={(event) => setFilterCity(event.target.value)}
            >
              <option value="">Todas</option>
              {cities.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Ordenados por prioridad: más reseñas y mejor calificación.
        </p>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-8 text-sm leading-6 text-muted-foreground">
            {!schemaReady
              ? "Cuando la migración esté aplicada, aquí aparecerán los prospectos."
              : leads.length === 0
                ? "Todavía no hay prospectos. Busca un giro y una ciudad."
                : "Ningún prospecto coincide con esos filtros."}
          </p>
        ) : (
          <ul className="space-y-4">
            {visible.map((lead) => (
              <li key={lead.id}>
                <LeadCard
                  lead={lead}
                  template={template}
                  onUpdated={replaceLead}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <form onSubmit={onSaveTemplate} className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Mensaje de WhatsApp
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Se arma uno por negocio. Puedes usar {TEMPLATE_TOKENS.join(", ")}.
                El botón de WhatsApp solo abre el chat; no envía nada.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="maps-template">Plantilla</Label>
              <Textarea
                id="maps-template"
                value={template}
                onChange={(event) => {
                  templateTouched.current = true;
                  setTemplate(event.target.value);
                }}
                rows={7}
                maxLength={1500}
                className="min-h-40"
                disabled={!schemaReady}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="submit"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={savingTemplate || !schemaReady}
              >
                {savingTemplate ? <Spinner /> : null}
                Guardar plantilla
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  templateTouched.current = true;
                  setTemplate(DEFAULT_WHATSAPP_TEMPLATE);
                }}
              >
                Restaurar texto de Torio Web
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
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
  template,
  onUpdated,
}: {
  lead: MapsLead;
  template: string;
  onUpdated: (lead: MapsLead) => void;
}) {
  const { toast } = useToast();
  const [notesDraft, setNotesDraft] = React.useState<string | null>(null);
  const [messageOverride, setMessageOverride] = React.useState<string | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [personalizing, setPersonalizing] = React.useState(false);
  const notes = notesDraft ?? lead.notes;
  const message =
    messageOverride ??
    renderLeadMessage(template, {
      name: lead.name,
      specialty: lead.specialty,
      city: lead.city,
      rating: lead.rating,
      userRatingCount: lead.user_rating_count,
    });

  async function onStatus(next: MapsLeadStatus) {
    const previous = lead;
    onUpdated({ ...lead, status: next });
    setBusy(true);
    try {
      const result = await updateMapsLead(lead.id, { status: next });
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
    if (notes === lead.notes) return;
    setBusy(true);
    try {
      const result = await updateMapsLead(lead.id, { notes });
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

  async function onPersonalize() {
    setPersonalizing(true);
    try {
      const result = await personalizeMapsLeadMessage({
        name: lead.name,
        specialty: lead.specialty,
        city: lead.city,
        rating: lead.rating,
        userRatingCount: lead.user_rating_count,
        address: lead.address,
        leadReason: lead.lead_reason,
        template,
        currentMessage: message,
      });
      if (!result.ok) {
        toast(result.message, "error");
        return;
      }
      setMessageOverride(result.text);
      toast("Mensaje personalizado. Revísalo antes de abrirlo en WhatsApp.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setPersonalizing(false);
    }
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast("Mensaje copiado.", "success");
    } catch {
      toast("No se pudo copiar. Selecciona el texto y cópialo a mano.", "error");
    }
  }

  function onOpenWhatsApp() {
    if (lead.status !== "nuevo") return;
    const previous = lead;
    onUpdated({ ...lead, status: "contactado" });
    void markMapsLeadContacted(lead.id).then((result) => {
      if (!result.ok || !result.lead) {
        onUpdated(previous);
        toast(result.message, "error");
        return;
      }
      onUpdated(result.lead);
    });
  }

  const href = lead.whatsapp_e164 ? whatsAppHref(lead.whatsapp_e164, message) : null;
  const phone = lead.phone_international || lead.phone_national;
  const savedOn = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeZone: "America/Mexico_City",
  }).format(new Date(lead.created_at));

  return (
    <Card>
      <CardContent className="space-y-3 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{lead.name}</h2>
              <Badge variant="secondary">{REASON_LABELS[lead.lead_reason]}</Badge>
              {lead.business_status === "CLOSED_TEMPORARILY" ? (
                <Badge variant="warning">Cerrado temporalmente</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {lead.specialty} · {lead.city}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {lead.rating == null
                ? "Sin calificación"
                : `${lead.rating.toFixed(1)} estrellas · ${lead.user_rating_count ?? 0} reseñas`}
              <span className="ml-2 font-medium text-primary">
                Prioridad {lead.priority_score}
              </span>
            </p>
          </div>
          <div className="w-full space-y-2 sm:w-44">
            <Label htmlFor={`status-${lead.id}`}>Estado</Label>
            <select
              id={`status-${lead.id}`}
              className={selectClass}
              aria-label={`Estado de ${lead.name}`}
              value={lead.status}
              disabled={busy}
              onChange={(event) => {
                const next = event.target.value;
                if (next !== lead.status && isMapsLeadStatus(next)) {
                  void onStatus(next);
                }
              }}
            >
              {MAPS_LEAD_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {lead.address ? (
          <p className="text-sm leading-6 text-muted-foreground">{lead.address}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {phone ? `Teléfono: ${phone}` : "Google no publicó teléfono."}
          {phone && !lead.whatsapp_e164
            ? " No se pudo armar el enlace de WhatsApp (el número no parece mexicano)."
            : null}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {lead.google_maps_uri ? (
            <a
              href={lead.google_maps_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Ver en Google Maps
            </a>
          ) : null}
          {lead.website_uri ? (
            <a
              href={lead.website_uri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Ver perfil
            </a>
          ) : null}
          <span className="text-muted-foreground">Guardado el {savedOn}</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`notes-${lead.id}`}>Notas</Label>
          <Textarea
            id={`notes-${lead.id}`}
            value={notes}
            onChange={(event) => setNotesDraft(event.target.value)}
            onBlur={() => {
              void onNotesBlur();
            }}
            rows={2}
            maxLength={4000}
            placeholder="Qué le dijiste, o por qué lo descartaste."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`message-${lead.id}`}>Mensaje</Label>
          <Textarea
            id={`message-${lead.id}`}
            value={message}
            onChange={(event) => setMessageOverride(event.target.value)}
            rows={5}
            className="min-h-28"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {href ? (
            <Button asChild className="w-full sm:w-auto">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onOpenWhatsApp}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Abrir WhatsApp
              </a>
            </Button>
          ) : (
            <Button type="button" className="w-full sm:w-auto" disabled>
              Sin teléfono para WhatsApp
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => void copyMessage()}
          >
            <Copy className="size-4" aria-hidden="true" />
            Copiar mensaje
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void onPersonalize()}
            disabled={personalizing}
          >
            {personalizing ? <Spinner /> : <Sparkles className="size-4" aria-hidden="true" />}
            Personalizar con IA
          </Button>
          {messageOverride !== null ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => setMessageOverride(null)}
            >
              Volver a la plantilla
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
