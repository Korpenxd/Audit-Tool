import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { auditMetadata, auditWebApplicationJsonLd } from "./lib/seo";
import "./globals.css";

const themeBootstrap = `
  (() => {
    try {
      const saved = localStorage.getItem("birdbrain-theme");
      const preferred = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      document.documentElement.dataset.theme = saved === "light" || saved === "dark" ? saved : preferred;
    } catch {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = auditMetadata;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://audit.birdbrain.it/" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(auditWebApplicationJsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
