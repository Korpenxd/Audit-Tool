import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://audit.birdbrain.it"),
  title: "Kostnadsfri webbplatsanalys — Birdbrain IT",
  description: "Analysera prestanda, SEO, tillgänglighet och teknik på din webbplats och få tydliga förbättringsförslag.",
  openGraph: {
    title: "Kostnadsfri webbplatsanalys — Birdbrain IT",
    description: "Se vad som bromsar din webbplats och vad som är värt att förbättra först.",
    type: "website",
    locale: "sv_SE",
  },
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="sv"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
