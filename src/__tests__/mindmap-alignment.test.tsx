import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MindmapView } from "../components/MindmapView";
import { measureTextWidth } from "../services/mindmapService";

/**
 * Regression guard: node label alignment must be applied via INLINE style,
 * because author CSS (e.g. a class rule with `text-anchor: middle`) overrides
 * SVG presentation attributes and silently forced every align mode to middle,
 * making left-aligned labels overflow the node border.
 */
const source = [
  "# 根主题 <!-- style: align=center -->",
  "",
  "- 左对齐节点 <!-- style: align=left -->",
  "- 右对齐节点 <!-- style: align=right -->",
  "- 粗体节点 <!-- style: bold=bold -->",
].join("\n");

describe("Mind map node text alignment rendering", () => {
  it("applies the chosen text-anchor as inline style on each node label", () => {
    const { container } = render(
      <MindmapView title="Test" source={source} editable={false} />
    );

    const labels = Array.from(
      container.querySelectorAll<SVGTextElement>("text.mindmap-node-title-text")
    );
    expect(labels.length).toBeGreaterThanOrEqual(4);

    const anchorFor = (text: string) => {
      const el = labels.find((l) => l.textContent?.includes(text));
      expect(el, `label for ${text} not found`).toBeTruthy();
      return el!.style.textAnchor;
    };

    expect(anchorFor("根主题")).toBe("middle");
    expect(anchorFor("左对齐节点")).toBe("start");
    expect(anchorFor("右对齐节点")).toBe("end");

    // Vertical centering must not rely on the removed CSS dominant-baseline rule.
    for (const el of labels) {
      expect(el.style.dominantBaseline).toBe("central");
    }
  });

  it("does not render floating plus button next to expand/collapse button", () => {
    const { container } = render(
      <MindmapView title="Test" source={source} editable={true} />
    );
    expect(container.querySelector(".mindmap-node-add-btn")).toBeNull();
  });
});

describe("measureTextWidth metrics", () => {
  it("widens the estimate for bold text and ASCII-heavy strings", () => {
    expect(measureTextWidth("WWW www ###", 13, true)).toBeGreaterThan(
      measureTextWidth("WWW www ###", 13)
    );
    // ASCII estimate (~0.79x font size) must stay below the actual rendered
    // advance width of a bold Segoe UI string, so nodes stop clipping borders.
    expect(measureTextWidth("m", 13)).toBeCloseTo(13 * 1.05 * 0.75, 1);
  });
});
