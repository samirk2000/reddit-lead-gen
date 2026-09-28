import { ImageResponse } from "next/og";
import { getDemo } from "@/lib/demo/registry";

export const runtime = "edge";
export const alt = "Página de ejemplo de Torio Web";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function DemoOpenGraphImage({
  params,
}: {
  params: { giro: string };
}) {
  const demo = getDemo(params.giro);
  const title = demo?.clinicName ?? "Página de ejemplo";
  const city = demo?.city ?? "México";
  const category = demo?.categoryLabel ?? "Negocio local";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3efe7",
          color: "#142321",
          padding: "72px",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: "4px", color: "#0c6b66" }}>
          PÁGINA DE EJEMPLO
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 32, color: "#3d4f4c" }}>
            {`${category} · ${city}`}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#0c6b66" }}>Torio Web</div>
      </div>
    ),
    { ...size },
  );
}
