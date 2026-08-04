import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { AuditCategory, AuditItem, AuditMetric, AuditResult, AuditStatus, CategoryScore, LocalizedText } from "../types";

const MAX_HTML_BYTES = 1_800_000;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 18_000;

type AuditRequest = { url: string; strategy: "mobile" | "desktop"; locale: "sv" | "en" };
type FetchSnapshot = { requestedUrl: string; finalUrl: string; response: Response; html: string; htmlBytes: number; ttfbMs: number };
type PageSpeedCategory = { score?: number | null };
type PageSpeedAudit = { numericValue?: number; displayValue?: string };
type PageSpeedResponse = { lighthouseResult?: { lighthouseVersion?: string; categories?: Record<string, PageSpeedCategory>; audits?: Record<string, PageSpeedAudit> } };

const l = (sv: string, en: string): LocalizedText => ({ sv, en });

function item(
  id: string,
  category: AuditCategory,
  status: AuditStatus,
  title: LocalizedText,
  summary: LocalizedText,
  recommendation: LocalizedText,
  options: { value?: string; weight?: number } = {},
): AuditItem {
  return { id, category, status, score: status === "good" ? 100 : status === "warning" ? 55 : 12, title, summary, recommendation, ...options };
}

function getAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const pattern = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  return attributes;
}

function stripMarkup(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function extractTitle(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripMarkup(match[1]) : null;
}

function extractMeta(html: string, key: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = getAttributes(match[0]);
    if ((attrs.get("name") ?? attrs.get("property") ?? "").toLowerCase() === key.toLowerCase()) return attrs.get("content")?.trim() ?? "";
  }
  return null;
}

function hasLinkRel(html: string, rel: string) {
  return Array.from(html.matchAll(/<link\b[^>]*>/gi)).some((match) => (getAttributes(match[0]).get("rel") ?? "").toLowerCase().split(/\s+/).includes(rel));
}

function countTags(html: string, tag: string) {
  return (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length;
}

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = numbers;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::" || host === "::1" || host === "metadata.google.internal" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  if (/^(?:fc|fd|fe8|fe9|fea|feb)/.test(host)) return true;
  return isBlockedIpv4(host);
}

function isBlockedAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(?:fc|fd|fe8|fe9|fea|feb|ff)/.test(normalized)) return true;
  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isBlockedIpv4(mappedIpv4) : false;
}

async function assertPublicDestination(url: URL) {
  if (isBlockedHostname(url.hostname)) throw new Error("UNSAFE_URL");
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("UNSAFE_URL");
  }
}

export function normalizeAndValidateUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) throw new Error("INVALID_URL");
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try { url = new URL(candidate); } catch { throw new Error("INVALID_URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("INVALID_URL");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("UNSAFE_URL");
  if (isBlockedHostname(url.hostname)) throw new Error("UNSAFE_URL");
  url.hash = "";
  return url;
}

async function readHtmlLimited(response: Response) {
  if (!response.body) return { html: "", bytes: 0 };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) { await reader.cancel(); throw new Error("PAGE_TOO_LARGE"); }
    html += decoder.decode(value, { stream: true });
  }
  return { html: html + decoder.decode(), bytes };
}

