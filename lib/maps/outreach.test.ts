import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_OUTREACH_PRICE, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/maps/constants";
import { buildDefaultLeadMessage, renderLeadMessage, type MessageLead } from "@/lib/maps/message";
import { buildPersonalizePrompt } from "@/lib/maps/personalize-prompt";
import { knownSectorKeys, resolveSector } from "@/lib/maps/sectors";

const OLD_TEMPLATE = `Hola, le escribo de Torio Web. Estuve viendo {{nombre}} en Google ({{calificacion}} estrellas, {{reseñas}} reseñas) en {{ciudad}} y no encontré un sitio web del consultorio.

Hacemos landing pages para {{especialidad}}, alrededor de $8,000 MXN, para que los pacientes lo encuentren y puedan escribir por WhatsApp. ¿Le gustaría ver un ejemplo?`;

function lead(partial: Partial<MessageLead> & Pick<MessageLead, "name" | "specialty" | "city">): MessageLead {
  return {
    rating: 4.8,
    userRatingCount: 40,
    ...partial,
  };
}

describe("default outreach message", () => {
  it("cabe en el límite de la plantilla guardada", () => {
    assert.ok(DEFAULT_WHATSAPP_TEMPLATE.length >= 10);
    assert.ok(DEFAULT_WHATSAPP_TEMPLATE.length <= 1500);
    assert.match(DEFAULT_WHATSAPP_TEMPLATE, /Desde \$8,000 MXN/);
    assert.equal(DEFAULT_OUTREACH_PRICE, "Desde $8,000 MXN");
  });

  it("arma el texto de un dentista con reputación", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
        specialty: "dentista",
        city: "Querétaro",
        rating: 4.9,
        userRatingCount: 157,
      }),
    );
    assert.equal(
      text,
      [
        'Hola, le escribo de Torio Web. Vi ODONTOLOGIA FAMILIAR ESPECIALIZADA en Google Maps: 4.9 estrellas con 157 reseñas, ¡muy buena reputación! Pero noté que no tiene sitio web, y muchos pacientes buscan "dentista en Querétaro" en Google antes de agendar.',
        "",
        'Le podemos hacer una página profesional donde muestre sus servicios, fotos de su consultorio y trabajos, reseñas de pacientes y un botón directo a WhatsApp para agendar. La dejamos optimizada para que Google la encuentre, y si le interesa, también escribimos artículos para su blog (por ejemplo, "¿Cuánto cuesta un blanqueamiento en Querétaro?") para que aparezca en más búsquedas de la zona.',
        "",
        "Desde $8,000 MXN. ¿Le mando un ejemplo de cómo quedaría?",
      ].join("\n"),
    );
  });

  it("arma el texto de un abogado", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Despacho Ramírez",
        specialty: "abogado",
        city: "Guadalajara",
        rating: 4.7,
        userRatingCount: 86,
      }),
    );
    assert.match(text, /Vi Despacho Ramírez en Google Maps: 4\.7 estrellas con 86 reseñas/);
    assert.match(text, /muchos clientes buscan "abogado en Guadalajara" en Google antes de consultar/);
    assert.match(text, /fotos de su despacho y trabajos, reseñas de clientes/);
    assert.match(text, /botón directo a WhatsApp para consultar/);
    assert.match(text, /¿Cuánto cobra un abogado por un divorcio en Guadalajara\?/);
    assert.match(text, /Desde \$8,000 MXN/);
    assert.equal(text.includes("pacientes"), false);
    assert.equal(text.includes("ranking"), false);
    assert.equal(text.includes("primera página"), false);
  });

  it("arma el texto de un restaurante", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "La Parrilla del Centro",
        specialty: "restaurante",
        city: "Monterrey",
        rating: 4.6,
        userRatingCount: 320,
      }),
    );
    assert.match(
      text,
      /muchos comensales buscan "restaurante en Monterrey" en Google antes de reservar/,
    );
    assert.match(text, /fotos de su local y trabajos, reseñas de comensales/);
    assert.match(text, /WhatsApp para reservar/);
    assert.match(text, /¿Dónde comer en familia en Monterrey\?/);
  });

  it("usa un fallback genérico y concuerda un/una", () => {
    const florist = buildDefaultLeadMessage(
      lead({
        name: "Florería Luna",
        specialty: "florería",
        city: "Puebla",
        rating: 4.8,
        userRatingCount: 41,
      }),
    );
    assert.match(
      florist,
      /muchos clientes buscan "florería en Puebla" en Google antes de contactar/,
    );
    assert.match(florist, /fotos de su negocio y trabajos, reseñas de clientes/);
    assert.match(florist, /WhatsApp para contactar/);
    assert.match(
      florist,
      /5 cosas que debe saber antes de contratar una florería en Puebla/,
    );

    const locksmith = buildDefaultLeadMessage(
      lead({
        name: "Cerrajero López",
        specialty: "cerrajero",
        city: "León",
        rating: 4.5,
        userRatingCount: 12,
      }),
    );
    assert.match(
      locksmith,
      /5 cosas que debe saber antes de contratar un cerrajero en León/,
    );
    assert.match(locksmith, /buscan "cerrajero en León"/);
  });

  it("no pisa una plantilla ya guardada", () => {
    const text = renderLeadMessage(
      OLD_TEMPLATE,
      lead({
        name: "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
        specialty: "dentista",
        city: "Querétaro",
        rating: 4.9,
        userRatingCount: 157,
      }),
    );
    assert.match(text, /Estuve viendo ODONTOLOGIA FAMILIAR ESPECIALIZADA en Google \(4\.9 estrellas, 157 reseñas\)/);
    assert.match(text, /alrededor de \$8,000 MXN/);
    assert.equal(text.includes("blanqueamiento"), false);
    assert.equal(text.includes("ejemplo_blog"), false);
  });
});

