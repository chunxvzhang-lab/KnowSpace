import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasView } from "../components/CanvasView";
import type { CanvasData } from "../types/canvasTypes";

/**
 * The card body's two live controls — checkboxes and [[links]] — and the
 * textarea's reference picker.
 *
 * The click on a checkbox is the one that kept breaking in a real browser while
 * every jsdom test stayed green: the canvas root's mousedown armed a pan, the
 * mouseup cleared the selection, the re-render rewrote the card's markdown, and
 * the rewritten markdown was a brand-new checkbox the click never landed on.
 * So the tests here pin the two halves of that fix (the press is the control's,
 * the card body survives unrelated re-renders) as well as the behaviour itself.
 */
const checklistData: CanvasData = {
  nodes: [
    {
      id: "node-1",
      type: "text",
      text: "# 清单\n\n- [ ] 第一项\n- [ ] 第二项\n",
      x: 100,
      y: 100,
      width: 280,
      height: 180,
      color: "4",
    },
  ],
  edges: [],
};

const chapters = [
  { id: "a", title: "笔记甲", src: "notes/a.md", absolutePath: "C:/vault/notes/a.md" },
  { id: "b", title: "笔记乙", src: "notes/b.md", absolutePath: "C:/vault/notes/b.md" },
];

function renderCanvas(overrides: Partial<Parameters<typeof CanvasView>[0]> = {}) {
  const onSourceChange = vi.fn();
  const utils = render(
    <CanvasView
      title="清单测试"
      source={JSON.stringify(checklistData)}
      onSourceChange={onSourceChange}
      onOpenFile={vi.fn()}
      allChapters={chapters}
      editable={true}
      theme="twitter"
      {...overrides}
    />
  );
  return { onSourceChange, ...utils };
}

const boxes = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

const lastWritten = (onSourceChange: ReturnType<typeof vi.fn>): CanvasData =>
  JSON.parse(onSourceChange.mock.calls.at(-1)![0] as string);

describe("canvas card checklist", () => {
  it("clicking a checkbox toggles its line in the Markdown", () => {
    const { onSourceChange } = renderCanvas();
    expect(boxes().length).toBe(2);

    act(() => {
      fireEvent.click(boxes()[0]);
    });
    expect(onSourceChange).toHaveBeenCalled();
    const written = lastWritten(onSourceChange);
    expect(written.nodes[0]).toMatchObject({ type: "text" });
    expect((written.nodes[0] as { text: string }).text).toContain("- [x] 第一项");
    expect((written.nodes[0] as { text: string }).text).toContain("- [ ] 第二项");
  });

  it("clicking it again clears it again, and leaves the other line alone", () => {
    const { onSourceChange } = renderCanvas();
    act(() => {
      fireEvent.click(boxes()[1]);
    });
    const once = (lastWritten(onSourceChange).nodes[0] as { text: string }).text;
    expect(once).toContain("- [x] 第二项");
    expect(once).toContain("- [ ] 第一项");

    act(() => {
      fireEvent.click(boxes()[1]);
    });
    const twice = (lastWritten(onSourceChange).nodes[0] as { text: string }).text;
    expect(twice).toContain("- [ ] 第二项");
  });

  it("a press on a checkbox is not a press on the canvas", () => {
    // The mouseup that follows a press on the background clears the selection;
    // a press on a checkbox must not get that far, or the re-render it causes
    // replaces the very checkbox that is mid-click.
    renderCanvas();
    const card = document.querySelector(".canvas-node.card-text") as HTMLElement;
    act(() => {
      fireEvent.mouseDown(card);
    });
    act(() => {
      fireEvent.mouseUp(document.querySelector(".knowspace-canvas-view") as HTMLElement);
    });
    // Nothing was selected, so the observable half of the guard is that the
    // checkbox is still the same element after the whole press-release cycle.
    const before = boxes()[0];
    act(() => {
      fireEvent.mouseDown(before);
      fireEvent.mouseUp(before);
    });
    expect(boxes()[0]).toBe(before);
  });

  it("the card body survives a re-render that has nothing to do with it", () => {
    // Hovering a card re-renders the canvas. The markdown must not be rewritten
    // by it — a rewritten markdown is a new checkbox, and a new checkbox cannot
    // be clicked.
    renderCanvas();
    const before = boxes()[0];
    const card = document.querySelector(".canvas-node.card-text") as HTMLElement;
    act(() => {
      fireEvent.mouseEnter(card);
    });
    act(() => {
      fireEvent.mouseLeave(card);
    });
    expect(boxes()[0]).toBe(before);
  });
});

describe("canvas card reference picker", () => {
  const openEditor = () => {
    const card = document.querySelector(".canvas-card-markdown") as HTMLElement;
    act(() => {
      fireEvent.dblClick(card);
    });
    return document.querySelector("textarea") as HTMLTextAreaElement;
  };

  it("typing / lists the workspace's notes, and Enter inserts one", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 /" } });
    });
    const menu = document.querySelector(".canvas-card-ref-menu") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(menu.textContent).toContain("笔记甲");
    expect(menu.textContent).toContain("笔记乙");

    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 /乙" } });
    });
    expect(
      (document.querySelector(".canvas-card-ref-menu") as HTMLElement).textContent
    ).not.toContain("笔记甲");

    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(textarea.value).toBe("参见 [[笔记乙]]");
    expect(document.querySelector(".canvas-card-ref-menu")).toBeNull();
  });

  it("[[ opens the same picker, and Escape closes it", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "[[" } });
    });
    expect(document.querySelector(".canvas-card-ref-menu")).toBeTruthy();
    act(() => {
      fireEvent.keyDown(textarea, { key: "Escape" });
    });
    expect(document.querySelector(".canvas-card-ref-menu")).toBeNull();
  });

  it("a slash in the middle of a path is just a slash", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "notes/a.md 里的内容" } });
    });
    expect(document.querySelector(".canvas-card-ref-menu")).toBeNull();
  });

  it("Ctrl+Enter finishes the edit instead of reopening it", () => {
    // The global canvas shortcuts used to swallow the Enter that closes the
    // editor and open it straight back, so saving appeared to do nothing.
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "# 清单\n\n改过的内容" } });
    });
    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });
    });
    expect(document.querySelector("textarea")).toBeNull();
    const card = document.querySelector(".canvas-card-markdown") as HTMLElement;
    expect(card.textContent).toContain("改过的内容");
  });
});
