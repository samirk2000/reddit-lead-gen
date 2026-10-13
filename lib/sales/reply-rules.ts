/**
 * Rules for every IPTV reply the operator may paste.
 * The model is asked to follow them; this pass fills gaps and drops
 * forbidden Roku-audio claims so a bad generation cannot ship them.
 */

export const DISCOUNT_CODE = "REDDIT15";
export const DISCOUNT_PERCENT = 10;
export const WHATSAPP_DISPLAY = "+52 1 662 268 4690";
export const WHATSAPP_DIGITS = "5216622684690";

const DEVICE_LINE =
  "El servicio está armado para Android, Android TV, Firestick y Google TV.";

export function enforceSellerReply(
  reply: string,
  businessName?: string | null,
): string {
  const brand = businessName?.trim() || "Swiftya Latino";
  const kept = splitPieces(reply).filter((piece) => !mentionsRokuAudioLimit(piece));
  let text = kept.join(" ").replace(/\s+/g, " ").trim();

  if (!text) {
    text = `Hola. Vi lo que escribiste sobre IPTV.`;
  }

  if (!hasSellerDisclosure(text)) {
    text += ` Te lo digo de frente: yo vendo este servicio (${brand}), no soy un cliente que ya lo usa.`;
  }
  if (!mentionsTargetDevices(text)) {
    text += ` ${DEVICE_LINE}`;
  }
  if (!hasDiscount(text)) {
    text += ` Con el código ${DISCOUNT_CODE} tienes ${DISCOUNT_PERCENT}% de descuento.`;
  }
  if (!hasWhatsapp(text)) {
    text += ` WhatsApp: ${WHATSAPP_DISPLAY}.`;
  }

  return text.replace(/\s+/g, " ").trim();
}

function splitPieces(reply: string): string[] {
  return reply
    .split(/\n+|(?<=[.!?])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

/** Drop claims about Roku audio problems. Other Roku mentions can stay out via the prompt. */
export function mentionsRokuAudioLimit(sentence: string): boolean {
  const value = sentence.toLowerCase();
  if (!value.includes("roku")) return false;
  return /audio|sonido|limitaci[oó]n|no se escucha|sin audio/.test(value);
}

function hasSellerDisclosure(text: string): boolean {
  const value = text.toLowerCase();
  const sells =
    /yo vendo|vendo este servicio|vendo el servicio|soy el vendedor|soy la vendedora|te lo vendo/.test(
      value,
    );
  const notCustomer = /no soy un cliente|no soy cliente/.test(value);
  return sells && notCustomer;
}

function mentionsTargetDevices(text: string): boolean {
  return /android|fire\s?stick|fire tv|google tv/i.test(text);
}

function hasDiscount(text: string): boolean {
  return /reddit15/i.test(text) && /10\s*%|10 por ciento/i.test(text);
}

function hasWhatsapp(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return digits.includes("6622684690");
}
