import { GalleryArt, MapArt, WhatsAppIcon } from "@/components/demo/illustrations";
import type { DemoConfig } from "@/lib/demo/types";

const serif = {
  fontFamily: '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif',
} as const;

export function ClinicDemo({
  demo,
  businessName,
}: {
  demo: DemoConfig;
  businessName: string | null;
}) {
  const title = businessName ?? demo.clinicName;
  return (
    <div className="demo-root min-h-screen bg-[#f3efe7] text-[#142321]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <div className="bg-[#142321] px-4 py-2 text-center text-xs tracking-wide text-[#f3efe7]">
        Esto es una página de ejemplo. No es el sitio real de un consultorio.
      </div>
      <header className="sticky top-0 z-40 border-b border-[#142321]/10 bg-[#f3efe7]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <a href="#inicio" className="min-w-0">
            <span className="block truncate text-sm font-semibold" style={serif}>
              {demo.clinicName}
            </span>
            <span className="block text-xs text-[#5c6b68]">{demo.categoryLabel}</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-[#3d4f4c] md:flex">
            <a href="#servicios" className="hover:text-[#0c6b66]">Servicios</a>
            <a href="#resultados" className="hover:text-[#0c6b66]">Resultados</a>
            <a href="#opiniones" className="hover:text-[#0c6b66]">Opiniones</a>
            <a href="#blog" className="hover:text-[#0c6b66]">Blog</a>
          </nav>
          <a
            href={demo.salesWhatsapp}
            className="hidden h-11 items-center gap-2 rounded-full bg-[#1f8f4e] px-4 text-sm font-semibold text-white md:inline-flex"
          >
            <WhatsAppIcon />
            {demo.ctaLabel}
          </a>
        </div>
      </header>

      <main id="contenido">
        <section id="inicio" className="mx-auto max-w-5xl px-4 pb-12 pt-10 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0c6b66]">
            Página de ejemplo
          </p>
          <h1
            className="mt-3 max-w-3xl text-4xl leading-[1.05] text-[#10211f] sm:text-6xl"
            style={serif}
          >
            {title}
          </h1>
          <p className="mt-3 text-sm text-[#5c6b68]">
            {businessName
              ? `${demo.clinicName} — página de ejemplo, con el nombre de su negocio en el título.`
              : `${demo.clinicName} — página de ejemplo`}
          </p>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#3d4f4c]">{demo.heroLede}</p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-1.5">{demo.city}</span>
            <span className="rounded-full bg-white px-3 py-1.5">Cita por WhatsApp</span>
            <span className="rounded-full bg-white px-3 py-1.5">Precios de ejemplo</span>
          </div>
        </section>

        <section id="servicios" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Servicios" title="Lo que se puede mostrar" />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5c6b68]">
            Precios de ejemplo, no son una cotización. En la página real se ponen los montos del consultorio.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {demo.services.map((service) => (
              <li key={service.name} className="rounded-3xl bg-white p-5 shadow-sm">
                <h3 className="text-xl" style={serif}>{service.name}</h3>
                <p className="mt-2 text-sm leading-6 text-[#3d4f4c]">{service.summary}</p>
                <p className="mt-4 text-sm font-semibold text-[#0c6b66]">{service.priceFrom}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="resultados" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Galería" title="Antes, después y el consultorio" />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5c6b68]">
            Dibujos de muestra. No hay fotos de pacientes reales.
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {demo.gallery.map((item) => (
              <li key={item.title} className="overflow-hidden rounded-3xl bg-white shadow-sm">
                <div className="aspect-[16/11]">
                  <GalleryArt variant={item.variant} />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#5c6b68]">{item.caption}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="equipo" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Equipo" title="Quien atiende" />
          <article className="mt-6 flex flex-col gap-5 rounded-3xl bg-white p-5 shadow-sm sm:flex-row sm:items-center">
            <div
              className="flex size-24 shrink-0 items-center justify-center rounded-full bg-[#0c6b66] text-2xl text-white"
              style={serif}
              aria-hidden="true"
            >
              {demo.doctor.initials}
            </div>
            <div>
              <h3 className="text-2xl" style={serif}>{demo.doctor.name}</h3>
              <p className="mt-1 text-sm text-[#0c6b66]">{demo.doctor.role}</p>
              <p className="mt-3 text-sm leading-6 text-[#3d4f4c]">{demo.doctor.bio}</p>
            </div>
          </article>
        </section>

        <section id="opiniones" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Reseñas de ejemplo" title="Así se ven las opiniones" />
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5c6b68]">
            El diseño imita una ficha de Google. Los textos son inventados.
          </p>
          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {demo.reviews.map((review) => (
              <li key={review.name} className="rounded-3xl border border-[#142321]/10 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{review.name}</p>
                  <Stars count={review.stars} />
                </div>
                <p className="mt-1 text-xs text-[#5c6b68]">{review.relativeTime} · ejemplo</p>
                <p className="mt-3 text-sm leading-6 text-[#3d4f4c]">{review.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="ubicacion" className="mx-auto grid max-w-5xl gap-3 px-4 py-8 md:grid-cols-2">
          <article className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <div className="aspect-[16/10]">
              <MapArt />
            </div>
            <div className="p-5">
              <h2 className="text-2xl" style={serif}>Dónde está</h2>
              {demo.addressLines.map((line) => (
                <p key={line} className="mt-1 text-sm text-[#3d4f4c]">{line}</p>
              ))}
            </div>
          </article>
          <article className="rounded-3xl bg-[#142321] p-6 text-[#f3efe7]">
            <h2 className="text-2xl" style={serif}>Horario de ejemplo</h2>
            <dl className="mt-5 space-y-3">
              {demo.hours.map((row) => (
                <div key={row.days} className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3">
                  <dt className="text-sm text-[#d5ebe6]">{row.days}</dt>
                  <dd className="text-sm font-semibold">{row.hours}</dd>
                </div>
              ))}
            </dl>
          </article>
        </section>

        <section id="preguntas" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Preguntas" title="Lo que suelen preguntar" />
          <div className="mt-6 space-y-3">
            {demo.faqs.map((faq) => (
              <details key={faq.question} className="rounded-2xl bg-white px-5 py-4">
                <summary className="cursor-pointer text-base font-semibold">{faq.question}</summary>
                <p className="mt-3 text-sm leading-6 text-[#3d4f4c]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="blog" className="mx-auto max-w-5xl px-4 py-8">
          <SectionTitle eyebrow="Blog de ejemplo" title="Artículos para búsquedas de la zona" />
          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {demo.posts.map((post) => (
              <li key={post.title} className="flex flex-col rounded-3xl bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b08968]">
                  Artículo de ejemplo
                </p>
                <h3 className="mt-3 text-xl leading-snug" style={serif}>{post.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#3d4f4c]">{post.excerpt}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-10">
        <div className="rounded-3xl bg-[#e7f3f1] px-5 py-4 text-sm leading-6 text-[#142321]">
          Página de ejemplo hecha por Torio Web —{" "}
          <a
            href={demo.salesWhatsapp}
            className="font-semibold text-[#0c6b66] underline decoration-[#0c6b66]/40 underline-offset-4"
          >
            ¿quiere una así para su negocio?
          </a>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#142321]/10 bg-[#f3efe7]/95 p-3 backdrop-blur md:hidden">
        <a
          href={demo.salesWhatsapp}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1f8f4e] text-base font-semibold text-white"
        >
          <WhatsAppIcon />
          {demo.ctaLabel}
        </a>
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0c6b66]">{eyebrow}</p>
      <h2 className="mt-2 text-3xl text-[#10211f] sm:text-4xl" style={serif}>{title}</h2>
    </div>
  );
}

function Stars({ count }: { count: number }) {
  const safe = Math.max(0, Math.min(5, count));
  return (
    <p className="text-sm tracking-tight text-[#b08968]" aria-label={`${safe} de 5 estrellas, ejemplo`}>
      {"★".repeat(safe)}
      <span className="text-[#d9d0c3]">{"★".repeat(5 - safe)}</span>
    </p>
  );
}
