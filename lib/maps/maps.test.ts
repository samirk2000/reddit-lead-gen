import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalCityQuery,
  extractMexicanCity,
  resolveBusinessCity,
} from "@/lib/maps/cities";
import { PLACES_FIELD_MASK, searchPlaces } from "@/lib/maps/places";
import { leadDraftToInsert } from "@/lib/maps/persist";
import {
  bestMexicanPhone,
  classifyMexicanPhone,
  normalizeMexicanWhatsApp,
} from "@/lib/maps/phone";
import { scoreProspect } from "@/lib/maps/score";
import { renderLeadMessage, whatsAppHref } from "@/lib/maps/message";
import {
  buildLeadDrafts,
  isSocialWebsite,
  priorityScore,
  qualifyWebsite,
} from "@/lib/maps/qualify";
import type { MapsLeadDraft } from "@/lib/maps/types";

describe("normalizeMexicanWhatsApp", () => {
  it("agrega la lada 52 a un número local de 10 dígitos", () => {
    assert.equal(normalizeMexicanWhatsApp("442 123 4567"), "524421234567");
  });

  it("acepta un número que ya viene con +52", () => {
    assert.equal(normalizeMexicanWhatsApp("+52 442 123 4567"), "524421234567");
  });

  it("quita el 1 legado de WhatsApp (521 + 10)", () => {
    assert.equal(normalizeMexicanWhatsApp("5214421234567"), "524421234567");
  });

  it("quita prefijos viejos 044, 045 y 01", () => {
    assert.equal(normalizeMexicanWhatsApp("0444421234567"), "524421234567");
    assert.equal(normalizeMexicanWhatsApp("0454421234567"), "524421234567");
    assert.equal(normalizeMexicanWhatsApp("014421234567"), "524421234567");
  });

  it("marca móvil solo cuando el número trae 521, 044 o 045", () => {
    assert.equal(classifyMexicanPhone("5214421234567").kind, "mobile");
    assert.equal(classifyMexicanPhone("+52 1 81 1234 5678").kind, "mobile");
    assert.equal(classifyMexicanPhone("0444421234567").kind, "mobile");
    assert.equal(classifyMexicanPhone("442 123 4567").kind, "possible");
    assert.equal(classifyMexicanPhone("+52 81 1234 5678").e164, "528112345678");
    assert.deepEqual(bestMexicanPhone("+52 81 0000 0000", "044 81 0000 0000"), {
      e164: "528100000000",
      kind: "mobile",
    });
  });

  it("rechaza vacío y números que no son de México", () => {
    assert.equal(normalizeMexicanWhatsApp(""), null);
    assert.equal(normalizeMexicanWhatsApp(null), null);
    assert.equal(normalizeMexicanWhatsApp("+1 415 555 2671"), null);
    assert.equal(normalizeMexicanWhatsApp("12345"), null);
  });
});

describe("qualifyWebsite", () => {
  it("trata redes y link-in-bio como prospecto", () => {
    assert.equal(isSocialWebsite("https://www.facebook.com/clinica"), true);
    assert.equal(isSocialWebsite("https://instagram.com/clinica"), true);
    assert.equal(isSocialWebsite("https://linktr.ee/clinica"), true);
    assert.equal(isSocialWebsite("https://wa.me/524421234567"), true);
    assert.equal(isSocialWebsite("https://www.tiktok.com/@clinica"), true);
    assert.deepEqual(qualifyWebsite("https://m.facebook.com/clinica"), {
      lead: true,
      reason: "solo_red_social",
    });
  });

  it("descarta un sitio propio y acepta la falta de sitio", () => {
    assert.deepEqual(qualifyWebsite("https://clinica-dental.mx"), { lead: false });
    assert.deepEqual(qualifyWebsite(""), { lead: true, reason: "sin_sitio" });
    assert.deepEqual(qualifyWebsite(null), { lead: true, reason: "sin_sitio" });
  });
});

