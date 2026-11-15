import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("gives system-light review controls the same readable styles as explicit light mode", () => {
  const css = readFileSync(resolve(__dirname, "../styles/review-panel.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const mediaStart = css.indexOf("@media (prefers-color-scheme: light)");
  expect(mediaStart).toBeGreaterThan(0);
  const systemRules = new Map<string, string>();
  for (const match of css.slice(mediaStart).matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    for (const selector of match[1].split(","))
      systemRules.set(selector.trim(), match[2].replace(/\s/g, ""));
  }
  let checked = 0;
  for (const match of css.slice(0, mediaStart).matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    for (const selector of match[1].split(",")) {
      if (!selector.includes('[data-theme="light"]')) continue;
      const systemSelector = selector.trim().replace('"light"', '"system"');
      expect(systemRules.get(systemSelector), systemSelector).toBe(match[2].replace(/\s/g, ""));
      checked++;
    }
  }
  expect(checked).toBe(10);
  expect(css.slice(mediaStart)).not.toContain("prefers-color-scheme: dark");
});
