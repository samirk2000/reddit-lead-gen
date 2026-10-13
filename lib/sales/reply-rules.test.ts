import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enforceSellerReply, mentionsRokuAudioLimit } from "./reply-rules";

describe("enforceSellerReply", () => {
  it("agrega vendedor, código, WhatsApp y dispositivos si faltan", () => {
    const text = enforceSellerReply("Hola, vi tu post de IPTV.", "Swiftya Latino");
    assert.match(text, /yo vendo este servicio/);
    assert.match(text, /no soy un cliente/);
    assert.match(text, /REDDIT15/);
    assert.match(text, /10%/);
    assert.match(text, /\+52 1 662 268 4690/);
    assert.match(text, /Android/);
    assert.match(text, /Firestick/);
    assert.match(text, /Google TV/);
  });

  it("quita las limitaciones de audio de Roku y no las vuelve a poner", () => {
    const text = enforceSellerReply(
      "En Roku el audio no se escucha. Yo vendo este servicio (Swiftya Latino), no soy un cliente que ya lo usa. Android, Firestick y Google TV. Código REDDIT15 con 10% de descuento. WhatsApp: +52 1 662 268 4690.",
    );
    assert.equal(mentionsRokuAudioLimit(text), false);
    assert.doesNotMatch(text, /audio/i);
    assert.match(text, /REDDIT15/);
  });

  it("no duplica los datos si el modelo ya los puso", () => {
    const ready =
      "Yo vendo este servicio (Swiftya Latino), no soy un cliente que ya lo usa. Sirve en Android, Android TV, Firestick y Google TV. Con el código REDDIT15 tienes 10% de descuento. WhatsApp: +52 1 662 268 4690.";
    const text = enforceSellerReply(ready);
    assert.equal(text.match(/REDDIT15/g)?.length, 1);
    assert.equal(text.match(/662 268 4690/g)?.length, 1);
  });
});
