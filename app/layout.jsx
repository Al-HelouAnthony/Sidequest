import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

/** Body text. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** Headings (font-display). Variable font with the optical-size axis, like the design demo. */
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

/** @type {import("next").Metadata} */
export const metadata = {
  title: "Sidequest",
  description: "What you could do together this week.",
  // Home-screen app on iOS (the manifest in app/manifest.js covers Android/Chrome).
  appleWebApp: { capable: true, title: "Sidequest", statusBarStyle: "default" },
};

/**
 * Full-bleed on notched phones: the screens already pad with env(safe-area-inset-*) (pt-safe, pb-safe, tab bar).
 * Theme colour = the page background in each theme (globals.css --color-canvas), so the browser chrome blends in.
 * @type {import("next").Viewport}
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef3f2" },
    { media: "(prefers-color-scheme: dark)", color: "#151c21" },
  ],
};

/** @param {{ children: React.ReactNode }} props */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
