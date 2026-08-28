import type { Metadata, MetadataRoute } from "next";

export const AUDIT_ORIGIN = "https://audit.birdbrain.it";
export const AUDIT_CANONICAL_URL = `${AUDIT_ORIGIN}/`;
export const AUDIT_TITLE = "Gratis webbplatsanalys | Birdbrain IT";
export const AUDIT_DESCRIPTION = "Analysera din webbplats kostnadsfritt och få tydliga förbättringsförslag för prestanda, SEO, tillgänglighet och teknik från Birdbrain IT.";
export const AUDIT_SOCIAL_IMAGE = {
  url: "/og/audit-preview.png",
  width: 1200,
  height: 630,
  alt: "Birdbrain IT website audit showing performance, SEO and accessibility results",
};

export const auditMetadata: Metadata = {
  metadataBase: new URL(AUDIT_ORIGIN),
  title: { absolute: AUDIT_TITLE },
  description: AUDIT_DESCRIPTION,
  applicationName: "Birdbrain IT Webbplatsanalys",
  category: "technology",
  openGraph: {
    type: "website",
    title: AUDIT_TITLE,
    description: AUDIT_DESCRIPTION,
    url: AUDIT_CANONICAL_URL,
    siteName: "Birdbrain IT Webbplatsanalys",
    locale: "sv_SE",
    images: [AUDIT_SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: AUDIT_TITLE,
    description: AUDIT_DESCRIPTION,
    images: [AUDIT_SOCIAL_IMAGE],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const auditWebApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${AUDIT_CANONICAL_URL}#web-application`,
  name: "Birdbrain IT Webbplatsanalys",
  alternateName: "Webbplatsanalysen",
  url: AUDIT_CANONICAL_URL,
  description: AUDIT_DESCRIPTION,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  inLanguage: ["sv-SE", "en"],
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "SEK",
  },
  provider: {
    "@type": "Organization",
    "@id": "https://birdbrain.it/#organization",
    name: "Birdbrain IT",
    url: "https://birdbrain.it",
  },
  creator: { "@id": "https://birdbrain.it/#organization" },
  publisher: { "@id": "https://birdbrain.it/#organization" },
};

export function getAuditRobots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/results/", "/result/"],
    },
    sitemap: `${AUDIT_ORIGIN}/sitemap.xml`,
    host: AUDIT_ORIGIN,
  };
}

export function getAuditSitemap(): MetadataRoute.Sitemap {
  return [{
    url: AUDIT_CANONICAL_URL,
    changeFrequency: "monthly",
    priority: 1,
  }];
}
