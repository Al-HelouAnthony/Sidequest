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
};

/** @param {{ children: React.ReactNode }} props */
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
