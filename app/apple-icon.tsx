import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The same hologram as app/icon.svg, on a full square: iOS rounds the corners itself,
// and the matching background hides the SVG's own rounded edge.
const svg = readFileSync(join(process.cwd(), "app/icon.svg"), "utf8");

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#0f0b20", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
