import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "B2B 통합.물류주문관리시스템",
    short_name: "SANC-LOGIS",
    description: "B2B통합 물류·주문 관리 시스템",
    start_url: "/login",
    scope: "/",
    display: "minimal-ui",
    display_override: ["minimal-ui"],
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#492484",
    lang: "ko",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
