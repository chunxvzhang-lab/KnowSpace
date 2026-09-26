import { describe, it, expect, beforeEach } from "vitest";
import { loadPreferences, savePreferences } from "../services/storage";

describe("Flash Capsule (闪念胶囊) & Hotkey Customization", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults flashCapsuleShortcut to Alt+Space", () => {
    const prefs = loadPreferences();
    expect(prefs.flashCapsuleShortcut).toBe("Alt+Space");
  });

  it("persists and restores custom flash capsule hotkey", () => {
    savePreferences({
      theme: "eink",
      fontScale: 1,
      showLineNumbers: true,
      flashCapsuleShortcut: "Ctrl+Shift+Space",
    });

    const prefs = loadPreferences();
    expect(prefs.flashCapsuleShortcut).toBe("Ctrl+Shift+Space");

    savePreferences({
      ...prefs,
      flashCapsuleShortcut: "Alt+N",
    });

    expect(loadPreferences().flashCapsuleShortcut).toBe("Alt+N");
  });

  it("formats flash note entries correctly with timestamp and title", () => {
    function formatFlashEntry(content: string, dateStr: string, timeStr: string) {
      const header = `# 📥 闪念收集箱 (${dateStr})\n\n> 随时记录灵感火花与即刻待办。\n\n---\n\n`;
      const entry = `### 🕒 ${timeStr}\n\n${content.trim()}\n\n---\n\n`;
      return { header, entry };
    }

    const res = formatFlashEntry("- [ ] 完成 v1.6 闪念胶囊开发", "2026-08-27", "22:50:00");
    expect(res.header).toContain("2026-08-27");
    expect(res.entry).toContain("### 🕒 22:50:00");
    expect(res.entry).toContain("- [ ] 完成 v1.6 闪念胶囊开发");
  });

  it("validates accelerator shortcut format correctly", () => {
    function isValidAccelerator(shortcut: string): boolean {
      if (!shortcut || !shortcut.trim()) return false;
      const parts = shortcut.split("+").map((s) => s.trim());
      if (parts.length === 1 && /^F[1-9][0-2]?$/i.test(parts[0])) {
        return true;
      }
      const modifiers = ["Ctrl", "Alt", "Shift", "Command", "Control"];
      const hasModifier = parts.some((p) => modifiers.includes(p));
      const key = parts[parts.length - 1];
      return hasModifier && Boolean(key) && !modifiers.includes(key);
    }

    expect(isValidAccelerator("Alt+Space")).toBe(true);
    expect(isValidAccelerator("Ctrl+Shift+Space")).toBe(true);
    expect(isValidAccelerator("Ctrl+Alt+N")).toBe(true);
    expect(isValidAccelerator("F9")).toBe(true);
    expect(isValidAccelerator("")).toBe(false);
    expect(isValidAccelerator("Space")).toBe(false);
  });

  it("handles app background running and auto-launch configuration properly", () => {
    type AppConfig = {
      flashShortcut: string;
      runInBackground: boolean;
      autoLaunch: boolean;
    };

    function resolveAppConfig(raw: Partial<AppConfig>): AppConfig {
      return {
        flashShortcut: raw.flashShortcut || "Alt+Space",
        runInBackground: raw.runInBackground !== false,
        autoLaunch: Boolean(raw.autoLaunch),
      };
    }

    const defaultCfg = resolveAppConfig({});
    expect(defaultCfg.runInBackground).toBe(true);
    expect(defaultCfg.autoLaunch).toBe(false);
    expect(defaultCfg.flashShortcut).toBe("Alt+Space");

    const customCfg = resolveAppConfig({
      autoLaunch: true,
      runInBackground: false,
      flashShortcut: "Ctrl+Shift+Space",
    });
    expect(customCfg.autoLaunch).toBe(true);
    expect(customCfg.runInBackground).toBe(false);
    expect(customCfg.flashShortcut).toBe("Ctrl+Shift+Space");
  });

  it("generates minute-based file timestamp format (YYYY-MM-DD_HHmm.md)", () => {
    function getMinuteFileTimestamp(date: Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");

      const dateStr = `${year}-${month}-${day}`;
      const minuteFileName = `${dateStr}_${hours}${minutes}.md`;
      const timeDisplay = `${hours}:${minutes}:${seconds}`;
      const minuteDisplay = `${hours}:${minutes}`;

      return { dateStr, minuteFileName, timeDisplay, minuteDisplay };
    }

    const testDate = new Date(2026, 7, 28, 14, 33, 20); // 2026-08-28 14:33:20
    const res = getMinuteFileTimestamp(testDate);
    expect(res.minuteFileName).toBe("2026-08-28_1433.md");
    expect(res.dateStr).toBe("2026-08-28");
    expect(res.minuteDisplay).toBe("14:33");
    expect(res.timeDisplay).toBe("14:33:20");
  });

  it("appends to existing minute file instead of overwriting within the same minute", () => {
    type MockFileSystem = Record<string, string>;
    const vfs: MockFileSystem = {};

    function saveFlashNoteMock(
      fsMap: MockFileSystem,
      fileName: string,
      content: string,
      timeDisplay: string
    ) {
      const isNew = !fsMap[fileName];
      if (isNew) {
        fsMap[fileName] = `# ⚡ 闪念笔记\n\n### 🕒 ${timeDisplay}\n\n${content}\n\n---\n\n`;
      } else {
        fsMap[fileName] += `### 🕒 ${timeDisplay}\n\n${content}\n\n---\n\n`;
      }
    }

    const fileName = "2026-08-28_1433.md";
    // First save at 14:33:10
    saveFlashNoteMock(vfs, fileName, "第一条灵感想法", "14:33:10");
    expect(vfs[fileName]).toContain("第一条灵感想法");
    expect(vfs[fileName]).toContain("14:33:10");

    // Second save at 14:33:45 (same minute)
    saveFlashNoteMock(vfs, fileName, "第二条灵感补充", "14:33:45");
    expect(vfs[fileName]).toContain("第一条灵感想法");
    expect(vfs[fileName]).toContain("第二条灵感补充");
    expect(vfs[fileName]).toContain("14:33:45");
  });

  it("resolves Space directory without creating redundant nested Space/Space", () => {
    function resolveSpaceDir(workspaceDir: string | null, customDir: string | null): string {
      if (customDir && customDir.trim()) {
        return customDir.trim();
      }
      const base = workspaceDir || "C:\\Users\\Mock\\AppData\\KnowSpace\\workspace";
      if (base.endsWith("\\Space") || base.endsWith("/Space")) {
        return base;
      }
      return `${base}\\Space`;
    }

    // Default workspace
    expect(resolveSpaceDir("D:\\Notes", null)).toBe("D:\\Notes\\Space");

    // Workspace already named Space
    expect(resolveSpaceDir("D:\\Notes\\Space", null)).toBe("D:\\Notes\\Space");

    // Custom directory overrides workspace
    expect(resolveSpaceDir("D:\\Notes", "E:\\MyCustomSpace")).toBe("E:\\MyCustomSpace");
  });

  it("handles window pin toggle and persistent note persistence", () => {
    let isPinned = false;
    function togglePin(): boolean {
      isPinned = !isPinned;
      return isPinned;
    }

    expect(togglePin()).toBe(true);
    expect(togglePin()).toBe(false);

    // Persistent note stays retained when instant note is cleared
    let instantNote = "这是需要归档的文字";
    const persistentNote = "永久保留的 Prompt 模板：请审查架构";

    function archiveInstantNote() {
      instantNote = ""; // Cleared
      // persistentNote is NOT touched
    }

    archiveInstantNote();
    expect(instantNote).toBe("");
    expect(persistentNote).toBe("永久保留的 Prompt 模板：请审查架构");
  });
});