describe("reputation clause", () => {
  const base = lead({
    name: "Clínica Árbol",
    specialty: "dentista",
    city: "Querétaro",
  });

  it("omite estrellas y reseñas cuando faltan", () => {
    const text = buildDefaultLeadMessage({
      ...base,
      rating: null,
      userRatingCount: null,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps\. Pero noté/);
    assert.equal(text.includes("undefined"), false);
    assert.equal(text.includes("estrellas"), false);
    assert.equal(/\d+\s+reseñas/.test(text), false);
    assert.equal(text.includes("s/d"), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("deja solo las reseñas si no hay calificación", () => {
    const text = buildDefaultLeadMessage({
      ...base,
      rating: null,
      userRatingCount: 12,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps, con 12 reseñas\. Pero noté/);
    assert.equal(text.includes("estrellas"), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("deja solo las estrellas si no hay reseñas", () => {
    const text = buildDefaultLeadMessage({
      ...base,
      rating: 4.9,
      userRatingCount: null,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps: 4\.9 estrellas\. Pero noté/);
    assert.equal(/\d+\s+reseña/.test(text), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("no llama buena reputación a una calificación baja", () => {
    const text = buildDefaultLeadMessage({
      ...base,
      rating: 3.2,
      userRatingCount: 40,
    });
    assert.match(text, /3\.2 estrellas con 40 reseñas\. Pero noté/);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("usa el singular con una reseña", () => {
    const text = buildDefaultLeadMessage({
      ...base,
      rating: 4,
      userRatingCount: 1,
    });
    assert.match(text, /4\.0 estrellas con 1 reseña, ¡muy buena reputación!/);
  });

  it("conserva s/d y 0 en los tokens viejos", () => {
    const text = renderLeadMessage("{{calificacion}}/{{reseñas}}", {
      ...base,
      rating: null,
      userRatingCount: null,
    });
    assert.equal(text, "s/d/0");
  });
});

describe("sector matching", () => {
  it("tolera acentos, mayúsculas y plural", () => {
    assert.equal(resolveSector("DENTISTAS").busqueda, "dentista");
    assert.equal(resolveSector("DENTISTAS").clientes, "pacientes");
    assert.equal(resolveSector("Dermatólogo").ejemploBlog.includes("acné"), true);
    assert.equal(resolveSector("psicólogas").busqueda, "psicóloga");
    assert.equal(resolveSector("ODONTÓLOGOS").busqueda, "odontólogo");
    assert.equal(resolveSector("clínicas dentales").busqueda, "clínica dental");
    assert.equal(
      resolveSector("clínicas dentales").ejemploBlog.includes("blanqueamiento"),
      true,
    );
    assert.equal(resolveSector("médicos generales").busqueda, "médico general");
    assert.equal(resolveSector("médico estético").busqueda, "médico estético");
    assert.equal(resolveSector("Nutrióloga").busqueda, "nutrióloga");
    assert.equal(resolveSector("cafeterías").busqueda, "cafetería");
    assert.equal(resolveSector("salón de belleza").lugar, "salón");
    assert.equal(resolveSector("Estética").busqueda, "estética");
    assert.equal(resolveSector("barberías").busqueda, "barbería");
    assert.equal(resolveSector("gimnasios").accion, "inscribirse");
    assert.equal(resolveSector("spa").accionCorta, "reservar");
    assert.equal(resolveSector("talleres mecánicos").lugar, "taller");
    assert.equal(resolveSector("inmobiliarias").accion, "comprar o rentar");
    assert.equal(resolveSector("escuelas").busqueda, "escuela");
    assert.equal(resolveSector("colegios").busqueda, "colegio");
    assert.equal(resolveSector("fotógrafas").busqueda, "fotógrafa");
    assert.equal(resolveSector("veterinarias").clientes, "dueños de mascotas");
    assert.equal(resolveSector("contadoras").lugar, "despacho");
  });

  it("no confunde un salón de eventos ni un taller de costura con otro giro", () => {
    assert.equal(resolveSector("salón de eventos").lugar, "negocio");
    assert.equal(resolveSector("taller de costura").busqueda, "taller de costura");
    assert.equal(resolveSector("salón").busqueda, "salón de belleza");
    assert.equal(resolveSector("taller").busqueda, "taller mecánico");
  });

  it("rellena cada giro conocido sin dejar tokens ni undefined", () => {
    assert.ok(knownSectorKeys().length >= 18);
    for (const specialty of knownSectorKeys()) {
      const text = buildDefaultLeadMessage(
        lead({
          name: "Negocio Demo",
          specialty,
          city: "Querétaro",
          rating: 4.8,
          userRatingCount: 20,
        }),
      );
      assert.equal(text.includes("undefined"), false, specialty);
      assert.equal(text.includes("{{"), false, specialty);
      assert.match(text, /Querétaro/, specialty);
      assert.match(text, /Desde \$8,000 MXN/, specialty);
      assert.match(text, /WhatsApp/, specialty);
      assert.match(text, /blog/, specialty);
      assert.equal(text.includes("primera página"), false, specialty);
      assert.equal(text.includes("garantiz"), false, specialty);
    }
  });

  it("quita la ciudad del ejemplo de blog si no hay ciudad", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Clínica Árbol",
        specialty: "dentista",
        city: "  ",
        rating: 4.9,
        userRatingCount: 10,
      }),
    );
    assert.match(text, /buscan "dentista" en Google antes de agendar/);
    assert.match(text, /¿Cuánto cuesta un blanqueamiento\?/);
    assert.equal(text.includes("{{"), false);
  });
});

describe("personalize prompt", () => {
  it("pide visibilidad, trabajo, WhatsApp y blog sin prometer ranking", () => {
    const prompt = buildPersonalizePrompt({
      name: "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
      specialty: "dentista",
      city: "Querétaro",
      rating: 4.9,
      userRatingCount: 157,
      address: "Av. Navarra",
      leadReason: "sin_sitio",
      template: DEFAULT_WHATSAPP_TEMPLATE,
      currentMessage: "borrador",
    });
    assert.match(prompt, /fotos del lugar y del trabajo/);
    assert.match(prompt, /botón directo a WhatsApp/);
    assert.match(prompt, /Google pueda encontrarla/);
    assert.match(prompt, /artículos de blog/);
    assert.match(prompt, /¿Cuánto cuesta un blanqueamiento en Querétaro\?/);
    assert.match(prompt, /Desde \$8,000 MXN/);
    assert.match(prompt, /No prometas posiciones/);
    assert.match(prompt, /no garantices/);
    assert.match(prompt, /Trato de usted/);
  });

  it("cambia el ejemplo de blog según el giro aunque la plantilla sea la anterior", () => {
    const prompt = buildPersonalizePrompt({
      name: "Despacho Ramírez",
      specialty: "Abogados",
      city: "Guadalajara",
      rating: null,
      userRatingCount: null,
      address: null,
      leadReason: "solo_red_social",
      template: OLD_TEMPLATE,
      currentMessage: "borrador viejo",
    });
    assert.match(prompt, /¿Cuánto cobra un abogado por un divorcio en Guadalajara\?/);
    assert.match(prompt, /sin calificación/);
    assert.match(prompt, /sin reseñas/);
    assert.match(prompt, /red social/);
    assert.match(prompt, /PLANTILLA:\nHola, le escribo de Torio Web\. Estuve viendo/);
  });
});
