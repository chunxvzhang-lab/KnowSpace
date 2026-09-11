import { describe, it, expect, beforeEach, vi } from "vitest";
import mermaid from "mermaid";
import { renderMermaid, clearMermaidCache } from "../services/mermaid";

describe("mermaid Service Sub-function Tests", () => {
  beforeEach(() => {
    clearMermaidCache();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("handles empty container without throwing", async () => {
    const container = document.createElement("div");
    await expect(renderMermaid(container)).resolves.not.toThrow();
  });

  it("extracts source from data-mermaid-src attribute and renders diagram", async () => {
    vi.spyOn(mermaid, "render").mockResolvedValue({
      svg: '<svg class="mermaid-mock-svg"><g>diagram</g></svg>',
      bindFunctions: undefined,
      diagramType: "flowchart-v2",
    });

    const container = document.createElement("div");
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    const rawCode = "graph TD\nA-->B";
    pre.setAttribute("data-mermaid-src", btoa(rawCode));
    container.appendChild(pre);
    document.body.appendChild(container);

    await renderMermaid(container, { theme: "default" });

    expect(pre.getAttribute("data-mermaid-theme")).toBe("default");
    expect(pre.classList.contains("mermaid-rendered")).toBe(true);
    expect(pre.innerHTML).toContain("<svg");
  });

  it("handles render errors gracefully with fallback UI", async () => {
    vi.spyOn(mermaid, "render").mockRejectedValue(new Error("Syntax error"));

    const container = document.createElement("div");
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.textContent = "invalid syntax @#$";
    container.appendChild(pre);

    await renderMermaid(container, { theme: "dark" });

    expect(pre.classList.contains("mermaid-error")).toBe(true);
    expect(pre.innerHTML).toContain("Mermaid 渲染失败");
  });

  it("clears cached diagram SVGs upon clearMermaidCache", async () => {
    clearMermaidCache();
    expect(() => clearMermaidCache()).not.toThrow();
  });
});
