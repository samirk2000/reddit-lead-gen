import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_OUTREACH_PRICE, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/maps/constants";
import {
  buildDefaultLeadMessage,
  buildFollowUpMessage,
  buildOpeningMessage,
  renderLeadMessage,
  type MessageLead,
} from "@/lib/maps/message";
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
        "¡Gracias por su respuesta!",
        "",
        'Le podemos hacer una página profesional donde muestre sus servicios, fotos de su consultorio y trabajos, reseñas de pacientes y un botón directo a WhatsApp para agendar. La dejamos optimizada para que Google la encuentre, y si le interesa, también escribimos artículos para su blog (por ejemplo, "¿Cuánto cuesta un blanqueamiento en Querétaro?") para que aparezca en más búsquedas de la zona.',
        "",
        "Desde $8,000 MXN. Aquí puede ver un ejemplo de cómo quedaría la suya: https://torioweb.com/ejemplos/dentista/?nombre=ODONTOLOGIA%20FAMILIAR%20ESPECIALIZADA",
      ].join("\n"),
    );
  });

  it("usa la ciudad del negocio en la apertura", () => {
    const text = buildOpeningMessage(
      lead({
        name: "Dental Monterrey",
        specialty: "dentista",
        city: "Monterrey",
        rating: 4.8,
        userRatingCount: 40,
      }),
    );
    assert.match(text, /dentista en Monterrey/);
    assert.equal(text.includes("Querétaro"), false);
  });

  it("arma la apertura corta de un dentista", () => {
    const text = buildOpeningMessage(
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
      'Hola, le escribo de Torio Web. Vi ODONTOLOGIA FAMILIAR ESPECIALIZADA en Google Maps, 4.9 estrellas con 157 reseñas, ¡muy buena reputación! Noté que no tiene página web y mucha gente busca "dentista en Querétaro" en Google antes de agendar. ¿Le puedo mandar un ejemplo de cómo se vería la suya?',
    );
    assert.equal(text.includes("8,000"), false);
    assert.equal(text.includes("torioweb.com"), false);
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
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.equal(text.includes("Google Maps"), false);
    assert.match(text, /fotos de su despacho y trabajos, reseñas de clientes/);
    assert.match(text, /botón directo a WhatsApp para consultar/);
    assert.match(text, /¿Cuánto cobra un abogado por un divorcio en Guadalajara\?/);
    assert.match(
      text,
      /Desde \$8,000 MXN\. Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/abogado\/\?nombre=Despacho%20Ram%C3%ADrez$/,
    );
    assert.equal(text.includes("pacientes"), false);
    assert.equal(text.includes("¿Le mando un ejemplo"), false);
    assert.equal(text.includes("ranking"), false);
    assert.equal(text.includes("primera página"), false);
  });

  it("arma el seguimiento de cocinas integrales en Querétaro", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Cocinas Integrales del Bajío",
        specialty: "cocinas integrales",
        city: "Querétaro",
        rating: 4.8,
        userRatingCount: 64,
      }),
    );
    assert.equal(
      text,
      [
        "¡Gracias por su respuesta!",
        "",
        'Le podemos hacer una página profesional donde muestre sus servicios, fotos de su taller y trabajos, reseñas de clientes y un botón directo a WhatsApp para cotizar. La dejamos optimizada para que Google la encuentre, y si le interesa, también escribimos artículos para su blog (por ejemplo, "¿Cuánto cuesta una cocina integral en Querétaro?") para que aparezca en más búsquedas de la zona.',
        "",
        "Desde $8,000 MXN. Aquí puede ver un ejemplo de cómo quedaría la suya: https://torioweb.com/ejemplos/cocinas/?nombre=Cocinas%20Integrales%20del%20Baj%C3%ADo",
      ].join("\n"),
    );
  });

  it("arma el seguimiento de un bufete en Querétaro", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Bufete García y Asociados",
        specialty: "bufete",
        city: "Querétaro",
        rating: 4.6,
        userRatingCount: 41,
      }),
    );
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.equal(text.includes("Google Maps"), false);
    assert.match(text, /fotos de su despacho y trabajos/);
    assert.match(text, /¿Cuánto cobra un abogado por un divorcio en Querétaro\?/);
    assert.match(
      text,
      /Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/abogado\/\?nombre=Bufete%20Garc%C3%ADa%20y%20Asociados$/,
    );
    assert.equal(text.includes("¿Le mando un ejemplo"), false);
    assert.equal(text.includes("pacientes"), false);
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
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.equal(text.includes("Google Maps"), false);
    assert.match(text, /fotos de su local y trabajos, reseñas de comensales/);
    assert.match(text, /WhatsApp para reservar/);
    assert.match(text, /¿Dónde comer en familia en Monterrey\?/);
    assert.match(text, /Desde \$8,000 MXN\. Si gusta, le preparo una propuesta para su negocio\.$/);
    assert.equal(text.includes("Aquí un ejemplo"), false);
    assert.equal(text.includes("Aquí puede ver un ejemplo"), false);
    assert.equal(text.includes("torioweb.com"), false);
    assert.equal(text.includes("¿Le mando un ejemplo"), false);
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
    assert.match(florist, /^¡Gracias por su respuesta!/);
    assert.match(florist, /fotos de su negocio y trabajos, reseñas de clientes/);
    assert.match(florist, /WhatsApp para contactar/);
    assert.match(
      florist,
      /5 cosas que debe saber antes de contratar una florería en Puebla/,
    );
    assert.match(florist, /Si gusta, le preparo una propuesta para su negocio\.$/);

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
    assert.match(locksmith, /Si gusta, le preparo una propuesta para su negocio\.$/);
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
  const snippet = "Vi {{nombre}} en Google Maps{{reputacion}}Pero noté";

  it("omite estrellas y reseñas cuando faltan", () => {
    const text = renderLeadMessage(snippet, {
      ...base,
      rating: null,
      userRatingCount: null,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps\. Pero noté/);
    assert.equal(text.includes("undefined"), false);
    assert.equal(text.includes("estrellas"), false);
    assert.equal(/\d+\s+reseñas/.test(text), false);
    assert.equal(/(?:^|[^a-z])s\/d(?:[^a-z]|$)/i.test(text), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("deja solo las reseñas si no hay calificación", () => {
    const text = renderLeadMessage(snippet, {
      ...base,
      rating: null,
      userRatingCount: 12,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps, con 12 reseñas\. Pero noté/);
    assert.equal(text.includes("estrellas"), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("deja solo las estrellas si no hay reseñas", () => {
    const text = renderLeadMessage(snippet, {
      ...base,
      rating: 4.9,
      userRatingCount: null,
    });
    assert.match(text, /Vi Clínica Árbol en Google Maps: 4\.9 estrellas\. Pero noté/);
    assert.equal(/\d+\s+reseña/.test(text), false);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("no llama buena reputación a una calificación baja", () => {
    const text = renderLeadMessage(snippet, {
      ...base,
      rating: 3.2,
      userRatingCount: 40,
    });
    assert.match(text, /3\.2 estrellas con 40 reseñas\. Pero noté/);
    assert.equal(text.includes("muy buena reputación"), false);
  });

  it("usa el singular con una reseña", () => {
    const text = renderLeadMessage(snippet, {
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
    assert.equal(resolveSector("ortodoncistas").demoSlug, "dentista");
    assert.equal(resolveSector("ortodoncia").demoSlug, "dentista");
    assert.equal(resolveSector("carpinterías").demoSlug, "cocinas");
    assert.equal(resolveSector("carpinterías").busqueda, "carpintería");
    assert.equal(resolveSector("carpinteros").busqueda, "carpintero");
    assert.equal(resolveSector("cocinas integrales").demoSlug, "cocinas");
    assert.equal(resolveSector("cocinas integrales").busqueda, "cocinas integrales");
    assert.equal(resolveSector("cocinas").demoSlug, "cocinas");
    assert.equal(resolveSector("muebles a medida").demoSlug, "cocinas");
    assert.equal(resolveSector("muebles a medida").busqueda, "muebles a medida");
    assert.equal(resolveSector("closets").demoSlug, "cocinas");
    assert.equal(resolveSector("closet").busqueda, "closets");
    assert.equal(resolveSector("mueblerías").demoSlug, "cocinas");
    assert.equal(resolveSector("tiendas de muebles").demoSlug, "cocinas");
    assert.equal(resolveSector("tiendas de muebles").busqueda, "tienda de muebles");
    assert.equal(resolveSector("abogados").demoSlug, "abogado");
    assert.equal(resolveSector("bufetes").demoSlug, "abogado");
    assert.equal(resolveSector("bufetes jurídicos").busqueda, "bufete jurídico");
    assert.equal(resolveSector("despachos jurídicos").demoSlug, "abogado");
    assert.equal(resolveSector("despachos jurídicos").busqueda, "abogado");
    assert.equal(resolveSector("notarías").demoSlug, undefined);
    assert.equal(resolveSector("notario público").demoSlug, undefined);
    assert.equal(resolveSector("notaría").busqueda, "notaría");
    assert.equal(resolveSector("restaurante").demoSlug, undefined);
    assert.equal(resolveSector("cocina económica").demoSlug, undefined);
    assert.equal(resolveSector("cocinas económicas").demoSlug, undefined);
  });

  it("cierra los giros nuevos con su demo y un ejemplo de blog", () => {
    const estetica = buildDefaultLeadMessage(
      lead({
        name: "Clínica Aura",
        specialty: "clínica estética",
        city: "Monterrey",
      }),
    );
    assert.match(estetica, /rejuvenecimiento facial en Monterrey/);
    assert.match(
      estetica,
      /Desde \$8,000 MXN\. Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/clinica-estetica\/\?nombre=Cl%C3%ADnica%20Aura$/,
    );

    const cirujano = buildDefaultLeadMessage(
      lead({
        name: "Dr. Solís",
        specialty: "cirujano plástico",
        city: "Guadalajara",
      }),
    );
    assert.match(cirujano, /rinoplastia en Guadalajara/);
    assert.match(cirujano, /ejemplos\/clinica-estetica\//);
    assert.equal(cirujano.includes("Querétaro"), false);

    const obra = buildDefaultLeadMessage(
      lead({
        name: "Constructora Norte",
        specialty: "constructora",
        city: "Tijuana",
      }),
    );
    assert.match(obra, /construir una casa en Tijuana/);
    assert.match(
      obra,
      /Desde \$8,000 MXN\. Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/constructora\/\?nombre=Constructora%20Norte$/,
    );

    const arquitectura = buildDefaultLeadMessage(
      lead({
        name: "Estudio Loma",
        specialty: "despacho de arquitectura",
        city: "Mérida",
      }),
    );
    assert.match(arquitectura, /proyecto arquitectónico en Mérida/);
    assert.match(arquitectura, /ejemplos\/constructora\//);

    const remodelacion = buildDefaultLeadMessage(
      lead({
        name: "Remodelaciones Sur",
        specialty: "remodelaciones",
        city: "Puebla",
      }),
    );
    assert.match(remodelacion, /remodelación integral en Puebla/);
    assert.match(remodelacion, /ejemplos\/constructora\//);

    const salon = buildDefaultLeadMessage(
      lead({
        name: "Quinta Los Olivos",
        specialty: "salón de eventos",
        city: "León",
      }),
    );
    assert.match(salon, /salón de eventos en León/);
    assert.match(
      salon,
      /Desde \$8,000 MXN\. Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/salon-eventos\/\?nombre=Quinta%20Los%20Olivos$/,
    );

    const quinta = buildDefaultLeadMessage(
      lead({
        name: "Quinta Real",
        specialty: "quinta",
        city: "Querétaro",
      }),
    );
    assert.match(quinta, /jardín de eventos en Querétaro/);
    assert.match(quinta, /ejemplos\/salon-eventos\//);
  });

  it("agrega el demo dental al seguimiento de un ortodoncista", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Ortodoncia Sonrisas",
        specialty: "ortodoncista",
        city: "Querétaro",
        rating: 4.8,
        userRatingCount: 90,
      }),
    );
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.equal(text.includes("Google Maps"), false);
    assert.match(text, /¿Cuánto cuestan los brackets en Querétaro\?/);
    assert.match(
      text,
      /Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/dentista\/\?nombre=Ortodoncia%20Sonrisas$/,
    );
    assert.equal(text.includes("¿Le mando un ejemplo"), false);
  });

  it("no manda ejemplo a una notaría", () => {
    const text = buildDefaultLeadMessage(
      lead({
        name: "Notaría 12",
        specialty: "notaría",
        city: "Querétaro",
        rating: 4.5,
        userRatingCount: 18,
      }),
    );
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.match(text, /una notaría en Querétaro/);
    assert.match(text, /Si gusta, le preparo una propuesta para su negocio\.$/);
    assert.equal(text.includes("Aquí un ejemplo"), false);
    assert.equal(text.includes("Aquí puede ver un ejemplo"), false);
    assert.equal(text.includes("torioweb.com"), false);
    assert.equal(text.includes("divorcio"), false);
    assert.equal(text.includes("Google Maps"), false);
  });

  it("no confunde un salón de eventos ni un taller de costura con otro giro", () => {
    assert.equal(resolveSector("salón de eventos").demoSlug, "salon-eventos");
    assert.equal(resolveSector("salón de eventos").busqueda, "salón de eventos");
    assert.equal(resolveSector("salón de eventos").lugar, "salón");
    assert.notEqual(
      resolveSector("salón de eventos").ejemploBlog,
      resolveSector("salón").ejemploBlog,
    );
    assert.equal(resolveSector("taller de costura").busqueda, "taller de costura");
    assert.equal(resolveSector("salón").busqueda, "salón de belleza");
    assert.equal(resolveSector("taller").busqueda, "taller mecánico");
    assert.equal(resolveSector("spa médico").demoSlug, "clinica-estetica");
    assert.equal(resolveSector("medicina estética").demoSlug, "clinica-estetica");
    assert.equal(resolveSector("clínica estética").demoSlug, "clinica-estetica");
    assert.equal(resolveSector("cirujano plástico").demoSlug, "clinica-estetica");
    assert.equal(resolveSector("estética").demoSlug, undefined);
    assert.equal(resolveSector("spa").demoSlug, undefined);
    assert.equal(resolveSector("constructora").demoSlug, "constructora");
    assert.equal(resolveSector("arquitecto").demoSlug, "constructora");
    assert.equal(resolveSector("despacho de arquitectura").demoSlug, "constructora");
    assert.equal(resolveSector("remodelaciones").demoSlug, "constructora");
    assert.equal(resolveSector("quinta").demoSlug, "salon-eventos");
    assert.equal(resolveSector("jardín de eventos").demoSlug, "salon-eventos");
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
    assert.match(text, /^¡Gracias por su respuesta!/);
    assert.match(text, /¿Cuánto cuesta un blanqueamiento\?/);
    assert.match(
      text,
      /Aquí puede ver un ejemplo de cómo quedaría la suya: https:\/\/torioweb\.com\/ejemplos\/dentista\/\?nombre=Cl%C3%ADnica%20%C3%81rbol$/,
    );
    assert.equal(text.includes("Google Maps"), false);
    assert.equal(text.includes("{{"), false);
  });
});

describe("opening and saved template", () => {
  const dentist = lead({
    name: "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
    specialty: "odontólogo",
    city: "Querétaro",
    rating: 4.9,
    userRatingCount: 157,
  });

  it("degrada la apertura si faltan estrellas o reseñas", () => {
    const none = buildOpeningMessage({
      ...dentist,
      rating: null,
      userRatingCount: null,
    });
    assert.match(none, /en Google Maps\. Noté que no tiene página web/);
    assert.equal(none.includes("undefined"), false);
    assert.equal(none.includes("muy buena reputación"), false);

    const low = buildOpeningMessage({ ...dentist, rating: 3.2, userRatingCount: 8 });
    assert.match(low, /Google Maps, 3\.2 estrellas con 8 reseñas\. Noté/);
    assert.equal(low.includes("muy buena reputación"), false);
  });

  it("usa la plantilla guardada solo en el seguimiento y agrega el demo", () => {
    const followUp = buildFollowUpMessage(dentist, {
      template: OLD_TEMPLATE,
    });
    assert.match(followUp, /Estuve viendo ODONTOLOGIA FAMILIAR ESPECIALIZADA/);
    assert.match(followUp, /alrededor de \$8,000 MXN/);
    assert.match(
      followUp,
      /Aquí un ejemplo: https:\/\/torioweb\.com\/ejemplos\/dentista\/\?nombre=ODONTOLOGIA%20FAMILIAR%20ESPECIALIZADA$/,
    );
    const opening = buildOpeningMessage(dentist);
    assert.match(opening, /¿Le puedo mandar un ejemplo/);
    assert.equal(opening.includes("Estuve viendo"), false);
    assert.equal(followUp.includes("¡Gracias por su respuesta!"), false);
    assert.match(followUp, /¿Le gustaría ver un ejemplo\?/);
  });

  it("cierra el texto de Torio Web una sola vez aunque la pantalla lo pase como plantilla", () => {
    const dentistLead = lead({
      name: "ODONTOLOGIA FAMILIAR ESPECIALIZADA",
      specialty: "dentista",
      city: "Querétaro",
      rating: 4.9,
      userRatingCount: 157,
    });
    const text = buildFollowUpMessage(dentistLead, {
      template: DEFAULT_WHATSAPP_TEMPLATE,
    });
    assert.equal(text, buildDefaultLeadMessage(dentistLead));
    assert.equal(text.split("ejemplos/dentista").length - 1, 1);
    assert.equal(text.includes("¿Le mando un ejemplo"), false);
    assert.equal(text.includes("Aquí un ejemplo:"), false);
  });

  it("no ofrece propuesta ni reescribe una plantilla guardada sin demo", () => {
    const text = buildFollowUpMessage(
      lead({
        name: "La Parrilla del Centro",
        specialty: "restaurante",
        city: "Monterrey",
        rating: 4.6,
        userRatingCount: 320,
      }),
      { template: OLD_TEMPLATE },
    );
    assert.match(text, /Estuve viendo La Parrilla del Centro/);
    assert.match(text, /¿Le gustaría ver un ejemplo\?/);
    assert.equal(text.includes("¡Gracias por su respuesta!"), false);
    assert.equal(text.includes("propuesta para su negocio"), false);
    assert.equal(text.includes("Aquí un ejemplo"), false);
  });

  it("no duplica el enlace si la plantilla ya trae el demo", () => {
    const template = "Vea {{demo_url}} cuando pueda.";
    const text = buildFollowUpMessage(dentist, { template });
    assert.equal(
      text,
      "Vea https://torioweb.com/ejemplos/dentista/?nombre=ODONTOLOGIA%20FAMILIAR%20ESPECIALIZADA cuando pueda.",
    );
    assert.equal(text.split("ejemplos/dentista").length - 1, 1);
  });
});

describe("personalize prompt", () => {
  it("pide una apertura corta y no promete ranking", () => {
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
    assert.match(prompt, /Máximo 3 líneas/);
    assert.match(prompt, /420 caracteres/);
    assert.match(prompt, /No prometas posiciones/);
    assert.match(prompt, /No incluyas precio/);
    assert.match(prompt, /antes de agendar/);
    assert.match(prompt, /Trato de usted/);
    assert.equal(prompt.includes("Desde $8,000"), false);
  });

  it("no inventa calificación cuando falta", () => {
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
    assert.match(prompt, /sin calificación/);
    assert.match(prompt, /sin reseñas/);
    assert.match(prompt, /red social/);
    assert.match(prompt, /antes de consultar/);
    assert.equal(prompt.includes("muy buena reputación"), false);
  });
});
