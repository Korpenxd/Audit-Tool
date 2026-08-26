import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("theme bootstraps before hydration and persists preference", async () => {
  const layout = await read("app/layout.tsx");
  const page = await read("app/page.tsx");

  assert.match(layout, /localStorage\.getItem\("birdbrain-theme"\)/);
  assert.match(layout, /prefers-color-scheme: light/);
  assert.match(layout, /document\.documentElement\.dataset\.theme/);
  assert.match(page, /localStorage\.setItem\("birdbrain-theme", nextTheme\)/);
  assert.match(page, /aria-label=.*nextTheme/);
  assert.match(page, /aria-pressed=\{theme === "dark"\}/);
});

test("both themes and responsive header controls are styled", async () => {
  const css = await read("app/globals.css");
  const page = await read("app/page.tsx");

  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /--bg: #edf2f8/);
  assert.match(css, /\.site-header-inner/);
  assert.match(css, /\.site-header \{[^}]*width: 100%/);
  assert.match(css, /data-theme="light"\] \.wire-floor/);
  assert.match(css, /\.theme-toggle/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(page, /className="skip-link"/);
  assert.match(page, /className="site-header-inner"/);
  assert.match(page, /className={`language-toggle is-\$\{lang\}`}/);
  assert.match(page, /https:\/\/birdbrain\.it/);
});
