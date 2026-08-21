import { type NextRequest, NextResponse } from "next/server";
import { runLeadGenerationPipelineForAllActiveUsers } from "@/lib/pipeline/process-leads";

/**
 * Background trigger for the lead pipeline.
 *
 * Protected by a secret query token (`CRON_SECRET`). Intended to be called by
 * an external scheduler (e.g. Vercel Cron, GitHub Actions) as
 * `GET /api/cron?token=<CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no está configurado." },
      { status: 500 },
    );
  }

  const provided = request.nextUrl.searchParams.get("token");
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "No autorizado." },
      { status: 401 },
    );
  }

  try {
    const results = await runLeadGenerationPipelineForAllActiveUsers();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] runLeadGenerationPipelineForAllActiveUsers falló:", error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
