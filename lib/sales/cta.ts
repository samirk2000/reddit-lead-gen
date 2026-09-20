/**
 * Sales CTA helpers for WhatsApp / website links in suggested replies.
 */

export type SalesCta = {
  whatsappNumber?: string | null | undefined;
  /** Preferred: WhatsApp Business click-to-chat URL. */
  whatsappUrl?: string | null | undefined;
  websiteUrl?: string | null | undefined;
  businessName?: string | null | undefined;
};

/** Digits-only phone suitable for wa.me. */
export function normalizeWhatsappDigits(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Normalize http(s) URL; returns null if empty/invalid. */
export function normalizeWebsiteUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Drop trailing slash and empty query `?`
    url.search = url.search === "?" ? "" : url.search;
    let out = url.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    if (out.endsWith("?")) out = out.slice(0, -1);
    return out;
  } catch {
    return null;
  }
}

/** Normalize WhatsApp Business / wa.me / api.whatsapp.com links. */
export function normalizeWhatsappUrl(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Plain phone pasted into the URL field
  if (!/^https?:\/\//i.test(trimmed) && /^\+?[\d\s()-]+$/.test(trimmed)) {
    const digits = normalizeWhatsappDigits(trimmed);
    return digits ? buildWhatsappLink(digits) : null;
  }

  return normalizeWebsiteUrl(trimmed);
}

/** Build a wa.me deep link with optional prefilled message. */
export function buildWhatsappLink(digits: string, prefill?: string): string {
  const base = `https://wa.me/${digits}`;
  if (!prefill?.trim()) return base;
  return `${base}?text=${encodeURIComponent(prefill.trim())}`;
}

/**
 * Best WhatsApp href: Business click-to-chat URL first, else wa.me from digits.
 */
export function resolveWhatsappHref(
  cta: SalesCta,
  prefill?: string,
): string | null {
  const custom = normalizeWhatsappUrl(cta.whatsappUrl);
  if (custom) return custom;

  const digits = normalizeWhatsappDigits(cta.whatsappNumber);
  if (digits) return buildWhatsappLink(digits, prefill);
  return null;
}

/** Human-readable CTA block appended to replies when configured. */
export function formatCtaBlock(cta: SalesCta): string | null {
  const wa = resolveWhatsappHref(
    cta,
    "Hola, vi lo de IPTV y quiero una prueba",
  );
  const site = normalizeWebsiteUrl(cta.websiteUrl);
  if (!wa && !site) return null;

  const lines: string[] = [];
  if (wa) lines.push(`WhatsApp: ${wa}`);
  if (site) lines.push(`Web: ${site}`);
  return lines.join("\n");
}

/**
 * Ensures the suggested reply ends with the sales CTA when configured.
 * Avoids duplicating if Gemini already included the same links.
 */
export function ensureSalesCtaInReply(reply: string, cta: SalesCta): string {
  const block = formatCtaBlock(cta);
  if (!block) return reply.trim();

  const wa = resolveWhatsappHref(cta);
  const site = normalizeWebsiteUrl(cta.websiteUrl);
  const lower = reply.toLowerCase();

  const hasWa =
    !wa ||
    lower.includes("wa.me/") ||
    lower.includes("api.whatsapp.com") ||
    lower.includes("whatsapp.com/message") ||
    (normalizeWhatsappDigits(cta.whatsappNumber) != null &&
      lower.includes(normalizeWhatsappDigits(cta.whatsappNumber)!));

  const hasWeb = !site || lower.includes(site.toLowerCase().replace(/^https?:\/\//, ""));

  if (
    hasWa &&
    hasWeb &&
    (lower.includes("wa.me/") ||
      lower.includes("api.whatsapp.com") ||
      lower.includes("whatsapp.com/message") ||
      (site != null && lower.includes(site.toLowerCase())))
  ) {
    return reply.trim();
  }

  const brand = cta.businessName?.trim() || "nosotros";
  const closer = `Si querés prueba y ayuda con la config, escribime por WhatsApp o mirá ${brand} acá:`;
  return `${reply.trim()}\n\n${closer}\n${block}`;
}
