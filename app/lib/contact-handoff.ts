import type { AuditCategory, AuditItem, AuditResult } from "../types";

export type AuditHandoffLanguage = "sv" | "en";

type AuditHandoffResult = Partial<Pick<AuditResult, "requestedUrl" | "finalUrl" | "overallScore" | "categories" | "items">>;

const CONTACT_URL = "https://birdbrain.it/kontakt";
const MAX_SITE_LENGTH = 320;
const MAX_FINDING_LENGTH = 160;
const MAX_FINDINGS = 3;
const MAX_HANDOFF_URL_LENGTH = 1_800;
const CATEGORY_PARAMS: Record<AuditCategory, string> = {
  performance: "performance",
  seo: "seo",
  accessibility: "accessibility",
  bestPractices: "technical",
};

function boundedScore(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

export function sanitizeAuditedSite(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
    url.username = "";
    url.password = "";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    const safe = url.toString();
    return safe.length <= MAX_SITE_LENGTH ? safe : null;
  } catch {
    return null;
  }
}

function findingText(entry: AuditItem, lang: AuditHandoffLanguage): string | null {
  const title = entry.title?.[lang]?.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  const recommendation = entry.recommendation?.[lang]?.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!title || !recommendation) return null;
  const value = `${title}: ${recommendation}`;
  return value.length <= MAX_FINDING_LENGTH ? value : `${value.slice(0, MAX_FINDING_LENGTH - 1).trimEnd()}…`;
}

export function selectAuditFindings(items: unknown, lang: AuditHandoffLanguage): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((entry): entry is AuditItem => Boolean(entry && typeof entry === "object" && "status" in entry && entry.status !== "good"))
    .map((entry) => findingText(entry, lang))
    .filter((value): value is string => Boolean(value))
    .slice(0, MAX_FINDINGS);
}

export function buildAuditContactUrl(result: AuditHandoffResult | null | undefined, lang: AuditHandoffLanguage): string {
  const contact = new URL(CONTACT_URL);
  try {
    if (!result) return contact.toString();
    const site = sanitizeAuditedSite(result.finalUrl ?? result.requestedUrl);
    if (!site) return contact.toString();

    contact.searchParams.set("source", "audit");
    contact.searchParams.set("site", site);
    contact.searchParams.set("lang", lang);

    const score = boundedScore(result.overallScore);
    if (score !== null) contact.searchParams.set("score", String(score));

    if (Array.isArray(result.categories)) {
      for (const category of result.categories) {
        const param = category && CATEGORY_PARAMS[category.id];
        const categoryScore = category && boundedScore(category.score);
        if (param && categoryScore !== null) contact.searchParams.set(param, String(categoryScore));
      }
    }

    for (const finding of selectAuditFindings(result.items, lang)) {
      contact.searchParams.append("finding", finding);
      if (contact.toString().length > MAX_HANDOFF_URL_LENGTH) {
        const retained = contact.searchParams.getAll("finding").slice(0, -1);
        contact.searchParams.delete("finding");
        for (const value of retained) contact.searchParams.append("finding", value);
        break;
      }
    }
    return contact.toString();
  } catch {
    return new URL(CONTACT_URL).toString();
  }
}