describe("buildLeadDrafts", () => {
  it("omite cerrados permanentes, sitios reales y duplicados", () => {
    const { drafts, stats } = buildLeadDrafts(
      [
        {
          id: "cerrado",
          displayName: { text: "Cerrado" },
          businessStatus: "CLOSED_PERMANENTLY",
          rating: 5,
          userRatingCount: 400,
        },
        {
          id: "con-web",
          displayName: { text: "Con web" },
          websiteUri: "https://clinica.mx",
          rating: 4.9,
          userRatingCount: 300,
        },
        {
          id: "social",
          displayName: { text: "Instagram" },
          websiteUri: "https://instagram.com/demo",
          internationalPhoneNumber: "+52 442 123 4567",
          rating: 4.8,
          userRatingCount: 80,
          businessStatus: "OPERATIONAL",
        },
        {
          id: "social",
          displayName: { text: "Instagram duplicado" },
        },
        {
          name: "places/sin-id-directo",
          displayName: { text: "Pocas reseñas" },
          nationalPhoneNumber: "442 000 1122",
          rating: 5,
          userRatingCount: 2,
        },
      ],
      "dentista",
      "Querétaro",
    );

    assert.equal(stats.skippedClosed, 1);
    assert.equal(stats.withWebsite, 1);
    assert.equal(stats.duplicates, 1);
    assert.equal(stats.leads, 2);
    assert.equal(drafts[0]?.placeId, "social");
    assert.equal(drafts[0]?.whatsappE164, "524421234567");
    assert.equal(drafts[0]?.leadReason, "solo_red_social");
    assert.equal(drafts[1]?.placeId, "sin-id-directo");
    assert.equal(drafts[1]?.leadReason, "sin_sitio");
    assert.ok((drafts[0]?.priorityScore ?? 0) > (drafts[1]?.priorityScore ?? 0));
  });

  it("guarda la ciudad de la dirección, no la del estado buscado", () => {
    const { drafts } = buildLeadDrafts(
      [
        {
          id: "mty",
          displayName: { text: "Dental Norte" },
          formattedAddress: "Av. Constitución 100, Centro, Monterrey, N.L., 64000, México",
          internationalPhoneNumber: "+52 1 81 1234 5678",
          rating: 4.8,
          userRatingCount: 40,
          businessStatus: "OPERATIONAL",
        },
      ],
      "dentista",
      "Jalisco",
    );
    assert.equal(drafts[0]?.city, "Monterrey");
    assert.equal(drafts[0]?.whatsappE164, "528112345678");
  });

  it("puntúa 100 con 5 estrellas y unas 1000 reseñas", () => {
    assert.equal(priorityScore(5, 1000), 100);
    assert.equal(priorityScore(null, 10), 0);
    assert.ok(priorityScore(5, 2) < priorityScore(4.7, 200));
  });
});

describe("messages", () => {
  it("rellena la plantilla y arma wa.me", () => {
    const text = renderLeadMessage(
      "Hola {{nombre}} ({{calificacion}}, {{reseñas}}) en {{ ciudad }}",
      {
        name: "Clínica Árbol",
        specialty: "dentista",
        city: "Querétaro",
        rating: 4.8,
        userRatingCount: 12,
      },
    );
    assert.equal(text, "Hola Clínica Árbol (4.8, 12) en Querétaro");
    const href = whatsAppHref("524421234567", "Hola\nmundo");
    assert.equal(
      href,
      "https://wa.me/524421234567?text=Hola%0Amundo",
    );
  });
});

describe("leadDraftToInsert", () => {
  it("no incluye status ni notes", () => {
    const draft: MapsLeadDraft = {
      placeId: "abc",
      name: "Clínica",
      address: null,
      phoneNational: null,
      phoneInternational: null,
      whatsappE164: null,
      rating: 4,
      userRatingCount: 10,
      websiteUri: null,
      googleMapsUri: null,
      businessStatus: "OPERATIONAL",
      specialty: "dentista",
      city: "León",
      leadReason: "sin_sitio",
      priorityScore: 20,
    };
    const row = leadDraftToInsert("user-1", draft, "2026-09-25T00:00:00.000Z");
    assert.equal("status" in row, false);
    assert.equal("notes" in row, false);
    assert.equal(row.user_id, "user-1");
    assert.equal(row.place_id, "abc");
    assert.equal(row.last_seen_at, "2026-09-25T00:00:00.000Z");
  });
});

