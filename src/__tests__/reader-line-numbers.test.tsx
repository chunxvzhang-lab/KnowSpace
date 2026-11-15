import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReaderPane } from "../components/ReaderPane";
import { renderMarkdown } from "../services/markdown";

afterEach(cleanup);

const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
beforeEach(() => {
  Object.defineProperty(Range.prototype, "getClientRects", { configurable: true, value: () => [] });
});
afterEach(() => {
  if (rangeRects) Object.defineProperty(Range.prototype, "getClientRects", rangeRects);
  else Reflect.deleteProperty(Range.prototype, "getClientRects");
});

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });

async function mountReader(height = 200, markdown = "# Heading\n\nParagraph.\n\n\n- [ ] Task\n") {
  const chapter = await renderMarkdown(markdown);
  const containerRef = { current: null as HTMLElement | null };
  const props = {
    chapter,
    containerRef,
    fontScale: 1,
    mermaidTheme: "default" as const,
    onMermaidError: () => {},
    showLineNumbers: true,
  };
  const result = render(<ReaderPane {...props} />);
  const pane = containerRef.current!;
  const article = result.container.querySelector("article")!;
  Object.defineProperty(pane, "clientHeight", { value: 500 });
  Object.defineProperty(article, "clientHeight", { value: height });
  pane.getBoundingClientRect = () => ({ top: 0, left: 0 }) as DOMRect;
  article.getBoundingClientRect = () => ({ top: -pane.scrollTop, left: 12 }) as DOMRect;
  Object.assign(article.style, { lineHeight: "20px", paddingTop: "20px", paddingBottom: "20px" });
  await flushFrame();
  return { ...result, props, pane, article };
}

const numbers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".reader-line-numbers span"), (el) =>
    Number(el.textContent),
  );

describe("reading line numbers", () => {
  it("shows the first number for an empty document", async () => {
    const { container } = await mountReader(40, "");
    expect(numbers(container)).toEqual([1]);
  });

  it("numbers every reading row, including blank spacing, without modifying source anchors or content", async () => {
    const { container, article } = await mountReader();
    expect(numbers(container)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(article.querySelectorAll(".reader-line-numbers")).toHaveLength(0);
    expect(article.querySelector('p[data-source-line="3"]')?.textContent).toBe("Paragraph.");
    expect(article.querySelector('ul[data-source-line="6"]')).not.toBeNull();
    expect(container.querySelector(".reader-line-numbers")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("centers numbers on rendered text lines while retaining blank rows", async () => {
    let paragraphTop = 70;
    const previous = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value(this: Range) {
        const text = this.startContainer.textContent ?? "";
        const bounds = text.includes("Heading")
          ? [[22, 50]]
          : text.includes("Paragraph")
            ? [
                [paragraphTop, paragraphTop + 16],
                [90, 106],
              ]
            : text.includes("Task")
              ? [[150, 166]]
              : [];
        return bounds.map(([top, bottom]) => ({ top, bottom, width: 40, height: bottom - top }));
      },
    });
    try {
      const { container, article } = await mountReader();
      const markers = [...container.querySelectorAll<HTMLElement>(".reader-line-numbers span")];
      const centers = markers.map(
        (marker) =>
          Number.parseFloat(marker.style.top) + Number.parseFloat(marker.style.height) / 2,
      );
      for (const center of [36, 78, 98, 158]) expect(centers).toContain(center);
      expect(markers.length).toBeGreaterThan(4);
      expect(numbers(container)).toEqual(markers.map((_, index) => index + 1));
      paragraphTop = 72;
      article.querySelector("p")!.textContent = "Paragraph updated without resizing the article.";
      await flushFrame();
      await flushFrame();
      const updatedCenters = [
        ...container.querySelectorAll<HTMLElement>(".reader-line-numbers span"),
      ].map(
        (marker) =>
          Number.parseFloat(marker.style.top) + Number.parseFloat(marker.style.height) / 2,
      );
      expect(updatedCenters).toContain(80);
      expect(updatedCenters).not.toContain(78);
    } finally {
      if (previous) Object.defineProperty(Range.prototype, "getClientRects", previous);
      else Reflect.deleteProperty(Range.prototype, "getClientRects");
    }
  });

  it("keeps a bounded gutter and continues numbering when scrolling through a long document", async () => {
    const { container, pane } = await mountReader(20040);
    pane.scrollTop = 10000;
    fireEvent.scroll(pane);
    await flushFrame();
    const visible = numbers(container);
    expect(visible[0]).toBeGreaterThan(490);
    expect(visible.length).toBeLessThan(30);
    expect(visible.every((line, index) => index === 0 || line === visible[index - 1] + 1)).toBe(
      true,
    );
    pane.scrollTop = 19540;
    fireEvent.scroll(pane);
    await flushFrame();
    expect(numbers(container).at(-1)).toBe(1000);
  });

  it("retains overlapping text row numbers when a virtual window changes", async () => {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value(this: Range) {
        const top = this.startContainer.textContent === "First" ? 50 : 100;
        return [{ top, bottom: top + 16, height: 16, width: 40 }];
      },
    });
    const { container, article } = await mountReader(200, "First\n\nSecond");
    const spacer = document.createElement("div");
    spacer.setAttribute("data-v-slot", "st");
    article.prepend(spacer);
    await flushFrame();
    await flushFrame();
    const numberAtSecond = () =>
      [...container.querySelectorAll<HTMLElement>(".reader-line-numbers span")].find(
        (marker) =>
          Number.parseFloat(marker.style.top) + Number.parseFloat(marker.style.height) / 2 === 108,
      )?.textContent;
    const before = numberAtSecond();
    expect(before).toBeDefined();
    article.querySelector("p")!.remove();
    await flushFrame();
    await flushFrame();
    expect(numberAtSecond()).toBe(before);
  });

  it("removes the gutter when disabled and measures again after font size changes", async () => {
    const { container, rerender, props, article } = await mountReader();
    rerender(<ReaderPane {...props} showLineNumbers={false} />);
    expect(container.querySelector(".reader-line-numbers")).toBeNull();
    article.style.lineHeight = "40px";
    rerender(<ReaderPane {...props} fontScale={2} />);
    await flushFrame();
    expect(numbers(container)).toEqual([1, 2, 3, 4]);
  });

  it("measures the new article when switching documents with identical content", async () => {
    const { container, rerender, props, pane, article } = await mountReader();
    rerender(<ReaderPane {...props} documentKey="another.md" />);
    const nextArticle = container.querySelector("article")!;
    expect(nextArticle).not.toBe(article);
    Object.defineProperty(nextArticle, "clientHeight", { value: 280 });
    nextArticle.getBoundingClientRect = () => ({ top: -pane.scrollTop, left: 12 }) as DOMRect;
    Object.assign(nextArticle.style, {
      lineHeight: "20px",
      paddingTop: "20px",
      paddingBottom: "20px",
    });
    await flushFrame();
    expect(numbers(container)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
  });
});
