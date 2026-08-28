import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuditContactUrl,
  sanitizeAuditedSite,
  selectAuditFindings,
} from "../app/lib/contact-handoff.ts";

const localized = (sv, en) => ({ sv, en });
const result = {
  requestedUrl: "https://example.com/old?token=secret#fragment",
  finalUrl: "https://example.com/public/path?token=secret#fragment",
  overallScore: 82,
  categories: [
    { id: "performance", score: 76 },
    { id: "seo", score: 91 },
    { id: "accessibility", score: 88 },
    { id: "bestPractices", score: 73 },
  ],
  items: [
    { id: "one", category: "seo", status: "critical", score: 12, title: localized("Sidtitel", "Page title"), summary: localized("Saknas", "Missing"), recommendation: localized("Lägg till en tydlig titel.", "Add a clear title.") },
    { id: "two", category: "performance", status: "warning", score: 55, title: localized("Bildladdning", "Image loading"), summary: localized("Kan förbättras", "Can improve"), recommendation: localized("Lazy-loada bilder längre ned.", "Lazy-load below-fold images.") },
    { id: "three", category: "accessibility", status: "warning", score: 55, title: localized("Etiketter", "Labels"), summary: localized("Kan förbättras", "Can improve"), recommendation: localized("Koppla etiketter till alla fält.", "Connect labels to every field.") },
    { id: "four", category: "seo", status: "warning", score: 55, title: localized("Canonical", "Canonical"), summary: localized("Saknas", "Missing"), recommendation: localized("Lägg till canonical.", "Add a canonical URL.") },
    { id: "passed", category: "seo", status: "good", score: 100, title: localized("Indexering", "Indexing"), summary: localized("Bra", "Good"), recommendation: localized("Ingen åtgärd.", "No action.") },
  ],
};

test("successful Audit results create a compact new contact handoff", () => {
  const url = new URL(buildAuditContactUrl(result, "sv"));
  assert.equal(url.origin + url.pathname, "https://birdbrain.it/kontakt");
  assert.equal(url.searchParams.get("source"), "audit");
  assert.equal(url.searchParams.get("site"), "https://example.com/");
  assert.equal(url.searchParams.get("score"), "82");
  assert.equal(url.searchParams.get("performance"), "76");
  assert.equal(url.searchParams.get("technical"), "73");
  assert.equal(url.searchParams.get("lang"), "sv");
  assert.equal(url.searchParams.getAll("finding").length, 3);
  assert.ok(url.toString().length < 1_200);
  assert.doesNotMatch(url.toString(), /token|secret|fragment|requestedUrl|metrics|pageTitle/);
});

test("English handoff uses English findings and excludes passed checks", () => {
  const findings = selectAuditFindings(result.items, "en");
  assert.deepEqual(findings, [
    "Page title: Add a clear title.",
    "Image loading: Lazy-load below-fold images.",
    "Labels: Connect labels to every field.",
  ]);
});

test("audited sites lose credentials, query parameters, and fragments", () => {
  assert.equal(sanitizeAuditedSite("https://user:pass@example.com/page?token=secret#section"), "https://example.com/");
  assert.equal(sanitizeAuditedSite("javascript:alert(1)"), null);
  assert.equal(sanitizeAuditedSite("data:text/html,hello"), null);
});

test("missing optional metadata still sends the safe audited site", () => {
  const url = new URL(buildAuditContactUrl({ finalUrl: "https://example.com/" }, "en"));
  assert.equal(url.searchParams.get("source"), "audit");
  assert.equal(url.searchParams.get("site"), "https://example.com/");
  assert.equal(url.searchParams.get("score"), null);
  assert.deepEqual(url.searchParams.getAll("finding"), []);
  assert.equal(url.searchParams.get("lang"), "en");
});

test("invalid required context falls back to the plain contact page", () => {
  assert.equal(buildAuditContactUrl(null, "sv"), "https://birdbrain.it/kontakt");
  assert.equal(buildAuditContactUrl({ finalUrl: "javascript:alert(1)", overallScore: 80 }, "sv"), "https://birdbrain.it/kontakt");
});

test("the rendered CTA is a keyboard-accessible new-tab link", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /href=\{contactUrl\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="noopener noreferrer"/);
  assert.match(page, /Få hjälp med resultatet/);
  assert.match(page, /Get help with the results/);
});
