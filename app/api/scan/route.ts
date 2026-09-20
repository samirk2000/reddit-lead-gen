import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  progressiveScan,
  type ScanEvent,
  type ScanMode,
} from "@/lib/pipeline/progressive-scan";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Progressive scan stream (NDJSON).
 *
 * POST /api/scan?mode=reddit|quora
 * Auth: Supabase session cookie.
 * Pause: client aborts the fetch → AbortSignal stops between items.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient(cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ type: "error", message: "No autorizado." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: ScanMode = modeParam === "quora" ? "quora" : "reddit";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ScanEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for await (const event of progressiveScan(
          user.id,
          mode,
          request.signal,
        )) {
          send(event);
          if (event.type === "done") break;
        }
      } catch (error) {
        if (request.signal.aborted) {
          send({
            type: "status",
            message: "Escaneo pausado por el usuario.",
          });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          send({ type: "error", message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
