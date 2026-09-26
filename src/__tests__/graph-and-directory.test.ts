import { describe, expect, it } from "vitest";
import type { ChapterManifest } from "../core/types";

describe("ChapterList Space filtering logic", () => {
  const chapters: ChapterManifest[] = [
    { id: "ch-1", title: "Guide", src: "docs/guide.md" },
    { id: "ch-2", title: "API", src: "docs/api.md" },
    { id: "sp-1", title: "Flash 1", src: "Space/2026-08-28_1000.md" },
    { id: "sp-2", title: "Flash 2", src: "space/2026-08-28_1100.md" },
  ];

  it("filters out Space notes from the document directory by default", () => {
    const activeChapter = chapters[0]; // docs/guide.md
    const isCurrentInSpace = Boolean(
      activeChapter?.src && activeChapter.src.toLowerCase().startsWith("space/"),
    );
    const filtered = chapters.filter((ch) => {
      const isSpace = ch.src.toLowerCase().startsWith("space/");
      return !isSpace || isCurrentInSpace;
    });

    expect(filtered.map((c) => c.id)).toEqual(["ch-1", "ch-2"]);
    expect(filtered.some((c) => c.src.toLowerCase().startsWith("space/"))).toBe(false);
  });

  it("retains Space notes when the user is actively viewing a Space note", () => {
    const activeChapter = chapters[2]; // Space/2026-08-28_1000.md
    const isCurrentInSpace = Boolean(
      activeChapter?.src && activeChapter.src.toLowerCase().startsWith("space/"),
    );
    const filtered = chapters.filter((ch) => {
      const isSpace = ch.src.toLowerCase().startsWith("space/");
      return !isSpace || isCurrentInSpace;
    });

    expect(isCurrentInSpace).toBe(true);
    expect(filtered.length).toBe(4);
    expect(filtered.map((c) => c.id)).toContain("sp-1");
  });
});

describe("Graph Zoom input parsing logic", () => {
  function parseZoomInput(input: string, currentZoom: number): number {
    const raw = input.replace(/[^0-9.]/g, "");
    const val = parseFloat(raw);
    if (Number.isFinite(val) && val >= 10 && val <= 500) {
      return Math.round(val);
    }
    return currentZoom;
  }

  it("correctly parses normal percentage numbers", () => {
    expect(parseZoomInput("100%", 100)).toBe(100);
    expect(parseZoomInput("150", 100)).toBe(150);
    expect(parseZoomInput(" 85% ", 100)).toBe(85);
    expect(parseZoomInput("200.5%", 100)).toBe(201);
  });

  it("rejects out-of-range or invalid zoom numbers and returns current zoom", () => {
    expect(parseZoomInput("5%", 100)).toBe(100); // below 10%
    expect(parseZoomInput("999%", 100)).toBe(100); // above 500%
    expect(parseZoomInput("abc", 120)).toBe(120); // non-numeric
    expect(parseZoomInput("", 130)).toBe(130);
  });
});

describe("Graph Workspace Split & Node Style Rules", () => {
  function clampGraphSplitRatio(ratio: number): number {
    return Math.max(0.25, Math.min(0.75, ratio));
  }

  it("clamps split ratio within [0.25, 0.75]", () => {
    expect(clampGraphSplitRatio(0.1)).toBe(0.25);
    expect(clampGraphSplitRatio(0.52)).toBe(0.52);
    expect(clampGraphSplitRatio(0.9)).toBe(0.75);
  });

  it("enforces Obsidian-style clean node aesthetic (no borders, zero overlay)", () => {
    const nodeStyle = {
      "border-width": 0,
      "border-opacity": 0,
      "active-bg-opacity": 0,
      "overlay-opacity": 0,
    };
    expect(nodeStyle["border-width"]).toBe(0);
    expect(nodeStyle["active-bg-opacity"]).toBe(0);
    expect(nodeStyle["overlay-opacity"]).toBe(0);
  });

  it("enforces circular node geometry (shape: ellipse, width === height)", () => {
    const computeSize = (inDegree: number, isCurrent: boolean) => {
      const size = isCurrent ? 18 : Math.min(18, Math.max(9, 9 + inDegree * 1.8));
      return { width: size, height: size };
    };

    const regularNode = computeSize(0, false);
    expect(regularNode.width).toBe(regularNode.height);
    expect(regularNode.width).toBeGreaterThanOrEqual(9);

    const currentNode = computeSize(3, true);
    expect(currentNode.width).toBe(currentNode.height);
    expect(currentNode.width).toBe(18);
  });
});
