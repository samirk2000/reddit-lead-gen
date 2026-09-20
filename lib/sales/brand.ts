/**
 * Brand defaults for Swiftya Latino IPTV.
 * Used when user_settings CTA fields are empty.
 */

import type { SalesCta } from "@/lib/sales/cta";

export const BRAND_DEFAULTS = {
  businessName: "Swiftya Latino",
  websiteUrl: "https://swiftyalatino.com",
  /** WhatsApp Business click-to-chat (preferred over wa.me). */
  whatsappUrl: "https://api.whatsapp.com/message/RUQZ63ESW76VB1",
  /** +52 1 662 268 4690 */
  whatsappNumber: "5216622684690",
} as const;

/** Merge DB/settings CTA with Swiftya brand defaults. */
export function resolveSalesCta(
  partial?: SalesCta | null,
): Required<Pick<SalesCta, "businessName" | "websiteUrl" | "whatsappNumber">> &
  SalesCta {
  return {
    businessName:
      partial?.businessName?.trim() || BRAND_DEFAULTS.businessName,
    websiteUrl: partial?.websiteUrl?.trim() || BRAND_DEFAULTS.websiteUrl,
    whatsappNumber:
      partial?.whatsappNumber?.trim() || BRAND_DEFAULTS.whatsappNumber,
    whatsappUrl: partial?.whatsappUrl?.trim() || BRAND_DEFAULTS.whatsappUrl,
  };
}
