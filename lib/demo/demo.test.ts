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
      assert.equal(isKnownDemoSlug("abogado"), false);
      assert.equal(
        externalDemoUrl("dentista", "ODONTOLOGIA FAMILIAR ESPECIALIZADA"),
        "https://torioweb.com/ejemplos/dentista/?nombre=ODONTOLOGIA%20FAMILIAR%20ESPECIALIZADA",
      );
      assert.equal(externalDemoUrl("dentista", "  "), "https://torioweb.com/ejemplos/dentista/");
      assert.equal(externalDemoUrl("abogado", "Despacho"), null);

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
