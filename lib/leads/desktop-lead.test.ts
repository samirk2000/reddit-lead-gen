import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalRedditUrl,
  parseDesktopLead,
  redditStableId,
} from "./desktop-lead";

const sample = {
  url: "https://old.reddit.com/r/firetvstick/comments/abc123/busco_iptv/?utm_source=test",
  subreddit: "r/firetvstick",
  title: "Busco IPTV para Firestick",
  body: "Se me cayó el servicio.",
  author: "ejemplo_mx",
  created_at: "2026-10-13T04:00:00Z",
  kind: "post",
  local_score: 8,
  keywords: ["busco iptv", " iptv firestick "],
};

describe("parseDesktopLead", () => {
  it("normaliza la url y se queda con el permalink", () => {
    const parsed = parseDesktopLead(sample);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(
      parsed.lead.url,
      "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv",
    );
    assert.equal(parsed.lead.subreddit, "firetvstick");
    assert.equal(parsed.lead.reddit_post_id, "t3_abc123");
    assert.equal(parsed.lead.local_score, 8);
    assert.deepEqual(parsed.lead.keywords, ["busco iptv", "iptv firestick"]);
    assert.equal(parsed.lead.kind, "post");
  });

  it("usa el id del comentario cuando el permalink lo trae", () => {
    const parsed = parseDesktopLead({
      ...sample,
      kind: "comment",
      url: "https://www.reddit.com/r/firetvstick/comments/abc123/busco_iptv/def456/",
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.lead.reddit_post_id, "t1_def456");
    assert.equal(parsed.lead.kind, "comment");
  });

  it("rechaza arreglos, el formato viejo y urls que no son permalink", () => {
    const batch = parseDesktopLead([sample]);
    assert.equal(batch.ok, false);

    const legacy = parseDesktopLead({ ...sample, reddit_id: "abc123", borrador_es: "hola" });
    assert.equal(legacy.ok, false);
    if (legacy.ok) return;
    assert.match(legacy.error, /reddit-web\/ingest/);

    const home = parseDesktopLead({ ...sample, url: "https://www.reddit.com/r/firetvstick/" });
    assert.equal(home.ok, false);
  });

  it("deduplica la misma url con o sin www, query y barra final", () => {
    const a = canonicalRedditUrl(
      "https://www.reddit.com/r/AndroidTV/comments/xyz999/titulo/?foo=1",
    );
    const b = canonicalRedditUrl(
      "https://reddit.com/r/AndroidTV/comments/xyz999/titulo/",
    );
    assert.equal(a, b);
    assert.ok(a);
    assert.equal(redditStableId(a), "t3_xyz999");
  });
});
