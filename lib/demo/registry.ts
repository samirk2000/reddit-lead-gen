import { dentistaDemo } from "@/lib/demo/dentista";
import type { DemoConfig } from "@/lib/demo/types";

const DEMOS: Readonly<Record<string, DemoConfig>> = {
  dentista: dentistaDemo,
};

export function listDemoSlugs(): readonly string[] {
  return Object.keys(DEMOS);
}

export function getDemo(slug: string): DemoConfig | null {
  const key = slug
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return DEMOS[key] ?? null;
}

export function isKnownDemoSlug(slug: string): boolean {
  return getDemo(slug) != null;
}
