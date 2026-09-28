import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClinicDemo } from "@/components/demo/clinic-demo";
import { getDemo, listDemoSlugs } from "@/lib/demo/registry";
import { sanitizeBusinessName } from "@/lib/demo/sanitize";
import { resolvePublicAppUrl } from "@/lib/demo/url";

type DemoPageProps = {
  params: { giro: string };
  searchParams: { nombre?: string | string[] };
};

export function generateStaticParams(): { giro: string }[] {
  return listDemoSlugs().map((giro) => ({ giro }));
}

export function generateMetadata({ params, searchParams }: DemoPageProps): Metadata {
  const demo = getDemo(params.giro);
  if (!demo) {
    return { title: { absolute: "Página de ejemplo" }, robots: { index: false, follow: false } };
  }
  const businessName = readName(searchParams.nombre);
  const title = `${businessName ?? demo.clinicName} — página de ejemplo`;
  const base = resolvePublicAppUrl();
  const canonical = `${base}/demo/${demo.slug}`;
  return {
    metadataBase: new URL(base),
    title: { absolute: title },
    description: demo.metaDescription,
    robots: { index: false, follow: false },
    alternates: { canonical },
    openGraph: {
      title,
      description: demo.metaDescription,
      type: "website",
      locale: "es_MX",
      url: canonical,
      siteName: "Torio Web",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: demo.metaDescription,
    },
  };
}

export default function DemoPage({ params, searchParams }: DemoPageProps) {
  const demo = getDemo(params.giro);
  if (!demo) notFound();
  return <ClinicDemo demo={demo} businessName={readName(searchParams.nombre)} />;
}

function readName(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return sanitizeBusinessName(raw);
}
