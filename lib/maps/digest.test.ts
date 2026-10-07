import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIGEST_DEFAULT_COUNT,
  DIGEST_PLACES_REQUEST_CAP,
  acceptDigestDraft,
  collectDigestDrafts,
  digestBusinessFromDraft,
  digestQueries,
  parseDigestRequest,
} from "@/lib/maps/digest";
import { buildLeadDrafts } from "@/lib/maps/qualify";
import type { MapsLeadDraft } from "@/lib/maps/types";

describe("daily list plan", () => {
  it("cambia de ventana cada día y respeta ciudad y giros", () => {
    assert.equal(DIGEST_PLACES_REQUEST_CAP <= 10, true);
    assert.equal(DIGEST_PLACES_REQUEST_CAP, 8);
    const day1 = digestQueries({ date: "2026-10-07", limit: 8 });
    const day2 = digestQueries({ date: "2026-10-08", limit: 8 });
    assert.equal(day1.length, 8);
    assert.equal(day2.length, 8);
    assert.notDeepEqual(day1, day2);

    const monterrey = digestQueries({
      date: "2026-10-07",
      city: "Monterrey",
      limit: 8,
    });
    assert.ok(monterrey.every((query) => query.city === "Monterrey"));
    assert.equal(new Set(monterrey.map((query) => query.specialty)).size, 8);

    assert.deepEqual(
      digestQueries({
        date: "2026-10-07",
        city: "León",
        giros: ["abogado"],
        limit: 8,
      }),
      [{ specialty: "abogado", city: "León" }],
    );
  });

  it("lee count, city y giros", () => {
    assert.equal(parseDigestRequest(new URLSearchParams()).count, DIGEST_DEFAULT_COUNT);
    assert.equal(parseDigestRequest(new URLSearchParams("city=CDMX")).city, "Ciudad de México");
    assert.deepEqual(parseDigestRequest(new URLSearchParams("giros=dentista, abogado")).giros, [
      "dentista",
      "abogado",
    ]);
    assert.throws(() => parseDigestRequest(new URLSearchParams("count=0")));
    assert.throws(() => parseDigestRequest(new URLSearchParams("count=41")));
    assert.throws(() => parseDigestRequest(new URLSearchParams("count=muchos")));
  });
});

describe("daily list selection", () => {
  it("se queda con quien tiene WhatsApp y no repite place_id", async () => {
    let calls = 0;
    const places = [
      {
        id: "ya",
        displayName: { text: "Ya visto" },
        internationalPhoneNumber: "+52 81 0000 0000",
      },
      { id: "sin-tel", displayName: { text: "Sin teléfono" } },
      {
        id: "web",
        displayName: { text: "Con sitio" },
        websiteUri: "https://web.mx",
        internationalPhoneNumber: "+52 81 0000 0001",
      },
      {
        id: "ok",
        displayName: { text: "Dental Norte" },
        internationalPhoneNumber: "+52 81 1111 2222",
        rating: 4.8,
        userRatingCount: 30,
        businessStatus: "OPERATIONAL",
        formattedAddress: "Calle 1, Centro, Monterrey, N.L., 64000, México",
      },
      {
        id: "pausa",
        displayName: { text: "Pausa" },
        internationalPhoneNumber: "+52 81 1111 3333",
        businessStatus: "CLOSED_TEMPORARILY",
      },
    ];
    const { drafts, placesRequests } = await collectDigestDrafts({
      queries: [
        { specialty: "dentista", city: "Monterrey" },
        { specialty: "abogado", city: "Monterrey" },
      ],
      excludedPlaceIds: new Set(["ya"]),
      maxRequests: DIGEST_PLACES_REQUEST_CAP,
      targetCount: 5,
      search: async () => {
        calls += 1;
        return { pages: 1, places };
      },
    });

    assert.equal(calls, 2);
    assert.equal(placesRequests, 2);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.placeId, "ok");
    assert.equal(drafts[0]?.city, "Monterrey");

    const item = digestBusinessFromDraft(drafts[0] as MapsLeadDraft);
    assert.ok(item);
    assert.equal(item.giro, "dentista");
    assert.equal(item.city, "Monterrey");
    assert.equal(item.phone, "528111112222");
    assert.match(item.apertura, /dentista en Monterrey/);
    assert.equal(item.apertura.includes("Querétaro"), false);
    assert.match(item.wa_link, /^https:\/\/wa\.me\/528111112222\?text=/);
    assert.match(item.maps_url, /google\.com\/maps/);
  });

  it("no sigue pidiendo Places cuando ya llenó la lista", async () => {
    let calls = 0;
    const { drafts, placesRequests } = await collectDigestDrafts({
      queries: [
        { specialty: "dentista", city: "León" },
        { specialty: "abogado", city: "Puebla" },
      ],
      excludedPlaceIds: new Set(),
      maxRequests: 8,
      targetCount: 1,
      search: async (textQuery) => {
        calls += 1;
        return {
          pages: 1,
          places: [
            {
              id: textQuery,
              displayName: { text: "Listo" },
              nationalPhoneNumber: "477 000 1122",
              rating: 4.5,
              userRatingCount: 20,
              businessStatus: "OPERATIONAL",
            },
          ],
        };
      },
    });
    assert.equal(calls, 1);
    assert.equal(placesRequests, 1);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.city, "León");
  });

  it("rechaza sin teléfono, cerrado temporal y ya excluido", () => {
    const { drafts } = buildLeadDrafts(
      [
        {
          id: "a",
          displayName: { text: "A" },
          nationalPhoneNumber: "442 000 1122",
        },
      ],
      "dentista",
      "Querétaro",
    );
    const draft = drafts[0];
    assert.ok(draft);
    assert.equal(acceptDigestDraft(draft, new Set()), true);
    assert.equal(acceptDigestDraft(draft, new Set(["a"])), false);
    assert.equal(
      acceptDigestDraft({ ...draft, whatsappE164: null }, new Set()),
      false,
    );
    assert.equal(
      acceptDigestDraft({ ...draft, businessStatus: "CLOSED_TEMPORARILY" }, new Set()),
      false,
    );
  });
});
