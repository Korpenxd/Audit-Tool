export type AuditStatus = "good" | "warning" | "critical";
export type AuditCategory = "performance" | "seo" | "accessibility" | "bestPractices";
export type AuditSource = "direct" | "pagespeed";

export type LocalizedText = { sv: string; en: string };

export type AuditItem = {
  id: string;
  category: AuditCategory;
  status: AuditStatus;
  score: number;
  title: LocalizedText;
  summary: LocalizedText;
  recommendation: LocalizedText;
  value?: string;
  weight?: number;
};

export type AuditMetric = {
  id: string;
  label: LocalizedText;
  value: string;
  status: AuditStatus;
  hint: LocalizedText;
};

export type CategoryScore = { id: AuditCategory; score: number };

export type AuditResult = {
  requestedUrl: string;
  finalUrl: string;
  host: string;
  scannedAt: string;
  source: AuditSource;
  strategy: "mobile" | "desktop";
  overallScore: number;
  categories: CategoryScore[];
  metrics: AuditMetric[];
  items: AuditItem[];
  counts: Record<AuditStatus, number>;
  pageTitle: string | null;
  lighthouseVersion?: string;
};
