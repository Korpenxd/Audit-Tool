import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("SEO metadata is complete, canonical, and production-safe", async () => {
  const seo = await read("app/lib/seo.ts");
  const layout = await read("app/layout.tsx");

  assert.match(seo, /Gratis webbplatsanalys \| Birdbrain IT/);
  assert.match(seo, /AUDIT_CANONICAL_URL = `\$\{AUDIT_ORIGIN\}\//);
  assert.match(layout, /rel="canonical" href="https:\/\/audit\.birdbrain\.it\/"/);
  assert.match(seo, /card: "summary_large_image"/);
  assert.match(seo, /type: "website"/);
  assert.match(seo, /url: "\/og\/audit-preview\.png"/);
  assert.match(seo, /Birdbrain IT website audit showing performance, SEO and accessibility results/);
  assert.match(seo, /openGraph:[\s\S]*images: \[AUDIT_SOCIAL_IMAGE\]/);
  assert.match(seo, /twitter:[\s\S]*images: \[AUDIT_SOCIAL_IMAGE\]/);
  assert.match(seo, /type: "image\/svg\+xml"/);
  assert.match(seo, /index: true/);
  assert.match(layout, /application\/ld\+json/);
  assert.match(layout, /auditWebApplicationJsonLd/);
  assert.doesNotMatch(`${seo}\n${layout}`, /localhost|vercel\.app/i);
});

test("Audit social image has the expected PNG dimensions", async () => {
  const image = await readFile(new URL("../public/og/audit-preview.png", import.meta.url));
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test("robots and sitemap expose only the public root", async () => {
  const seo = await read("app/lib/seo.ts");
  const nextConfig = await read("next.config.ts");

  assert.match(seo, /disallow: \["\/api\/", "\/results\/", "\/result\/"\]/);
  assert.match(seo, /sitemap: `\$\{AUDIT_ORIGIN\}\/sitemap\.xml`/);
  assert.match(seo, /url: AUDIT_CANONICAL_URL/);
  assert.doesNotMatch(seo, /lastModified/);
  const sitemapSource = seo.split("export function getAuditSitemap")[1];
  assert.doesNotMatch(sitemapSource, /\/api\/|\/results?\//);
  assert.match(nextConfig, /X-Robots-Tag/);
  assert.match(nextConfig, /noindex, nofollow, noarchive/);
});

test("favicon is the canonical Birdbrain asset", async () => {
  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url));
  const hash = createHash("sha256").update(favicon).digest("hex");
  assert.equal(hash, "d3079a65d6d80a5138482b401f1a7c30fe60cc98030d9de353d64c99a9d0e505");
});
