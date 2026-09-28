import type { DemoConfig } from "@/lib/demo/types";

export const TORIO_WHATSAPP_URL = "https://wa.me/5214428253951";

/** Fictional dental clinic used as the cold-lead sample. */
export const dentistaDemo: DemoConfig = {
  slug: "dentista",
  clinicName: "Clínica Dental Sonrisa",
  city: "Querétaro",
  categoryLabel: "Odontología familiar",
  heroLede:
    "Servicios claros, fotos del consultorio y un botón de WhatsApp para agendar. Así puede verse la página de un consultorio.",
  metaDescription:
    "Página de ejemplo para un consultorio dental en Querétaro: servicios, reseñas y cita por WhatsApp. Hecha por Torio Web.",
  services: [
    {
      name: "Limpieza",
      summary: "Profilaxis para quitar placa y sarro, con indicaciones para casa.",
      priceFrom: "Desde $800 MXN",
    },
    {
      name: "Blanqueamiento",
      summary: "Aclarado en consultorio. Antes se revisa el esmalte.",
      priceFrom: "Desde $2,500 MXN",
    },
    {
      name: "Implantes",
      summary: "Reposición de una pieza. El plan se explica en la valoración.",
      priceFrom: "Desde $12,000 MXN",
    },
    {
      name: "Ortodoncia",
      summary: "Brackets o alineadores, según el caso. Control mensual de ejemplo.",
      priceFrom: "Desde $18,000 MXN",
    },
    {
      name: "Endodoncia",
      summary: "Tratamiento de conductos para conservar la pieza.",
      priceFrom: "Desde $3,500 MXN",
    },
  ],
  gallery: [
    {
      title: "Antes",
      caption: "Ilustración de ejemplo. No es un paciente.",
      variant: "before",
    },
    {
      title: "Después",
      caption: "El mismo dibujo, más claro. No es un resultado real.",
      variant: "after",
    },
    {
      title: "Consultorio",
      caption: "Ambiente de muestra, dibujado para esta página.",
      variant: "room",
    },
    {
      title: "Detalle",
      caption: "Instrumental ilustrado. No hay fotos clínicas.",
      variant: "detail",
    },
  ],
  doctor: {
    name: "Dra. Ana Solís",
    role: "Odontóloga general · personaje de ejemplo",
    bio: "En una página real aquí iría la presentación de quien atiende, su enfoque y los años de consulta. Esta ficha es ficticia.",
    initials: "AS",
  },
  reviews: [
    {
      name: "Laura M.",
      relativeTime: "Hace 2 semanas",
      stars: 5,
      text: "Me explicaron el tratamiento con calma y salí con la siguiente cita. Texto de ejemplo, no es una reseña real.",
    },
    {
      name: "Jorge R.",
      relativeTime: "Hace un mes",
      stars: 5,
      text: "El consultorio se ve ordenado y me recibieron a la hora. Opinión inventada para mostrar el diseño.",
    },
    {
      name: "Patricia S.",
      relativeTime: "Hace 3 meses",
      stars: 4,
      text: "Fui por una limpieza y me dijeron qué cuidar en casa. Tampoco es un comentario de Google.",
    },
  ],
  addressLines: [
    "Av. Constituyentes 120, Centro",
    "Querétaro, Qro.",
    "Dirección de ejemplo",
  ],
  hours: [
    { days: "Lunes a viernes", hours: "9:00 a 19:00" },
    { days: "Sábado", hours: "9:00 a 14:00" },
    { days: "Domingo", hours: "Cerrado" },
  ],
  faqs: [
    {
      question: "¿La primera cita tiene costo?",
      answer:
        "En este ejemplo la valoración se aparta por WhatsApp. El precio real lo define cada consultorio.",
    },
    {
      question: "¿El blanqueamiento es para cualquier persona?",
      answer:
        "Hace falta revisar el esmalte antes. Esta página no sustituye una consulta.",
    },
    {
      question: "¿Atienden urgencias?",
      answer:
        "En el ejemplo, las urgencias se piden por WhatsApp dentro del horario publicado.",
    },
    {
      question: "¿Qué formas de pago se muestran?",
      answer:
        "El ejemplo menciona efectivo y tarjeta. Cada consultorio elige las suyas.",
    },
  ],
  posts: [
    {
      title: "¿Cuánto cuesta un blanqueamiento en Querétaro?",
      excerpt:
        "El rango depende del método y del estado del esmalte. En una valoración se explica el precio antes de empezar. Artículo de ejemplo.",
    },
    {
      title: "¿Cada cuánto conviene una limpieza dental?",
      excerpt:
        "Muchas personas la programan cada seis meses. La frecuencia la indica quien revisa la boca. Texto de muestra.",
    },
    {
      title: "¿Qué revisar antes de empezar ortodoncia?",
      excerpt:
        "Encías, higiene y el tipo de aparato. Esta nota solo enseña cómo se vería un artículo del blog.",
    },
  ],
  salesWhatsapp: TORIO_WHATSAPP_URL,
  ctaLabel: "Agendar por WhatsApp",
};
