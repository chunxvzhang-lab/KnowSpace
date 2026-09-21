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

describe("canvas card suggestion popup", () => {
  const openEditor = () => {
    const card = document.querySelector(".canvas-card-markdown") as HTMLElement;
    act(() => {
      fireEvent.dblClick(card);
    });
    return document.querySelector("textarea") as HTMLTextAreaElement;
  };

  const menu = () => document.querySelector(".canvas-card-suggest-menu") as HTMLElement | null;

  it("[[ lists the workspace's notes, and Enter inserts one", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 [[" } });
    });
    expect(menu()).toBeTruthy();
    expect(menu()!.textContent).toContain("笔记甲");
    expect(menu()!.textContent).toContain("笔记乙");

    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 [[乙" } });
    });
    expect(menu()!.textContent).not.toContain("笔记甲");

    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(textarea.value).toBe("参见 [[笔记乙]]");
    expect(menu()).toBeNull();
  });

  it("typing / opens the command list, and Enter inserts the template", () => {
    // The card's `/` is the document editor's `/`: the same command list, so a
    // command learned in one place works in the other.
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "清单 /todo" } });
    });
    expect(menu()).toBeTruthy();
    expect(menu()!.textContent).toContain("待办清单");

    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(textarea.value).toBe("清单 - [ ] 待办事项内容\n");
    expect(menu()).toBeNull();
  });

  it("the command list is searchable, and Escape closes it", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "/" } });
    });
    expect(menu()!.textContent).toContain("一级标题");
    expect(menu()!.textContent).toContain("待办清单");

    act(() => {
      fireEvent.change(textarea, { target: { value: "/闪卡" } });
    });
    expect(menu()!.textContent).toContain("闪卡");
    expect(menu()!.textContent).not.toContain("一级标题");

    act(() => {
      fireEvent.keyDown(textarea, { key: "Escape" });
    });
    expect(menu()).toBeNull();
  });

  it("picking [[]] from the command list offers the notes straight away", () => {
    // The document editor chains the two, so the card does too.
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "/wiki" } });
    });
    expect(menu()!.textContent).toContain("双向链接");

    act(() => {
      fireEvent.keyDown(textarea, { key: "Enter" });
    });
    expect(textarea.value).toBe("[[]]");
    // Now inside the brackets, so the note picker takes over.
    expect(menu()).toBeTruthy();
    expect(menu()!.textContent).toContain("笔记甲");
  });

  it("a slash in the middle of a path is just a slash", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "notes/a.md 里的内容" } });
    });
    expect(menu()).toBeNull();
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

  /**
   * The popup is capped at 260px, so arrowing past the bottom used to move the
   * highlight somewhere the reader could not see: the popup looked like it had
   * stopped responding, and the only way to find the selection again was to arrow
   * back up.
   *
   * jsdom lays nothing out, so these tests cannot check *where* the list scrolled
   * to. What they can check is the half that breaks silently: that the row which
   * is now highlighted is the row that was asked to scroll into view, and that the
   * argument asks for the minimal scroll. A stale index would scroll the row the
   * reader just left, and `block: "start"` would yank the list to the top on every
   * arrow press.
   */
  const scrollSpyOn = () => vi.spyOn(Element.prototype, "scrollIntoView");
  const rowScrolledBy = (spy: ReturnType<typeof scrollSpyOn>) =>
    spy.mock.instances[0] as HTMLElement | undefined;

  it("arrowing the command list scrolls the newly highlighted row into view", () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "/" } });
    });
    // Installed after the popup opens: opening it already scrolls row 0, and that
    // call is not what this test is about.
    const spy = scrollSpyOn();
    const before = menu()!.querySelector('[aria-selected="true"]') as HTMLElement;

    act(() => {
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: "nearest" });
    const scrolled = rowScrolledBy(spy);
    // The row that moved is the one now highlighted...
    expect(scrolled?.getAttribute("aria-selected")).toBe("true");
    // ...and not the one that was highlighted before, which is what a stale index
    // produces.
    expect(scrolled).not.toBe(before);
    spy.mockRestore();
  });

  it("arrowing the note list scrolls it too, not just the command list", () => {
    // The two lists share one popup, so this is the same effect — but they are
    // reached by different keys, and only the command list was reported.
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 [[" } });
    });
    const spy = scrollSpyOn();

    act(() => {
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(rowScrolledBy(spy)?.getAttribute("aria-selected")).toBe("true");
    spy.mockRestore();
  });

  it("a re-render that does not move the selection does not scroll again", () => {
    // The reverse half of the pair above. The popup re-renders on every keystroke
    // and on every hover, and `items` is a fresh array on each of those renders —
    // so an effect that depended on the array, or that had no dependency list at
    // all, would scroll the list again each time and make it twitch under the
    // pointer. Re-selecting the row that is already selected produces exactly that
    // render: a new state object carrying the same index.
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "/" } });
    });
    const spy = scrollSpyOn();

    act(() => {
      fireEvent.keyDown(textarea, { key: "ArrowDown" });
    });
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.mouseEnter(menu()!.querySelector('[aria-selected="true"]') as HTMLElement);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  /**
   * A wheel over the popup is the popup's, not the whiteboard's.
   *
   * The popup is portalled to `document.body`, so the canvas's ownership check
   * (`services/wheelScrollGuard.ts`) cannot see it: that check walks up from the
   * event target to the canvas root, and this popup's ancestors are `body` and
   * `html`. The event still reaches the canvas, because React propagates through
   * the component tree rather than the DOM tree — which is exactly why the popup
   * scrolled and the whiteboard panned at the same time.
   */
  const wheelOn = async (target: HTMLElement) => {
    const world = document.querySelector(".canvas-world") as HTMLElement;
    const before = world.style.transform;
    await act(async () => {
      fireEvent.wheel(target, { deltaY: 120 });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    return { before, after: world.style.transform };
  };

  it("a wheel over the suggestion popup leaves the whiteboard where it is", async () => {
    renderCanvas();
    const textarea = openEditor();
    act(() => {
      fireEvent.change(textarea, { target: { value: "参见 [[" } });
    });
    const row = menu()!.querySelector("button") as HTMLElement;

    const { before, after } = await wheelOn(row);
    expect(after).toBe(before);
  });

  it("a wheel over the whiteboard still pans it", async () => {
    // The frame awaited above has to be the frame the canvas pans in, or the test
    // before this one would pass even if the wheel had been dropped on the floor.
    renderCanvas();
    const world = document.querySelector(".canvas-world") as HTMLElement;

    const { before, after } = await wheelOn(world);
    expect(after).not.toBe(before);
  });
});
