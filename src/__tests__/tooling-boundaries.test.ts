// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { createVitest } from "vitest/node";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function removeFixture(fixtureRoot: string, prefix: string) {
  if (!resolve(fixtureRoot).startsWith(resolve(prefix))) {
    throw new Error("Refusing to remove a directory outside the tooling fixture prefix");
  }
  rmSync(fixtureRoot, { recursive: true, force: true });
}

it("discovers project tests while leaving output, releases and the website alone", async () => {
  const prefix = join(tmpdir(), "knowspace-tooling-");
  const fixtureRoot = mkdtempSync(prefix);
  const files = [
    "src/__tests__/owned.test.ts",
    "src/features/owned.spec.tsx",
    "output/browser-profile/extension.test.js",
    "output/browser-profile/extension.test.ts",
    "release/portable.test.ts",
    "web/src/website.test.ts",
  ];
  for (const file of files) {
    const absolutePath = join(fixtureRoot, file);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, 'throw new Error("discovery must not execute fixtures");');
  }

  let runner: Awaited<ReturnType<typeof createVitest>> | undefined;
  try {
    runner = await createVitest("test", {
      root: fixtureRoot,
      config: join(repoRoot, "vitest.config.ts"),
      watch: false,
    });
    const specifications = await runner.globTestSpecifications();
    expect(
      specifications.map((spec) => relative(fixtureRoot, spec.moduleId).replace(/\\/g, "/")).sort(),
    ).toEqual(["src/__tests__/owned.test.ts", "src/features/owned.spec.tsx"]);
  } finally {
    try {
      await runner?.close();
    } finally {
      removeFixture(fixtureRoot, prefix);
    }
  }
});
