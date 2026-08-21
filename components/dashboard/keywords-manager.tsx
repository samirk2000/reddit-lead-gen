"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  Trash2,
  Pause,
  Play,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  addKeyword,
  deleteKeyword,
  toggleKeyword,
  type KeywordActionResult,
} from "@/app/actions/keywords";

const EMPTY_STATE: KeywordActionResult = { ok: false, message: "" };

function AddKeywordForm() {
  const [state, formAction] = useFormState(addKeyword, EMPTY_STATE);
  const { toast } = useToast();
  const shownRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (state.message && shownRef.current !== state.message) {
      shownRef.current = state.message;
      toast(state.message, state.ok ? "success" : "error");
    }
  }, [state, toast]);

  return (
    <div>
      <form action={formAction} className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="phrase">Frases / keyword</Label>
          <Input
            id="phrase"
            name="phrase"
            type="text"
            required
            placeholder="p.ej. automatizar prospección"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subreddit">Subreddit</Label>
          <Input
            id="subreddit"
            name="subreddit"
            type="text"
            placeholder="all"
          />
        </div>
        <SubmitAddButton />
      </form>
    </div>
  );
}

function SubmitAddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Spinner />}
      {pending ? "Agregando…" : "Agregar keyword"}
    </Button>
  );
}

type KeywordItem = {
  id: string;
  phrase: string;
  subreddit: string;
  is_active: boolean;
};

export function KeywordsManager({ keywords }: { keywords: KeywordItem[] }) {
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function run(
    id: string,
    op: (id: string) => Promise<void>,
    successMsg: string,
  ) {
    setBusyId(id);
    try {
      await op(id);
      toast(successMsg, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(message, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardContent className="pt-6">
          <AddKeywordForm />
          <p className="mt-2 text-xs text-muted-foreground">
            El subreddit por defecto es <span className="font-mono">all</span>{" "}
            (reddit completo). Indica uno específico, p.ej.{" "}
            <span className="font-mono">marketing</span>, para limitar la
            búsqueda.
          </p>
        </CardContent>
      </Card>

      {keywords.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no tienes keywords. Agrega tu primera keyword para empezar a
          detectar leads.
        </p>
      ) : (
        <ul className="space-y-3">
          {keywords.map((keyword) => {
            const busy = busyId === keyword.id;
            return (
              <li key={keyword.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {keyword.phrase}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">r/{keyword.subreddit}</Badge>
                        <Badge variant={keyword.is_active ? "success" : "muted"}>
                          {keyword.is_active ? "Activa" : "Pausada"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            keyword.id,
                            (id) => toggleKeyword(id, !keyword.is_active),
                            keyword.is_active
                              ? "Keyword pausada."
                              : "Keyword activada.",
                          )
                        }
                      >
                        {busy ? <Spinner /> : keyword.is_active ? <Pause className="size-4" /> : <Play className="size-4" />}
                        {keyword.is_active ? "Pausar" : "Activar"}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(
                            keyword.id,
                            (id) => deleteKeyword(id),
                            "Keyword eliminada.",
                          )
                        }
                      >
                        {busy ? <Spinner /> : <Trash2 className="size-4" />}
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
