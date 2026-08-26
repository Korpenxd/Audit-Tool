import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("scanner security and operational limits remain present", async () => {
  const source = await readFile(new URL("../app/lib/audit.ts", import.meta.url), "utf8");

  assert.match(source, /MAX_HTML_BYTES = 1_800_000/);
  assert.match(source, /MAX_REDIRECTS = 4/);
  assert.match(source, /FETCH_TIMEOUT_MS = 18_000/);
  assert.match(source, /assertPublicDestination\(currentUrl\)/);
  assert.match(source, /redirect: "manual"/);
  assert.match(source, /metadata\.google\.internal/);
  assert.match(source, /PageSpeed/);
  assert.match(source, /PAGESPEED_API_KEY/);
});
