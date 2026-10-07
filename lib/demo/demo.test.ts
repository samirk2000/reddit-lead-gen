import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_DEMOS_BASE_URL,
  demosBaseUrl,
  externalDemoUrl,
  isKnownDemoSlug,
} from "@/lib/demo/links";

describe("external demo urls", () => {
  const previous = process.env.NEXT_PUBLIC_DEMOS_BASE_URL;

  it("apunta la familia dental a torioweb.com y acepta otra base", () => {
    try {
      delete process.env.NEXT_PUBLIC_DEMOS_BASE_URL;
      assert.equal(demosBaseUrl(), DEFAULT_DEMOS_BASE_URL);
      assert.equal(isKnownDemoSlug("dentista"), true);
      assert.equal(isKnownDemoSlug("cocinas"), true);
      assert.equal(isKnownDemoSlug("abogado"), true);
      assert.equal(isKnownDemoSlug("clinica-estetica"), true);
      assert.equal(isKnownDemoSlug("constructora"), true);
      assert.equal(isKnownDemoSlug("salon-eventos"), true);
      assert.equal(isKnownDemoSlug("notaria"), false);
      assert.equal(
        externalDemoUrl("dentista", "ODONTOLOGIA FAMILIAR ESPECIALIZADA"),
        "https://torioweb.com/ejemplos/dentista/?nombre=ODONTOLOGIA%20FAMILIAR%20ESPECIALIZADA",
      );
      assert.equal(externalDemoUrl("dentista", "  "), "https://torioweb.com/ejemplos/dentista/");
      assert.equal(
        externalDemoUrl("cocinas", "Cocinas Integrales del Bajío"),
        "https://torioweb.com/ejemplos/cocinas/?nombre=Cocinas%20Integrales%20del%20Baj%C3%ADo",
      );
      assert.equal(
        externalDemoUrl("abogado", "Bufete García y Asociados"),
        "https://torioweb.com/ejemplos/abogado/?nombre=Bufete%20Garc%C3%ADa%20y%20Asociados",
      );
      assert.equal(
        externalDemoUrl("clinica-estetica", "Clínica Aura"),
        "https://torioweb.com/ejemplos/clinica-estetica/?nombre=Cl%C3%ADnica%20Aura",
      );
      assert.equal(
        externalDemoUrl("constructora", "Constructora Norte"),
        "https://torioweb.com/ejemplos/constructora/?nombre=Constructora%20Norte",
      );
      assert.equal(
        externalDemoUrl("salon-eventos", "Quinta Los Olivos"),
        "https://torioweb.com/ejemplos/salon-eventos/?nombre=Quinta%20Los%20Olivos",
      );
      assert.equal(externalDemoUrl("restaurante", "La Parrilla"), null);

      process.env.NEXT_PUBLIC_DEMOS_BASE_URL = "https://ejemplos.example/preview/";
      assert.equal(
        externalDemoUrl("dentista", "Clínica Sol"),
        "https://ejemplos.example/preview/dentista/?nombre=Cl%C3%ADnica%20Sol",
      );
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_DEMOS_BASE_URL;
      else process.env.NEXT_PUBLIC_DEMOS_BASE_URL = previous;
    }
  });
});
