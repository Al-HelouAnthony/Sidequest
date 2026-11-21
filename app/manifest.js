/**
 * Web app manifest (PLAN.md F11: PWA name/icon). Owner: Oscar. Shared file: announced in the team chat.
 * Lets the demo phones "Add to Home Screen" and open Sidequest full-screen, straight into the feed.
 * Icons: app/icon.svg (source), public/icons/icon-192.png + icon-512.png (rendered from it), app/apple-icon.png.
 */

/** @returns {import("next").MetadataRoute.Manifest} */
export default function manifest() {
  return {
    name: "Sidequest",
    short_name: "Sidequest",
    description: "What you could do together this week.",
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef3f2",
    theme_color: "#eef3f2",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
