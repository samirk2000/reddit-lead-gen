import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MapsError } from "@/lib/maps/errors";
import {
  chooseMarkTarget,
  last10Digits,
  leadMatchesPhone,
  markStatusDecision,
  parseMarkStatusBody,
  pickPhoneMatch,
  type MarkableLead,
} from "@/lib/maps/mark-status";

function lead(patch: Partial<MarkableLead> & Pick<MarkableLead, "id" | "place_id">): MarkableLead {
  return {
    status: "nuevo",
    whatsapp_e164: null,
    phone_national: null,
    phone_international: null,
    updated_at: "2026-10-01T00:00:00.000Z",
    ...patch,
  };
}

describe("parseMarkStatusBody", () => {
  it("acepta place_id o phone y traduce respondio", () => {
    assert.deepEqual(parseMarkStatusBody({ place_id: " ChIJ ", status: "contactado" }), {
      placeId: "ChIJ",
      phoneLast10: null,
      status: "contactado",
    });
    assert.deepEqual(
      parseMarkStatusBody({ phone: "+521 81 1111 2222", status: "respondio" }),
      { placeId: null, phoneLast10: "8111112222", status: "respondió" },
    );
    assert.equal(parseMarkStatusBody({ phone: "528111112222", status: "Respondió" }).status, "respondió");
    assert.equal(parseMarkStatusBody({ place_id: "abc", status: "descartado" }).status, "descartado");
  });

  it("rechaza estado inválido o sin identificador", () => {
    assert.throws(() => parseMarkStatusBody(null), MapsError);
    assert.throws(() => parseMarkStatusBody({ status: "contactado" }), (error: unknown) => {
      assert.ok(error instanceof MapsError);
      assert.equal(error.code, "BAD_QUERY");
      assert.match(error.message, /place_id o phone/);
      return true;
    });
    assert.throws(() => parseMarkStatusBody({ place_id: "abc", status: "cerrado" }), (error: unknown) => {
      assert.ok(error instanceof MapsError);
      assert.match(error.message, /contactado, respondio o descartado/);
      return true;
    });
    assert.throws(() => parseMarkStatusBody({ phone: "123", status: "contactado" }), (error: unknown) => {
      assert.ok(error instanceof MapsError);
      assert.match(error.message, /10 dígitos/);
      return true;
    });
    assert.throws(() => parseMarkStatusBody([]), MapsError);
  });
});

describe("phone match", () => {
  it("compara los últimos 10 dígitos de 52, 521 y el número local", () => {
    assert.equal(last10Digits("5218111112222"), "8111112222");
    assert.equal(last10Digits("+52 81 1111 2222"), "8111112222");
    assert.equal(last10Digits("81 1111 2222"), "8111112222");
    assert.equal(last10Digits("12345"), null);

    const row = lead({
      id: "1",
      place_id: "p1",
      whatsapp_e164: "528111112222",
      phone_national: "81 1111 2222",
    });
    assert.equal(leadMatchesPhone(row, "8111112222"), true);
    assert.equal(leadMatchesPhone(row, "8111112223"), false);

    const older = lead({
      id: "old",
      place_id: "old",
      whatsapp_e164: "528111112222",
      updated_at: "2026-09-01T00:00:00.000Z",
    });
    const newer = lead({
      id: "new",
      place_id: "new",
      phone_international: "+52 1 81 1111 2222",
      updated_at: "2026-10-02T00:00:00.000Z",
    });
    assert.equal(pickPhoneMatch([older, newer], "8111112222")?.id, "new");
    assert.equal(pickPhoneMatch([older], "0000000000"), null);
  });

  it("prefiere place_id y no baja un cerrado", () => {
    const byPlace = lead({ id: "place", place_id: "abc", status: "nuevo" });
    const byPhone = lead({
      id: "phone",
      place_id: "other",
      whatsapp_e164: "528111112222",
    });
    assert.equal(chooseMarkTarget(byPlace, [byPhone], "8111112222")?.id, "place");
    assert.equal(chooseMarkTarget(null, [byPhone], "8111112222")?.id, "phone");
    assert.equal(chooseMarkTarget(null, [byPhone], null), null);

    assert.deepEqual(markStatusDecision("cerrado", "contactado"), {
      unchanged: true,
      status: "cerrado",
    });
    assert.deepEqual(markStatusDecision("contactado", "contactado"), {
      unchanged: true,
      status: "contactado",
    });
    assert.deepEqual(markStatusDecision("enviado_a_lista", "descartado"), {
      unchanged: false,
      status: "descartado",
    });
    assert.deepEqual(markStatusDecision("nuevo", "respondió"), {
      unchanged: false,
      status: "respondió",
    });
  });
});
