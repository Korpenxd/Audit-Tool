import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";

const port = 4177;
const origin = `http://127.0.0.1:${port}`;
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const server = spawn(process.execPath, [nextBin.pathname.slice(1), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early.\n${output}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js did not start.\n${output}`);
}

try {
  const rootResponse = await waitForServer();
  const html = await rootResponse.text();
  assert.match(html, /<title>Gratis webbplatsanalys \| Birdbrain IT<\/title>/);
  assert.match(html, /name="description" content="Analysera din webbplats kostnadsfritt/);
  assert.match(html, /rel="canonical" href="https:\/\/audit\.birdbrain\.it\/"/);
  assert.match(html, /property="og:image" content="https:\/\/audit\.birdbrain\.it\/images\/birdbrain-og\.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /application\/ld\+json/);
  assert.doesNotMatch(html, /content="noindex/);
  assert.doesNotMatch(html, /vercel\.app|localhost/);

  const favicon = await fetch(`${origin}/favicon.svg`);
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get("content-type") ?? "", /image\/svg\+xml/);

  const robots = await (await fetch(`${origin}/robots.txt`)).text();
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/audit\.birdbrain\.it\/sitemap\.xml/);

  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  assert.match(sitemap, /<loc>https:\/\/audit\.birdbrain\.it\/<\/loc>/);
  assert.doesNotMatch(sitemap, /\/api\/|\/results?\//);

  const invalid = await fetch(`${origin}/api/audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "not a url" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");

  const privateAddress = await fetch(`${origin}/api/audit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "http://127.0.0.1" }),
  });
  assert.equal(privateAddress.status, 400);

  console.log("Rendered SEO, favicon, robots, sitemap, invalid URL, and private-address checks passed.");
} finally {
  if (server.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1_000);
      server.once("exit", () => { clearTimeout(timeout); resolve(); });
      server.kill("SIGTERM");
    });
  }
}