describe("prospect score", () => {
  const base = {
    specialty: "dentista",
    leadReason: "sin_sitio" as const,
    rating: 4.8,
    reviewCount: 40,
    phoneKind: "possible" as const,
    businessStatus: "OPERATIONAL",
  };

  it("prioriza giro, sitio propio, móvil y operación, y hunde a quien no tiene teléfono", () => {
    const dentist = scoreProspect(base);
    const restaurant = scoreProspect({ ...base, specialty: "restaurante" });
    const social = scoreProspect({ ...base, leadReason: "solo_red_social" });
    const mobile = scoreProspect({ ...base, phoneKind: "mobile" });
    const closed = scoreProspect({ ...base, businessStatus: "CLOSED_TEMPORARILY" });
    const noPhone = scoreProspect({
      specialty: "dentista",
      leadReason: "sin_sitio",
      rating: 5,
      reviewCount: 500,
      phoneKind: "none",
      businessStatus: "OPERATIONAL",
    });
    const barber = scoreProspect({
      specialty: "barbería",
      leadReason: "sin_sitio",
      rating: 4.6,
      reviewCount: 40,
      phoneKind: "possible",
      businessStatus: "OPERATIONAL",
    });

    assert.ok(dentist.score > restaurant.score);
    assert.ok(dentist.score > social.score);
    assert.ok(mobile.score > dentist.score);
    assert.ok(dentist.score > closed.score);
    assert.ok(barber.score > noPhone.score);
    assert.match(dentist.reason, /Alto valor/);
    assert.match(dentist.reason, /sin sitio web/);
    assert.match(dentist.reason, /teléfono para WhatsApp/);
    assert.match(dentist.reason, /4\.8 y 40 reseñas/);
    assert.match(dentist.reason, /en operación/);
    assert.match(restaurant.reason, /Bajo valor/);
    assert.match(noPhone.reason, /sin teléfono/);
    assert.match(
      scoreProspect({ ...base, rating: 5, reviewCount: 2 }).reason,
      /poca actividad en reseñas/,
    );
  });
});

describe("mexican city", () => {
  it("lee la ciudad real y canoniza alias", () => {
    assert.equal(
      extractMexicanCity("Av. Constitución 100, Centro, Monterrey, N.L., 64000, México"),
      "Monterrey",
    );
    assert.equal(
      extractMexicanCity(
        "Av. Vasconcelos 100, Centro, 76000 Santiago de Querétaro, Qro., México",
      ),
      "Querétaro",
    );
    assert.equal(
      extractMexicanCity(
        "Insurgentes 1, Roma Norte, Cuauhtémoc, Ciudad de México, CDMX, 06700, México",
      ),
      "Ciudad de México",
    );
    assert.equal(
      extractMexicanCity("Calle 1, Col. Hidalgo, Tepatitlán, Jalisco, 47600, México"),
      "Tepatitlán",
    );
    assert.equal(
      extractMexicanCity("Av. Juárez 10, Centro, Chihuahua, Chih., 31000, México"),
      "Chihuahua",
    );
    assert.equal(resolveBusinessCity(null, "León"), "León");
    assert.equal(resolveBusinessCity("   ", ""), "");
    assert.equal(canonicalCityQuery("cdmx"), "Ciudad de México");
    assert.equal(canonicalCityQuery("Querétaro"), "Querétaro");
  });
});

describe("searchPlaces", () => {
  it("pide la máscara corta y se detiene a las 3 páginas", async () => {
    const bodies = [
      { places: [{ id: "a" }], nextPageToken: "t1" },
      { places: [{ id: "b" }], nextPageToken: "t2" },
      { places: [{ id: "c" }], nextPageToken: "todavia-hay" },
    ];
    let index = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.match(String(input), /places:searchText/);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("X-Goog-FieldMask"), PLACES_FIELD_MASK);
      assert.equal(PLACES_FIELD_MASK.includes("places.reviews"), false);
      assert.equal(headers.get("X-Goog-Api-Key"), "secret-key");
      const current = bodies[index];
      index += 1;
      assert.ok(current);
      const sent = JSON.parse(String(init?.body)) as { pageToken?: string };
      if (index === 1) assert.equal(sent.pageToken, undefined);
      if (index === 2) assert.equal(sent.pageToken, "t1");
      if (index === 3) assert.equal(sent.pageToken, "t2");
      return new Response(JSON.stringify(current), { status: 200 });
    };

    const result = await searchPlaces("dentista en León", "secret-key", fetchImpl);
    assert.equal(result.pages, 3);
    assert.deepEqual(
      result.places.map((place) => place.id),
      ["a", "b", "c"],
    );
  });

  it("se detiene en una página cuando el digest lo pide", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ places: [{ id: "a" }], nextPageToken: "more" }),
        { status: 200 },
      );
    };
    const result = await searchPlaces("dentista en León", "secret-key", fetchImpl, {
      maxPages: 1,
    });
    assert.equal(calls, 1);
    assert.equal(result.pages, 1);
  });

  it("no filtra la clave de API en el error", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({ error: { message: "API key super-secret-key rejected" } }),
        { status: 403 },
      );

    await assert.rejects(
      () => searchPlaces("dentista en León", "super-secret-key", fetchImpl),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("super-secret-key"), false);
        assert.match(error.message, /No se pudo consultar Google Places/);
        return true;
      },
    );
  });
});
