"use client";

import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AuditCategory, AuditItem, AuditResult, AuditStatus, LocalizedText } from "./types";

type Language = "sv" | "en";
type ResultFilter = "issues" | "critical" | "passed" | "all";

const loadingCopy = {
  sv: ["Kontaktar webbplatsen", "Läser sidans struktur", "Kontrollerar teknik och SEO", "Prioriterar förbättringar"],
  en: ["Contacting the website", "Reading the page structure", "Checking technology and SEO", "Prioritizing improvements"],
};
const categoryCopy: Record<AuditCategory, LocalizedText> = {
  performance: { sv: "Prestanda", en: "Performance" },
  seo: { sv: "SEO", en: "SEO" },
  accessibility: { sv: "Tillgänglighet", en: "Accessibility" },
  bestPractices: { sv: "Teknik", en: "Best practices" },
};

function Icon({ name }: { name: "arrow" | "globe" | "spark" | "check" | "warning" | "close" | "external" | "refresh" }) {
  const paths: Record<typeof name, ReactNode> = {
    arrow: <><path d="M5 12h13" /><path d="m14 7 5 5-5 5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    spark: <><path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    warning: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4M12 17h.01" /></>,
    close: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6H5V6h6" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden="true">{paths[name]}</svg>;
}

function StatusMark({ status }: { status: AuditStatus }) {
  return <span className={`status-mark status-${status}`}><Icon name={status === "good" ? "check" : status === "warning" ? "warning" : "close"} /></span>;
}

function scoreTone(score: number) {
  return score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "warning" : "critical";
}
const pick = (text: LocalizedText, lang: Language) => text[lang];

export default function AuditPage() {
  const [lang, setLang] = useState<Language>("sv");
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [filter, setFilter] = useState<ResultFilter>("issues");

  useEffect(() => {
    const stored = window.localStorage.getItem("birdbrain-audit-language");
    if (stored === "sv" || stored === "en") queueMicrotask(() => setLang(stored));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem("birdbrain-audit-language", lang);
  }, [lang]);
  useEffect(() => {
    if (!loading) return;
    const interval = window.setInterval(() => setLoadingStep((step) => Math.min(step + 1, 3)), 2200);
    return () => window.clearInterval(interval);
  }, [loading]);

  const visibleItems = useMemo(() => {
    if (!result) return [];
    if (filter === "critical") return result.items.filter((entry) => entry.status === "critical");
    if (filter === "passed") return result.items.filter((entry) => entry.status === "good");
    if (filter === "issues") return result.items.filter((entry) => entry.status !== "good");
    return result.items;
  }, [filter, result]);

  async function submitAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoadingStep(0); setLoading(true); setError(""); setResult(null); setFilter("issues");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, strategy, locale: lang, company: form.get("company") }),
      });
      const data = await response.json() as AuditResult | { error?: LocalizedText };
      if (!response.ok || !("overallScore" in data)) {
        const message = "error" in data && data.error ? data.error[lang] : (lang === "sv" ? "Analysen misslyckades." : "The audit failed.");
        throw new Error(message);
      }
      setResult(data);
      window.setTimeout(() => document.getElementById("audit-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : (lang === "sv" ? "Analysen misslyckades." : "The audit failed."));
    } finally { setLoading(false); }
  }

  const sv = lang === "sv";
  return (
    <div className="site-shell">
      <Background />
      <header className="site-header">
        <a className="brand" href="https://birdbrain.it" aria-label="Birdbrain IT">
          <span className="brand-mark">B</span>
          <span><strong>Birdbrain IT</strong><small>{sv ? "Webbplatsanalys" : "Website audit"}</small></span>
        </a>
        <div className="header-actions">
          <a className="back-link" href="https://birdbrain.it/verktyg">{sv ? "Alla verktyg" : "All tools"} <Icon name="external" /></a>
          <div className="language-toggle" aria-label="Language">
            <button type="button" className={lang === "sv" ? "active" : ""} onClick={() => setLang("sv")} aria-pressed={lang === "sv"}>SV</button>
            <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} aria-pressed={lang === "en"}>EN</button>
          </div>
        </div>
      </header>

      <main>
        <section className={`hero ${result ? "hero-compact" : ""}`}>
          <div className="hero-copy">
            <p className="eyebrow"><span />{sv ? "Kostnadsfri webbplatsanalys" : "Free website audit"}</p>
            <h1>{sv ? "Se vad som bromsar" : "See what is holding"}<br /><span>{sv ? "din webbplats." : "your website back."}</span></h1>
            <p className="hero-lead">{sv ? "Få en tydlig genomgång av prestanda, SEO, tillgänglighet och teknik — med konkreta förbättringar i rätt ordning." : "Get a clear review of performance, SEO, accessibility and technology — with concrete improvements in the right order."}</p>
          </div>

          <form className="audit-form" onSubmit={submitAudit}>
            <label htmlFor="website-url">{sv ? "Vilken webbplats vill du analysera?" : "Which website would you like to audit?"}</label>
            <div className="url-field">
              <span><Icon name="globe" /></span>
              <input id="website-url" name="url" type="text" inputMode="url" autoComplete="url" placeholder="dittforetag.se" value={url} onChange={(event) => setUrl(event.target.value)} disabled={loading} required aria-describedby={error ? "audit-error" : "audit-privacy"} />
              <button className="audit-submit" type="submit" disabled={loading}>{loading ? (sv ? "Analyserar" : "Auditing") : (sv ? "Analysera webbplats" : "Audit website")}<Icon name={loading ? "refresh" : "arrow"} /></button>
            </div>
            <input className="honeypot" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div className="form-options">
              <div className="strategy-toggle" aria-label={sv ? "Testläge" : "Test mode"}>
                <button type="button" className={strategy === "mobile" ? "active" : ""} onClick={() => setStrategy("mobile")}>{sv ? "Mobil" : "Mobile"}</button>
                <button type="button" className={strategy === "desktop" ? "active" : ""} onClick={() => setStrategy("desktop")}>Desktop</button>
              </div>
              <p id="audit-privacy"><Icon name="spark" />{sv ? "Ingen registrering. Resultatet sparas inte." : "No registration. Your result is not saved."}</p>
            </div>
            {error && <p className="form-error" id="audit-error" role="alert"><Icon name="warning" />{error}</p>}
          </form>

          {loading && <div className="loading-panel" role="status" aria-live="polite"><div className="scanner-orbit"><span /><span /><i /></div><div><p>{loadingCopy[lang][loadingStep]}<span className="loading-dots">...</span></p><div className="loading-progress"><i style={{ width: `${18 + loadingStep * 24}%` }} /></div><small>{sv ? "Det här tar vanligtvis några sekunder." : "This usually takes a few seconds."}</small></div></div>}
        </section>

        {!result && !loading && <section className="feature-strip" aria-label={sv ? "Vad analysen kontrollerar" : "What the audit checks"}>
          {[
            ["01", sv ? "Prestanda" : "Performance", sv ? "Svarstid, sidstorlek och laddning" : "Response time, page size and loading"],
            ["02", "SEO", sv ? "Metadata, rubriker och indexering" : "Metadata, headings and indexing"],
            ["03", sv ? "Tillgänglighet" : "Accessibility", sv ? "Språk, bilder och formulär" : "Language, images and forms"],
            ["04", sv ? "Teknik" : "Technology", sv ? "HTTPS, säkerhet och struktur" : "HTTPS, security and structure"],
          ].map(([number, title, text]) => <article key={number}><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>)}
        </section>}

        {result && <Results result={result} lang={lang} filter={filter} setFilter={setFilter} visibleItems={visibleItems} onReset={() => { setResult(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      </main>

      <footer><span>© {new Date().getFullYear()} Birdbrain IT</span><a href="mailto:Hello@birdbrain.it">Hello@birdbrain.it</a><span>{sv ? "Byggt med omtanke i Alingsås." : "Thoughtfully built in Alingsås."}</span></footer>
    </div>
  );
}

function Results({ result, lang, filter, setFilter, visibleItems, onReset }: { result: AuditResult; lang: Language; filter: ResultFilter; setFilter: (filter: ResultFilter) => void; visibleItems: AuditItem[]; onReset: () => void }) {
  const sv = lang === "sv";
  const tone = scoreTone(result.overallScore);
  const scoreStyle = { "--score-angle": `${result.overallScore * 3.6}deg` } as CSSProperties;
  const date = new Intl.DateTimeFormat(sv ? "sv-SE" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.scannedAt));
  const options: Array<[ResultFilter, string, number]> = [
    ["issues", sv ? "Att förbättra" : "To improve", result.counts.critical + result.counts.warning],
    ["critical", sv ? "Viktigast" : "Critical", result.counts.critical],
    ["passed", sv ? "Godkänt" : "Passed", result.counts.good],
    ["all", sv ? "Alla kontroller" : "All checks", result.items.length],
  ];
  return (
    <section className="results" id="audit-results">
      <div className="results-heading"><div><p className="eyebrow"><span />{sv ? "Analys klar" : "Audit complete"}</p><h2>{result.host}</h2><p>{date} · {result.strategy === "mobile" ? (sv ? "Mobil" : "Mobile") : "Desktop"} · {result.source === "pagespeed" ? "Lighthouse" : (sv ? "Direktanalys" : "Direct audit")}</p></div><button className="secondary-button" type="button" onClick={onReset}><Icon name="refresh" />{sv ? "Analysera en annan" : "Audit another"}</button></div>
      <div className="score-overview">
        <div className={`overall-score score-${tone}`} style={scoreStyle}><div><strong>{result.overallScore}</strong><span>/100</span></div></div>
        <div className="score-copy"><p>{sv ? "Helhetsbetyg" : "Overall score"}</p><h3>{result.overallScore >= 90 ? (sv ? "Mycket stark grund" : "A very strong foundation") : result.overallScore >= 70 ? (sv ? "Bra grund med tydlig potential" : "A solid base with clear potential") : result.overallScore >= 50 ? (sv ? "Flera förbättringar är värda att göra" : "Several improvements are worth making") : (sv ? "Börja med de viktigaste punkterna" : "Start with the highest-priority issues")}</h3><p>{sv ? `${result.counts.critical} viktiga och ${result.counts.warning} mindre förbättringar hittades.` : `${result.counts.critical} critical and ${result.counts.warning} smaller improvements were found.`}</p></div>
        <div className="category-scores">{result.categories.map((category) => <div key={category.id}><span>{pick(categoryCopy[category.id], lang)}</span><strong className={`number-${scoreTone(category.score)}`}>{category.score}</strong><i><b style={{ width: `${category.score}%` }} /></i></div>)}</div>
      </div>
      <div className="metric-grid">{result.metrics.map((metric) => <article key={metric.id}><StatusMark status={metric.status} /><div><span>{pick(metric.label, lang)}</span><strong>{metric.value}</strong><small>{pick(metric.hint, lang)}</small></div></article>)}</div>
      <div className="results-content">
        <div className="results-toolbar"><div><h3>{sv ? "Kontroller och rekommendationer" : "Checks and recommendations"}</h3><p>{sv ? "Börja uppifrån — listan är sorterad efter prioritet." : "Start at the top — the list is sorted by priority."}</p></div><div className="filter-tabs" role="tablist" aria-label={sv ? "Filtrera kontroller" : "Filter checks"}>{options.map(([value, label, count]) => <button type="button" role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{label}<span>{count}</span></button>)}</div></div>
        <div className="audit-list">{visibleItems.length ? visibleItems.map((entry) => <AuditRow entry={entry} lang={lang} key={entry.id} />) : <p className="empty-state">{sv ? "Inga kontroller i det här filtret." : "No checks in this filter."}</p>}</div>
      </div>
      <div className="results-cta"><div><p className="eyebrow"><span />Birdbrain IT</p><h3>{sv ? "Vill du ha hjälp att förbättra resultatet?" : "Would you like help improving the result?"}</h3><p>{sv ? "Jag kan gå igenom rapporten, prioritera rätt åtgärder och hjälpa dig genomföra dem." : "I can review the report, prioritize the right changes and help you implement them."}</p></div><a className="primary-button" href={`mailto:Hello@birdbrain.it?subject=${encodeURIComponent(`Webbplatsanalys: ${result.host}`)}`}>{sv ? "Prata med mig" : "Talk to me"}<Icon name="arrow" /></a></div>
      <p className="results-note">{sv ? "Resultatet är en automatisk ögonblicksbild. Design, innehåll och affärsmål behöver alltid bedömas av en människa." : "The result is an automated snapshot. Design, content and business goals still require human judgment."}</p>
    </section>
  );
}

function AuditRow({ entry, lang }: { entry: AuditItem; lang: Language }) {
  const sv = lang === "sv";
  return <details className={`audit-row row-${entry.status}`} open={entry.status === "critical"}><summary><StatusMark status={entry.status} /><span className="audit-row-title"><strong>{pick(entry.title, lang)}</strong><small>{pick(entry.summary, lang)}</small></span>{entry.value && <span className="audit-value">{entry.value}</span>}<span className="audit-category">{pick(categoryCopy[entry.category], lang)}</span><span className="audit-chevron" aria-hidden="true" /></summary><div className="audit-detail"><span>{sv ? "Rekommendation" : "Recommendation"}</span><p>{pick(entry.recommendation, lang)}</p></div></details>;
}

function Background() {
  return <div className="background" aria-hidden="true"><span className="stars" /><span className="scan-glow" /><span className="wire-floor" /><span className="signal signal-one" /><span className="signal signal-two" /></div>;
}
