import type { DemoGalleryVariant } from "@/lib/demo/types";

export function GalleryArt({ variant }: { variant: DemoGalleryVariant }) {
  if (variant === "before") return <ToothArt tone="before" />;
  if (variant === "after") return <ToothArt tone="after" />;
  if (variant === "room") return <RoomArt />;
  return <DetailArt />;
}

function ToothArt({ tone }: { tone: "before" | "after" }) {
  const enamel = tone === "after" ? "#f7f4ee" : "#e4d3a8";
  const shade = tone === "after" ? "#d9efe9" : "#efe2c4";
  return (
    <svg viewBox="0 0 320 220" role="img" aria-hidden="true" className="h-full w-full">
      <rect width="320" height="220" fill={shade} />
      <path
        d="M118 46c18-22 66-22 84 0 10 12 22 48 18 78-4 32-16 62-28 62-10 0-14-18-32-18s-22 18-32 18c-12 0-24-30-28-62-4-30 8-66 18-78z"
        fill={enamel}
        stroke="#1a2e2b"
        strokeWidth="3"
      />
      <path
        d="M146 78c8 6 20 6 28 0"
        fill="none"
        stroke="#0c6b66"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RoomArt() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-hidden="true" className="h-full w-full">
      <rect width="320" height="220" fill="#e7f3f1" />
      <rect x="28" y="28" width="120" height="78" rx="8" fill="#f7f4ee" stroke="#1a2e2b" strokeWidth="3" />
      <path d="M40 92h96" stroke="#b08968" strokeWidth="4" />
      <rect x="168" y="96" width="120" height="78" rx="28" fill="#f7f4ee" stroke="#1a2e2b" strokeWidth="3" />
      <rect x="196" y="78" width="18" height="28" rx="4" fill="#0c6b66" />
      <circle cx="78" cy="160" r="18" fill="#0c6b66" />
    </svg>
  );
}

function DetailArt() {
  return (
    <svg viewBox="0 0 320 220" role="img" aria-hidden="true" className="h-full w-full">
      <rect width="320" height="220" fill="#f6f1e8" />
      <rect x="46" y="48" width="18" height="120" rx="9" fill="#1a2e2b" />
      <circle cx="55" cy="46" r="16" fill="#0c6b66" />
      <rect x="110" y="70" width="18" height="98" rx="9" fill="#b08968" />
      <path d="M150 150c30-40 70-40 100 0" fill="none" stroke="#1a2e2b" strokeWidth="8" strokeLinecap="round" />
      <circle cx="250" cy="150" r="14" fill="#0c6b66" />
    </svg>
  );
}

export function MapArt() {
  return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Mapa ilustrado de ejemplo" className="h-full w-full">
      <rect width="640" height="360" fill="#e7f3f1" />
      <path d="M0 210h640M80 0v360M240 0v360M430 0v360M560 0v360" stroke="#c5ddd8" strokeWidth="18" />
      <path d="M0 80h640M0 300h640" stroke="#d5ebe6" strokeWidth="10" />
      <path d="M300 70c40 50 40 110 0 170-40-60-40-120 0-170z" fill="#0c6b66" />
      <circle cx="300" cy="118" r="16" fill="#f7f4ee" />
      <text x="328" y="126" fill="#1a2e2b" fontSize="22" fontFamily="Georgia, serif">
        Ejemplo
      </text>
    </svg>
  );
}

export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.4a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.84C21.94 6.4 17.5 2 12.04 2zm5.76 14.18c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.64-.61-2.88-1.24-4.76-4.14-4.9-4.33-.14-.2-1.16-1.54-1.16-2.94s.73-2.08 1-2.37c.24-.28.64-.41 1.02-.41.12 0 .23 0 .33.01.3.01.45.03.65.5.24.58.82 2 .89 2.15.07.14.12.32.02.51-.1.2-.14.32-.28.49-.14.17-.3.38-.42.51-.14.14-.28.29-.12.56.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.14.43.12.59-.07.16-.2.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.54.73 1.8.86.27.14.44.2.51.31.06.11.06.66-.18 1.34z" />
    </svg>
  );
}
