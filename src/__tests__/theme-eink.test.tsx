import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { loadPreferences, savePreferences, PREFS_KEY } from "../services/storage";
import { resolveThemeMode } from "../services/themeMode";
import { ActivityBar } from "../components/ActivityBar";
import { listPaletteCommands } from "../core/commands";

describe("Retired E-ink theme migration", () => {
  beforeEach(() => localStorage.clear());

  it("loads existing eink preferences as light without losing reading settings", () => {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ theme: "eink", fontScale: 1.1, showLineNumbers: false }),
    );
    expect(loadPreferences()).toMatchObject({
      theme: "light",
      fontScale: 1.1,
      showLineNumbers: false,
    });
    expect(resolveThemeMode("eink", true)).toBe("light");
    expect(resolveThemeMode("eink", false)).toBe("light");
  });

  it("persists active themes and rewrites the retired theme on save", () => {
    for (const theme of ["light", "twitter", "system", "eink"] as const) {
      savePreferences({ theme, fontScale: 1, showLineNumbers: true });
      const expected = theme === "eink" ? "light" : theme;
      expect(loadPreferences().theme).toBe(expected);
      expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).theme).toBe(expected);
    }
  });

  it("offers only light and dark theme buttons", () => {
    render(
      <ActivityBar
        directoryOpen={false}
        onToggleDirectory={vi.fn()}
        sidebarOpen={false}
        activeSidebarTab="toc"
        onSelectSidebarTab={vi.fn()}
        viewMode="read"
        onViewModeChange={vi.fn()}
        theme="light"
        onThemeChange={vi.fn()}
      />,
    );
    const group = screen.getByRole("group", { name: "主题模式" });
    expect(group.querySelectorAll("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "仿电子墨水屏" })).toBeNull();
    expect(screen.getByRole("button", { name: "日光浅色" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("removes the eink command while keeping light and dark commands", () => {
    const ids = listPaletteCommands().map((c) => c.id);
    expect(ids).not.toContain("ui.themeEink");
    expect(ids).toEqual(expect.arrayContaining(["ui.themeLight", "ui.themeTwitter"]));
  });
});
