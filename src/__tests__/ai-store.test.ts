// @vitest-environment node
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { createAiStore } = createRequire(import.meta.url)("../../electron/ai-store.cjs");
let directory: string;
const prefix = join(tmpdir(), "knowspace-ai-store-");
const settings = {
  provider: "compatible",
  baseUrl: "https://example.test/v1",
  model: "fixture",
  maxOutputTokens: 128,
  dailyTokenLimit: 20000,
  saveHistory: true,
};
const secure = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`cipher:${value.split("").reverse().join("")}`),
  decryptString: (value: Buffer) =>
    value
      .toString()
      .replace(/^cipher:/, "")
      .split("")
      .reverse()
      .join(""),
};
beforeEach(async () => {
  directory = await mkdtemp(prefix);
});
afterEach(async () => {
  if (!resolve(directory).startsWith(resolve(prefix))) throw new Error("unsafe fixture cleanup");
  await rm(directory, { recursive: true, force: true });
});

describe("AI settings and records", () => {
  it("rejects malformed budget state rather than bypassing the daily limit", async () => {
    await writeFile(
      join(directory, "records.json"),
      JSON.stringify({ date: "", spent: null, records: {} }),
    );
    await expect(createAiStore(directory, secure).reserve(100, 1024)).rejects.toThrow("格式无效");
  });
  it("encrypts credentials, omits secrets from renderer settings and round-trips in the main process", async () => {
    const store = createAiStore(directory, secure);
    const saved = await store.saveSettings({ settings, apiKey: "fixture-secret" });
    expect(saved).toMatchObject({ hasApiKey: true, keyStorage: "encrypted" });
    expect(JSON.stringify(saved)).not.toContain("fixture-secret");
    expect(await readFile(join(directory, "settings.json"), "utf8")).not.toContain(
      "fixture-secret",
    );
    expect((await createAiStore(directory, secure).getConnection()).apiKey).toBe("fixture-secret");
    await store.saveSettings({ settings: { ...settings, baseUrl: "https://other.test/v1" } });
    expect((await store.getConnection()).apiKey).toBe("");
  });

  it("never silently writes plaintext when encryption is unavailable", async () => {
    const insecure = { ...secure, isEncryptionAvailable: () => false };
    const store = createAiStore(directory, insecure);
    await expect(store.saveSettings({ settings, apiKey: "fixture-secret" })).rejects.toThrow(
      "系统安全存储不可用",
    );
    await store.saveSettings({ settings, apiKey: "fixture-secret", sessionOnly: true });
    expect((await store.getConnection()).apiKey).toBe("fixture-secret");
    expect(await readFile(join(directory, "settings.json"), "utf8")).not.toContain(
      "fixture-secret",
    );
    expect((await createAiStore(directory, insecure).getSettings()).hasApiKey).toBe(false);
  });

  it("reserves concurrent requests serially and reconciles only reported usage", async () => {
    const store = createAiStore(directory, secure);
    const reservations = await Promise.allSettled([
      store.reserve(700, 1024),
      store.reserve(700, 1024),
    ]);
    expect(reservations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const accepted = reservations.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<string>;
    await store.finish(accepted.value, 700, 100, "vault", null);
    await expect(store.reserve(700, 1024)).resolves.toBe(accepted.value);
    await store.finish(accepted.value, 700, null, "vault", null);
    await expect(store.reserve(700, 1024)).rejects.toThrow("预算不足");
  });

  it("isolates library histories, caps retention, and clears content without resetting budget", async () => {
    const store = createAiStore(directory, secure);
    const date = await store.reserve(100, 1024);
    for (let i = 0; i < 23; i++)
      await store.finish(date, 0, 0, "vault-a", { id: `r${i}`, text: `answer${i}` });
    await store.finish(date, 0, 0, "vault-b", { id: "other", text: "different" });
    expect(await store.getHistory("vault-a")).toHaveLength(20);
    expect((await store.getHistory("vault-a"))[0].id).toBe("r22");
    expect(await store.getHistory("vault-b")).toHaveLength(1);
    await store.clearHistory("vault-a");
    expect(await store.getHistory("vault-a")).toEqual([]);
    expect(await store.getHistory("vault-b")).toHaveLength(1);
    expect(JSON.parse(await readFile(join(directory, "records.json"), "utf8")).spent).toBe(100);
  });
});
