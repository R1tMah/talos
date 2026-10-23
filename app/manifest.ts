import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TALOS",
    short_name: "TALOS",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0b20",
    theme_color: "#0f0b20",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
