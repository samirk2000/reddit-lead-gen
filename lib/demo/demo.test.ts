import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dentistaDemo } from "@/lib/demo/dentista";
import { isPublicDemoPath } from "@/lib/demo/public-path";
import { getDemo, listDemoSlugs } from "@/lib/demo/registry";
import { sanitizeBusinessName } from "@/lib/demo/sanitize";
import { DEFAULT_PUBLIC_APP_URL, resolvePublicAppUrl } from "@/lib/demo/url";

describe("demo routes", () => {
  it("deja /demo fuera del login y no exenta otras rutas", () => {
    assert.equal(isPublicDemoPath("/demo"), true);
    assert.equal(isPublicDemoPath("/demo/dentista"), true);
    assert.equal(isPublicDemoPath("/demo/dentista/"), true);
    assert.equal(isPublicDemoPath("/dashboard"), false);
    assert.equal(isPublicDemoPath("/dashboard/maps"), false);
    assert.equal(isPublicDemoPath("/demographics"), false);
  });

  it("resuelve el ejemplo dental y sus secciones", () => {
    assert.deepEqual(listDemoSlugs(), ["dentista"]);
    const demo = getDemo("Dentista");
    assert.ok(demo);
    assert.equal(demo.clinicName, "Clínica Dental Sonrisa");
    assert.equal(demo.salesWhatsapp, "https://wa.me/5214428253951");
    assert.equal(demo.ctaLabel, "Agendar por WhatsApp");
    assert.deepEqual(
      demo.services.map((service) => service.name),
      ["Limpieza", "Blanqueamiento", "Implantes", "Ortodoncia", "Endodoncia"],
    );
    assert.equal(demo.posts[0]?.title, "¿Cuánto cuesta un blanqueamiento en Querétaro?");
    assert.equal(demo.reviews.length >= 3, true);
    assert.equal(getDemo("abogado"), null);
    assert.equal(dentistaDemo.slug, "dentista");
  });
});

describe("sanitizeBusinessName", () => {
  it("conserva un nombre de negocio y quita HTML", () => {
    assert.equal(
      sanitizeBusinessName("  ODONTOLOGIA FAMILIAR ESPECIALIZADA  "),
      "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
    );
    assert.equal(sanitizeBusinessName("Clínica Árbol"), "Clínica Árbol");
    assert.equal(sanitizeBusinessName("<script>alert(1)</script>Sonrisa"), "alert1Sonrisa");
    assert.equal(sanitizeBusinessName("a"), null);
    assert.equal(sanitizeBusinessName(12), null);
    assert.equal(sanitizeBusinessName("Nombre\ncon\tsalto"), "Nombre con salto");
  });
});

describe("resolvePublicAppUrl", () => {
  const previousApp = process.env.APP_URL;
  const previousPublic = process.env.NEXT_PUBLIC_APP_URL;

  it("usa el entorno, luego el host, luego producción", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://reddit-lead-gen.vercel.app/";
    delete process.env.APP_URL;
    assert.equal(resolvePublicAppUrl(), "https://reddit-lead-gen.vercel.app");

    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    assert.equal(
      resolvePublicAppUrl({
        get(name: string) {
          if (name === "host") return "localhost:3000";
          if (name === "x-forwarded-proto") return "http";
          return null;
        },
      }),
      "http://localhost:3000",
    );
    assert.equal(resolvePublicAppUrl({ get: () => null }), DEFAULT_PUBLIC_APP_URL);
    assert.equal(resolvePublicAppUrl({ get: () => "evil host" }), DEFAULT_PUBLIC_APP_URL);

    if (previousPublic === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousPublic;
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
  });
});
