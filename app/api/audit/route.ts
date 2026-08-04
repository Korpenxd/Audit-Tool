import { runAudit } from "../../lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type AuditBody = { url?: unknown; strategy?: unknown; locale?: unknown; company?: unknown };
const errors: Record<string, { sv: string; en: string; status: number }> = {
  INVALID_URL: { sv: "Skriv in en giltig webbadress.", en: "Enter a valid website address.", status: 400 },
  UNSAFE_URL: { sv: "Den adressen kan inte analyseras.", en: "That address cannot be analyzed.", status: 400 },
  NOT_HTML: { sv: "Adressen verkar inte leda till en webbsida.", en: "The address does not appear to lead to a web page.", status: 422 },
  PAGE_TOO_LARGE: { sv: "Sidan är för stor för den här snabbanalysen.", en: "The page is too large for this quick audit.", status: 413 },
  TOO_MANY_REDIRECTS: { sv: "Webbplatsen omdirigerar för många gånger.", en: "The website redirects too many times.", status: 422 },
};

export async function POST(request: Request) {
  let body: AuditBody;
  try { body = await request.json() as AuditBody; }
  catch { return Response.json({ error: errors.INVALID_URL }, { status: 400 }); }
  if (typeof body.company === "string" && body.company.trim()) return Response.json({ error: errors.INVALID_URL }, { status: 400 });

  try {
    const result = await runAudit({
      url: typeof body.url === "string" ? body.url : "",
      strategy: body.strategy === "desktop" ? "desktop" : "mobile",
      locale: body.locale === "en" ? "en" : "sv",
    });
    return Response.json(result, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUDIT_FAILED";
    const mapped = errors[code];
    if (mapped) return Response.json({ error: mapped }, { status: mapped.status });
    if (code.startsWith("HTTP_")) {
      const status = code.slice(5);
      return Response.json({ error: { sv: `Webbplatsen svarade med status ${status}.`, en: `The website responded with status ${status}.` } }, { status: 422 });
    }
    return Response.json({ error: { sv: "Analysen kunde inte slutföras just nu. Kontrollera adressen och försök igen.", en: "The audit could not be completed right now. Check the address and try again." } }, { status: 502 });
  }
}
