import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRedditPostUrl, subredditRulesHref } from "./links";
import { bearerTokenMatches } from "./secret";
import { parseIngestBody, toIngestRow } from "./validate";

const validLead = {
  reddit_id: "abc123",
  url: "https://www.reddit.com/r/smallbusiness/comments/abc123/need_a_website/",
  title: "Need a simple website for my shop",
  subreddit: "r/smallbusiness",
  author: "example_user",
  created_utc: "2026-09-28T00:00:00.000Z",
  problema: "Quiere una landing para su negocio.",
  pais_detectado: "MX",
  idioma: "en-US",
  score_intencion: 0.86,
  intencion: "pide_landing",
  clasificador: "reglas",
  keywords: ["website", " landing "],
  borrador_es: "Hola, vi tu publicación.",
  borrador_en: "Hi, I saw your post.",
  estado: "descartado",
  notas: "no pisar",
};

describe("parseIngestBody", () => {
  it("acepta un lead del bot y no copia estado ni notas", () => {
    const parsed = parseIngestBody([validLead]);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.received, 1);
    assert.equal(parsed.deduped, 0);
    const lead = parsed.leads[0];
    assert.ok(lead);
    assert.equal(lead.subreddit, "smallbusiness");
    assert.equal(lead.idioma, "en-US");
    assert.deepEqual(lead.keywords, ["website", "landing"]);
    const row = toIngestRow("user-1", lead);
    assert.equal("estado" in row, false);
    assert.equal("notas" in row, false);
    assert.equal(row.user_id, "user-1");
    assert.equal(row.reddit_id, "abc123");
    assert.equal(row.borrador_es, "Hola, vi tu publicación.");
  });

  it("deduplica por reddit_id y se queda con el último", () => {
    const parsed = parseIngestBody([
      validLead,
      { ...validLead, title: "Segundo título" },
    ]);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.deduped, 1);
    assert.equal(parsed.leads.length, 1);
    assert.equal(parsed.leads[0]?.title, "Segundo título");
  });

  it("rechaza el lote completo si un elemento es inválido", () => {
    const parsed = parseIngestBody([
      validLead,
      { ...validLead, reddit_id: "otro1", url: "https://evil.example/phish" },
    ]);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.issues[0]?.field, "url");
    assert.equal(parsed.issues[0]?.index, 1);
  });

  it("exige un arreglo y corta en 100", () => {
    const objectBody = parseIngestBody({ leads: [validLead] });
    assert.equal(objectBody.ok, false);
    const tooMany = parseIngestBody(
      Array.from({ length: 101 }, (_, index) => ({
        ...validLead,
        reddit_id: `id${index}aa`,
      })),
    );
    assert.equal(tooMany.ok, false);
    if (tooMany.ok) return;
    assert.match(tooMany.error, /100/);
  });

  it("valida idioma, puntuación y campos opcionales vacíos", () => {
    const badIdioma = parseIngestBody([{ ...validLead, idioma: "es" }]);
    assert.equal(badIdioma.ok, false);

    const badScore = parseIngestBody([{ ...validLead, score_intencion: 1.2 }]);
    assert.equal(badScore.ok, false);

    const minimal = parseIngestBody([
      {
        reddit_id: "t3_abc123",
        url: "https://old.reddit.com/r/webdev/comments/abc123/title/",
        title: "Landing page",
        subreddit: "webdev",
        score_intencion: "0.5",
        idioma: "",
        keywords: null,
      },
    ]);
    assert.equal(minimal.ok, true);
    if (!minimal.ok) return;
    assert.equal(minimal.leads[0]?.reddit_id, "t3_abc123");
    assert.equal(minimal.leads[0]?.score_intencion, 0.5);
    assert.equal(minimal.leads[0]?.idioma, null);
    assert.equal(minimal.leads[0]?.author, null);
    assert.deepEqual(minimal.leads[0]?.keywords, []);
  });
});

describe("bearerTokenMatches", () => {
  it("solo acepta el bearer exacto", () => {
    assert.equal(bearerTokenMatches("Bearer secreto", "secreto"), true);
    assert.equal(bearerTokenMatches("Bearer otro", "secreto"), false);
    assert.equal(bearerTokenMatches(null, "secreto"), false);
    assert.equal(bearerTokenMatches("secreto", "secreto"), false);
    assert.equal(bearerTokenMatches("Bearer ", ""), false);
    assert.equal(bearerTokenMatches("Bearer secreto", ""), false);
  });
});

describe("reddit links", () => {
  it("acepta hosts de Reddit y arma el enlace de reglas", () => {
    assert.equal(
      isRedditPostUrl("https://www.reddit.com/r/webdev/comments/abc/title/"),
      true,
    );
    assert.equal(isRedditPostUrl("http://www.reddit.com/r/webdev/"), false);
    assert.equal(isRedditPostUrl("https://evil.example/reddit.com"), false);
    assert.equal(
      subredditRulesHref("webdev"),
      "https://www.reddit.com/r/webdev/about/rules",
    );
    assert.equal(subredditRulesHref("r/webdev"), null);
  });
});
