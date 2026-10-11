import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0b0d10", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 74, height: 14, borderRadius: 7, background: "#5ad8ec" }} />
          <div style={{ width: 14, height: 68, borderRadius: 7, background: "#5ad8ec", marginTop: -7 }} />
        </div>
      </div>
    ),
    size,
  );
}
