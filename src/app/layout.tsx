import type { Metadata } from "next";
import { Manrope, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Heading/display face — used via the font-heading utility (see
// globals.css's --font-heading), applied to page titles and sheet titles,
// never the body default.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

// Body face — the default for everything that isn't a heading.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Tabular data — clicks, currency, percentages. Kept distinct from the
// body face specifically for its numeral rendering.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Client Dashboard",
  description: "Read-only daily ops dashboard across connected platforms",
};

// Runs before paint so the stored theme (or dark, the default) applies
// immediately — without this, the page would flash light-then-dark (or
// dark-then-light) on every load, waiting on React to hydrate the toggle.
const themeInitScript = `
  try {
    var t = localStorage.getItem("theme");
    document.documentElement.classList.add(t === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.classList.add("dark");
  }
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