async function fetchSnapshot(initialUrl: URL): Promise<FetchSnapshot> {
  let currentUrl = initialUrl;
  const startedAt = performance.now();
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicDestination(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2", "user-agent": "BirdbrainIT-Audit/1.0 (+https://birdbrain.it)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ttfbMs = Math.round(performance.now() - startedAt);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("TOO_MANY_REDIRECTS");
      currentUrl = normalizeAndValidateUrl(new URL(location, currentUrl).toString());
      continue;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("NOT_HTML");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_HTML_BYTES) throw new Error("PAGE_TOO_LARGE");
    const { html, bytes } = await readHtmlLimited(response);
    return { requestedUrl: initialUrl.toString(), finalUrl: currentUrl.toString(), response, html, htmlBytes: bytes, ttfbMs };
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes > 1024 * 100 ? 0 : 1)} kB`;
}

function statusFromThreshold(value: number, good: number, warning: number): AuditStatus {
  return value <= good ? "good" : value <= warning ? "warning" : "critical";
}

function buildDirectItems(snapshot: FetchSnapshot) {
  const { html, response, finalUrl, htmlBytes, ttfbMs } = snapshot;
  const final = new URL(finalUrl);
  const title = extractTitle(html);
  const description = extractMeta(html, "description");
  const viewport = extractMeta(html, "viewport");
  const robots = extractMeta(html, "robots")?.toLowerCase() ?? "";
  const lang = getAttributes(html.match(/<html\b[^>]*>/i)?.[0] ?? "").get("lang")?.trim() ?? "";
  const h1Count = countTags(html, "h1");
  const imageTags = Array.from(html.matchAll(/<img\b[^>]*>/gi), (match) => match[0]);
  const imagesWithAlt = imageTags.filter((tag) => getAttributes(tag).has("alt")).length;
  const lazyImages = imageTags.filter((tag) => getAttributes(tag).get("loading")?.toLowerCase() === "lazy").length;
  const altCoverage = imageTags.length ? Math.round((imagesWithAlt / imageTags.length) * 100) : 100;
  const labelsByFor = new Set(Array.from(html.matchAll(/<label\b[^>]*>/gi), (match) => getAttributes(match[0]).get("for")).filter(Boolean));
  const fields = Array.from(html.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi), (match) => match[0]).filter((tag) => !["hidden", "submit", "button", "reset"].includes((getAttributes(tag).get("type") ?? "").toLowerCase()));
  const accessibleFields = fields.filter((tag) => {
    const attrs = getAttributes(tag);
    const id = attrs.get("id");
    return attrs.has("aria-label") || attrs.has("aria-labelledby") || Boolean(id && labelsByFor.has(id));
  }).length;
  const formCoverage = fields.length ? Math.round((accessibleFields / fields.length) * 100) : 100;
  const securityHeaders = ["content-security-policy", "strict-transport-security", "x-content-type-options", "referrer-policy", "permissions-policy"];
  const securityCount = securityHeaders.filter((header) => response.headers.has(header)).length;
  const mixedContent = final.protocol === "https:" && /(?:src|href)\s*=\s*["']http:\/\//i.test(html);
  const hasCanonical = hasLinkRel(html, "canonical");
  const hasFavicon = hasLinkRel(html, "icon") || hasLinkRel(html, "shortcut");
  const hasStructuredData = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  const hasOpenGraph = Boolean(extractMeta(html, "og:title") && extractMeta(html, "og:description"));
  const compressed = Boolean(response.headers.get("content-encoding"));
  const cacheControl = response.headers.get("cache-control") ?? "";
  const ttfbStatus = statusFromThreshold(ttfbMs, 800, 1800);
  const sizeStatus = statusFromThreshold(htmlBytes, 180_000, 420_000);

  const items: AuditItem[] = [
    item("response-time", "performance", ttfbStatus, l("Serverns svarstid", "Server response time"), l(ttfbStatus === "good" ? "Servern började svara snabbt." : "Det tog längre tid än önskat innan servern började svara.", ttfbStatus === "good" ? "The server began responding quickly." : "The server took longer than recommended to begin responding."), l("Optimera serverlogik, databasfrågor och cachelagring nära användaren.", "Optimize server work, database queries and edge caching."), { value: `${ttfbMs} ms`, weight: 1.6 }),
    item("html-size", "performance", sizeStatus, l("HTML-dokumentets storlek", "HTML document size"), l(sizeStatus === "good" ? "Siddokumentet är rimligt kompakt." : "Siddokumentet är större än det behöver vara.", sizeStatus === "good" ? "The page document is reasonably compact." : "The page document is larger than it needs to be."), l("Minska duplicerad markup och flytta stora datamängder till behovsstyrda anrop.", "Reduce duplicated markup and load large datasets only when needed."), { value: formatBytes(htmlBytes), weight: 1.2 }),
    item("compression", "performance", compressed ? "good" : "warning", l("Komprimerad överföring", "Compressed transfer"), l(compressed ? "Servern komprimerar sidans innehåll." : "Ingen komprimering kunde bekräftas för HTML-svaret.", compressed ? "The server compresses the page response." : "Compression could not be confirmed for the HTML response."), l("Aktivera Brotli eller gzip i webbservern eller CDN-tjänsten.", "Enable Brotli or gzip in the web server or CDN."), { value: response.headers.get("content-encoding") ?? "—" }),
    item("cache-policy", "performance", cacheControl ? "good" : "warning", l("Cachepolicy", "Cache policy"), l(cacheControl ? "Servern skickar instruktioner för cachelagring." : "Ingen tydlig cachepolicy hittades i svaret.", cacheControl ? "The server sends caching instructions." : "No clear caching policy was found in the response."), l("Lägg till passande Cache-Control-regler för statiskt och dynamiskt innehåll.", "Add suitable Cache-Control rules for static and dynamic content.")),
    item("image-loading", "performance", imageTags.length < 3 || lazyImages >= Math.max(1, imageTags.length - 2) ? "good" : "warning", l("Bildladdning", "Image loading"), l(`${lazyImages} av ${imageTags.length} bilder använder lazy loading.`, `${lazyImages} of ${imageTags.length} images use lazy loading.`), l("Ladda bilder under första skärmen först när de närmar sig visningsområdet.", "Lazy-load images below the first viewport.")),
    item("page-title", "seo", !title ? "critical" : title.length >= 15 && title.length <= 60 ? "good" : "warning", l("Sidtitel", "Page title"), l(title ? `Titeln innehåller ${title.length} tecken.` : "Sidan saknar en sidtitel.", title ? `The title contains ${title.length} characters.` : "The page is missing a title."), l("Skriv en unik och beskrivande titel på ungefär 15–60 tecken.", "Use a unique, descriptive title of roughly 15–60 characters."), { value: title ?? "—", weight: 1.5 }),
    item("meta-description", "seo", !description ? "critical" : description.length >= 70 && description.length <= 165 ? "good" : "warning", l("Metabeskrivning", "Meta description"), l(description ? `Beskrivningen innehåller ${description.length} tecken.` : "Sidan saknar en metabeskrivning.", description ? `The description contains ${description.length} characters.` : "The page is missing a meta description."), l("Sammanfatta sidans värde tydligt på ungefär 70–165 tecken.", "Summarize the page clearly in roughly 70–165 characters."), { weight: 1.3 }),
    item("h1-structure", "seo", h1Count === 1 ? "good" : h1Count === 0 ? "critical" : "warning", l("Huvudrubrik", "Primary heading"), l(`Sidan innehåller ${h1Count} H1-rubriker.`, `The page contains ${h1Count} H1 headings.`), l("Använd en tydlig H1-rubrik som beskriver sidans huvudsakliga ämne.", "Use one clear H1 describing the page’s primary topic."), { value: String(h1Count), weight: 1.2 }),
    item("canonical", "seo", hasCanonical ? "good" : "warning", l("Kanonisk adress", "Canonical URL"), l(hasCanonical ? "En canonical-länk hittades." : "Ingen canonical-länk hittades.", hasCanonical ? "A canonical URL was found." : "No canonical URL was found."), l("Ange sidans föredragna URL med rel=canonical.", "Declare the preferred page URL with rel=canonical.")),
    item("indexing", "seo", /\bnoindex\b/.test(robots) ? "critical" : "good", l("Indexering", "Indexing"), l(/\bnoindex\b/.test(robots) ? "Sidan ber sökmotorer att inte indexera den." : "Ingen noindex-instruktion hittades.", /\bnoindex\b/.test(robots) ? "The page asks search engines not to index it." : "No noindex directive was found."), l("Ta bort noindex om sidan ska synas i sökresultat.", "Remove noindex if the page should appear in search results."), { weight: 1.5 }),
    item("social-sharing", "seo", hasOpenGraph ? "good" : "warning", l("Delning i sociala medier", "Social sharing"), l(hasOpenGraph ? "Grundläggande Open Graph-data hittades." : "Open Graph-titel eller beskrivning saknas.", hasOpenGraph ? "Basic Open Graph data was found." : "An Open Graph title or description is missing."), l("Lägg till og:title, og:description och gärna og:image.", "Add og:title, og:description and ideally og:image.")),
    item("language", "accessibility", lang ? "good" : "warning", l("Sidans språk", "Page language"), l(lang ? `Dokumentspråket är angivet som “${lang}”.` : "Dokumentets språk är inte angivet.", lang ? `The document language is set to “${lang}”.` : "The document language is not declared."), l("Ange rätt språk med lang-attributet på html-elementet.", "Set the correct lang attribute on the html element.")),
    item("viewport", "accessibility", viewport ? "good" : "critical", l("Mobil visningsyta", "Mobile viewport"), l(viewport ? "En viewport-inställning för mobila enheter hittades." : "Sidan saknar en viewport-inställning.", viewport ? "A mobile viewport setting was found." : "The page is missing a viewport setting."), l("Lägg till en responsiv viewport-meta-tagg.", "Add a responsive viewport meta tag."), { weight: 1.5 }),
    item("image-alternatives", "accessibility", altCoverage === 100 ? "good" : altCoverage >= 80 ? "warning" : "critical", l("Alternativtext för bilder", "Image alternative text"), l(`${imagesWithAlt} av ${imageTags.length} bilder har alt-attribut.`, `${imagesWithAlt} of ${imageTags.length} images have alt attributes.`), l("Beskriv informativa bilder och använd tom alt-text på rent dekorativa bilder.", "Describe informative images and use empty alt text for purely decorative images."), { value: `${altCoverage}%`, weight: 1.4 }),
    item("form-labels", "accessibility", formCoverage === 100 ? "good" : formCoverage >= 75 ? "warning" : "critical", l("Etiketter för formulärfält", "Form field labels"), l(`${accessibleFields} av ${fields.length} formulärfält har en identifierbar etikett.`, `${accessibleFields} of ${fields.length} form fields have an identifiable label.`), l("Koppla varje fält till en label eller ett tydligt aria-label.", "Connect every field to a label or a clear aria-label."), { value: `${formCoverage}%`, weight: 1.2 }),
    item("https", "bestPractices", final.protocol === "https:" ? "good" : "critical", l("Säker anslutning", "Secure connection"), l(final.protocol === "https:" ? "Sidan använder HTTPS." : "Sidan använder inte HTTPS.", final.protocol === "https:" ? "The page uses HTTPS." : "The page does not use HTTPS."), l("Tvinga HTTPS och omdirigera all HTTP-trafik.", "Enforce HTTPS and redirect all HTTP traffic."), { weight: 1.6 }),
    item("security-headers", "bestPractices", securityCount >= 4 ? "good" : securityCount >= 2 ? "warning" : "critical", l("Säkerhetsrubriker", "Security headers"), l(`${securityCount} av 5 rekommenderade säkerhetsrubriker hittades.`, `${securityCount} of 5 recommended security headers were found.`), l("Konfigurera CSP, HSTS, nosniff, Referrer-Policy och Permissions-Policy där de passar.", "Configure CSP, HSTS, nosniff, Referrer-Policy and Permissions-Policy where appropriate."), { value: `${securityCount}/5`, weight: 1.3 }),
    item("mixed-content", "bestPractices", mixedContent ? "critical" : "good", l("Blandat innehåll", "Mixed content"), l(mixedContent ? "HTTP-resurser hittades på en HTTPS-sida." : "Inga uppenbara HTTP-resurser hittades på HTTPS-sidan.", mixedContent ? "HTTP resources were found on an HTTPS page." : "No obvious HTTP resources were found on the HTTPS page."), l("Ladda alla bilder, skript och stilmallar via HTTPS.", "Load all images, scripts and stylesheets over HTTPS.")),
    item("favicon", "bestPractices", hasFavicon ? "good" : "warning", l("Webbplatsikon", "Site icon"), l(hasFavicon ? "En favicon-länk hittades." : "Ingen favicon-länk hittades i dokumentet.", hasFavicon ? "A favicon link was found." : "No favicon link was found in the document."), l("Lägg till en tydlig favicon för flikar och bokmärken.", "Add a clear favicon for browser tabs and bookmarks.")),
    item("structured-data", "bestPractices", hasStructuredData ? "good" : "warning", l("Strukturerad data", "Structured data"), l(hasStructuredData ? "JSON-LD hittades på sidan." : "Ingen JSON-LD hittades på sidan.", hasStructuredData ? "JSON-LD was found on the page." : "No JSON-LD was found on the page."), l("Lägg till relevant schema.org-data när det hjälper sökmotorer förstå innehållet.", "Add relevant schema.org data when it helps search engines understand the content.")),
  ];

  const metrics: AuditMetric[] = [
    { id: "ttfb", label: l("Svarstid", "Response time"), value: `${ttfbMs} ms`, status: ttfbStatus, hint: l("Tid tills servern började svara", "Time until the server began responding") },
    { id: "html", label: l("HTML-storlek", "HTML size"), value: formatBytes(htmlBytes), status: sizeStatus, hint: l("Överförd dokumentstorlek", "Transferred document size") },
    { id: "images", label: l("Bild-alt", "Image alt"), value: `${altCoverage}%`, status: altCoverage === 100 ? "good" : altCoverage >= 80 ? "warning" : "critical", hint: l("Bilder med alt-attribut", "Images with alt attributes") },
    { id: "headers", label: l("Säkerhetsrubriker", "Security headers"), value: `${securityCount}/5`, status: securityCount >= 4 ? "good" : securityCount >= 2 ? "warning" : "critical", hint: l("Rekommenderade rubriker", "Recommended headers") },
  ];
  return { items, metrics, title };
}

function categoryScores(items: AuditItem[]): CategoryScore[] {
  const categories: AuditCategory[] = ["performance", "seo", "accessibility", "bestPractices"];
  return categories.map((id) => {
    const relevant = items.filter((entry) => entry.category === id);
    const weight = relevant.reduce((total, entry) => total + (entry.weight ?? 1), 0);
    return { id, score: Math.round(relevant.reduce((total, entry) => total + entry.score * (entry.weight ?? 1), 0) / Math.max(weight, 1)) };
  });
}

function overallScore(categories: CategoryScore[]) {
  const weights: Record<AuditCategory, number> = { performance: 0.35, seo: 0.3, accessibility: 0.2, bestPractices: 0.15 };
  return Math.round(categories.reduce((total, category) => total + category.score * weights[category.id], 0));
}

async function pageSpeed(url: string, request: AuditRequest): Promise<PageSpeedResponse | null> {
  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  if (!apiKey) return null;
  const endpoint = new URL("https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", request.strategy);
  endpoint.searchParams.set("locale", request.locale);
  endpoint.searchParams.set("key", apiKey);
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) endpoint.searchParams.append("category", category);
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(55_000) });
  if (!response.ok) throw new Error("PAGESPEED_FAILED");
  return response.json() as Promise<PageSpeedResponse>;
}

function enrichWithPageSpeed(baseItems: AuditItem[], baseMetrics: AuditMetric[], response: PageSpeedResponse) {
  const result = response.lighthouseResult;
  if (!result?.categories || !result.audits) return null;
  const definitions = [
    ["largest-contentful-paint", l("Största innehåll", "Largest content"), "ms", 2500, 4000],
    ["first-contentful-paint", l("Första innehåll", "First content"), "ms", 1800, 3000],
    ["total-blocking-time", l("Blockeringstid", "Blocking time"), "ms", 200, 600],
    ["cumulative-layout-shift", l("Layoutskift", "Layout shift"), "", 0.1, 0.25],
  ] as const;
  const metrics: AuditMetric[] = definitions.flatMap(([id, label, unit, good, warning]) => {
    const audit = result.audits?.[id];
    if (typeof audit?.numericValue !== "number") return [];
    const value = id === "cumulative-layout-shift" ? audit.numericValue : Math.round(audit.numericValue);
    return [{ id, label, value: audit.displayValue ?? `${value}${unit ? ` ${unit}` : ""}`, status: statusFromThreshold(value, good, warning), hint: l("Lighthouse-labbvärde", "Lighthouse lab metric") }];
  });
  const categories: CategoryScore[] = [
    ["performance", "performance"], ["seo", "seo"], ["accessibility", "accessibility"], ["bestPractices", "best-practices"],
  ].map(([id, key]) => ({ id: id as AuditCategory, score: Math.round((result.categories?.[key]?.score ?? 0) * 100) }));
  return { items: baseItems, metrics: metrics.length >= 3 ? metrics : baseMetrics, categories, lighthouseVersion: result.lighthouseVersion };
}

export async function runAudit(request: AuditRequest): Promise<AuditResult> {
  const normalized = normalizeAndValidateUrl(request.url);
  const snapshot = await fetchSnapshot(normalized);
  if (!snapshot.response.ok) throw new Error(`HTTP_${snapshot.response.status}`);
  const direct = buildDirectItems(snapshot);
  let items = direct.items;
  let metrics = direct.metrics;
  let categories = categoryScores(items);
  let source: AuditResult["source"] = "direct";
  let lighthouseVersion: string | undefined;
  try {
    const psi = await pageSpeed(snapshot.finalUrl, request);
    const enriched = psi ? enrichWithPageSpeed(items, metrics, psi) : null;
    if (enriched) { items = enriched.items; metrics = enriched.metrics; categories = enriched.categories; lighthouseVersion = enriched.lighthouseVersion; source = "pagespeed"; }
  } catch { /* Direct audit remains available when PageSpeed is unavailable. */ }

  const order: Record<AuditStatus, number> = { critical: 0, warning: 1, good: 2 };
  items.sort((a, b) => order[a.status] - order[b.status] || (b.weight ?? 1) - (a.weight ?? 1));
  const counts = items.reduce<Record<AuditStatus, number>>((value, entry) => { value[entry.status] += 1; return value; }, { good: 0, warning: 0, critical: 0 });
  return {
    requestedUrl: snapshot.requestedUrl,
    finalUrl: snapshot.finalUrl,
    host: new URL(snapshot.finalUrl).hostname,
    scannedAt: new Date().toISOString(),
    source,
    strategy: request.strategy,
    overallScore: overallScore(categories),
    categories,
    metrics,
    items,
    counts,
    pageTitle: direct.title,
    lighthouseVersion,
  };
}
