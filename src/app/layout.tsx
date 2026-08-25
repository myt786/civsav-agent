import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
