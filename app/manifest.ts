import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lanterne",
    short_name: "Lanterne",
    description: "Messaggi che si accendono la sera",
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#131c2e",
    theme_color: "#131c2e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
