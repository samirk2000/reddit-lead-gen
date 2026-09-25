export type MessageLead = {
  name: string;
  specialty: string;
  city: string;
  rating: number | null;
  userRatingCount: number | null;
};

export function renderLeadMessage(template: string, lead: MessageLead): string {
  const rating = lead.rating == null ? "s/d" : lead.rating.toFixed(1);
  const reviews =
    lead.userRatingCount == null ? "0" : String(lead.userRatingCount);
  const values: Record<string, string> = {
    nombre: lead.name,
    especialidad: lead.specialty,
    calificacion: rating,
    reseñas: reviews,
    ciudad: lead.city,
  };
  return template.replace(
    /\{\{\s*(nombre|especialidad|calificacion|reseñas|ciudad)\s*\}\}/g,
    (token) => {
      const key = token.replace(/[^a-záéíóúñ]/gi, "");
      return values[key] ?? "";
    },
  );
}

export function whatsAppHref(e164: string, message: string): string {
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
}
