import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Reddit LeadGen",
    template: "%s | Reddit LeadGen",
  },
  description:
    "Monitoreo de oportunidades y automatización de engagement en Reddit.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
