export default function DemoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <style>{`
        html:has(.demo-root),
        html:has(.demo-root) body {
          background: #f3efe7 !important;
          color: #142321 !important;
          color-scheme: light;
        }
      `}</style>
      {children}
    </>
  );
}
