import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import { EditorPane } from "../components/EditorPane";
import { ViewModeControl } from "../components/ViewModeControl";
import { DocumentWorkspace } from "../components/DocumentWorkspace";
import { createRef } from "react";
import { EditorSelection } from "@codemirror/state";
import { listCommands } from "../core/commands";
import { useEditorEditActions } from "../components/editor-menu/useEditorEditActions";
import { renderHook } from "@testing-library/react";
import { useUiStore } from "../store/useUiStore";

afterEach(cleanup);

function mount(source: string, livePreviewMode = true, readOnly = false) {
  let view: EditorView;
  const onChange = vi.fn();
  const props = {
    value: source,
    onChange,
    theme: "light" as const,
    livePreviewMode,
    readOnly,
    onEditorViewReady: (editor: EditorView | null) => {
      if (editor) view = editor;
    },
  };
  const result = render(<EditorPane {...props} />);
  return { ...result, view: view!, props, onChange };
}

describe("live Markdown editing", () => {
  it("undoes each formatting shortcut independently from preceding edits", () => {
    const { view } = mount("text");
    act(() =>
      view.dispatch({ changes: { from: 4, insert: "中文" }, selection: { anchor: 0, head: 6 } }),
    );
    fireEvent.keyDown(view.contentDOM, { key: "b", code: "KeyB", ctrlKey: true });
    fireEvent.keyDown(view.contentDOM, { key: "i", code: "KeyI", ctrlKey: true });
    expect(view.state.doc.toString()).toBe("***text中文***");
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe("**text中文**");
    act(() => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe("text中文");
  });
  it("uses the list continuation command ahead of the Markdown language Enter binding", () => {
    const source = "9. [X] completed";
    const { view } = mount(source);
    act(() => view.dispatch({ selection: { anchor: source.length } }));
    fireEvent.keyDown(view.contentDOM, { key: "Enter", code: "Enter" });
    expect(view.state.doc.toString()).toBe("9. [X] completed\n10. [ ] ");
  });
  it("inserts an asynchronously saved image at the mapped paste position and reports failures", async () => {
    let finish!: (result: unknown) => void;
    const savePastedImage = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const previous = window.knowSpaceDesktop;
    Object.assign(window, { knowSpaceDesktop: { capture: { savePastedImage } } });
    try {
      const { view } = mount("abcd");
      const paste = () =>
        fireEvent.paste(view.contentDOM, {
          clipboardData: {
            items: [
              {
                type: "image/png",
                getAsFile: () => new File(["image"], "image.png", { type: "image/png" }),
              },
            ],
          },
        });
      act(() => view.dispatch({ selection: { anchor: 2 } }));
      paste();
      await waitFor(() => expect(savePastedImage).toHaveBeenCalledTimes(1));
      act(() => view.dispatch({ changes: { from: 0, insert: "NEW" }, selection: { anchor: 7 } }));
      await act(async () =>
        finish({ success: true, relativePath: "assets/image.png", fileName: "image" }),
      );
      expect(view.state.doc.toString()).toBe("NEWab![image](assets/image.png)\ncd");
      const source = view.state.doc.toString();
      paste();
      await waitFor(() => expect(savePastedImage).toHaveBeenCalledTimes(2));
      await act(async () => finish({ success: false, error: "test failure" }));
      expect(view.state.doc.toString()).toBe(source);
      expect(useUiStore.getState().notice).toBe("图片插入失败，请重试。");
    } finally {
      Object.assign(window, { knowSpaceDesktop: previous });
      useUiStore.getState().setNotice(null);
    }
  });

  it("removes split and source entry points from the toolbar and command catalogue", () => {
    render(<ViewModeControl mode="live" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^分屏$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^源码$/ })).toBeNull();
    expect(
      listCommands().some((command) => ["view.split", "view.source"].includes(command.id)),
    ).toBe(false);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    "renders level %i headings and reveals their source on entry",
    (level) => {
      const source = `start\n${"#".repeat(level)} 标题`;
      const { container, view } = mount(source);
      expect(container.querySelector(`.cm-live-h${level}`)?.textContent).toBe("标题");
      act(() => view.dispatch({ selection: { anchor: source.length } }));
      expect(container.querySelector(`.cm-live-h${level}`)?.textContent).toBe(
        `${"#".repeat(level)} 标题`,
      );
    },
  );

  it("reveals every selected line for multiple carets without losing the original text", () => {
    const source = "start\n**one**\n*two*\n~~three~~";
    const { container, view } = mount(source);
    act(() =>
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.cursor(source.indexOf("one")),
          EditorSelection.cursor(source.indexOf("two")),
        ]),
      }),
    );
    expect(container.querySelector(".cm-live-strong")).toBeNull();
    expect(container.querySelector(".cm-live-emphasis")).toBeNull();
    expect(container.querySelector(".cm-live-strike")?.textContent).toBe("three");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("leaves table, math, Mermaid and HTML source available for editing", () => {
    const source =
      "start\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n$$x^2$$\n\n```mermaid\ngraph TD; A-->B\n```\n\n<div>==literal==</div>";
    const { container, view } = mount(source);
    expect(container.textContent).toContain("| A | B |");
    expect(container.textContent).toContain("$$x^2$$");
    expect(container.textContent).toContain("graph TD; A-->B");
    expect(container.querySelector(".cm-live-highlight")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("protects read-only context actions, while allowing external reload and readonly changes", () => {
    const { view, props, rerender, onChange } = mount("content", true, true);
    const { result } = renderHook(() => useEditorEditActions({ view, onClose: vi.fn() }));
    act(() => {
      result.current.wrapSelection("**");
      result.current.insertAtCursor("bad");
      result.current.toggleCenterAlign();
      result.current.transformLinePrefix(/^/, "# ");
    });
    expect(view.state.doc.toString()).toBe("content");
    expect(onChange).not.toHaveBeenCalled();
    rerender(<EditorPane {...props} value="disk reload" />);
    expect(view.state.doc.toString()).toBe("disk reload");
    rerender(<EditorPane {...props} value="disk reload" readOnly={false} />);
    fireEvent.keyDown(view.contentDOM, { key: "b", code: "KeyB", ctrlKey: true });
    expect(view.state.doc.toString()).toContain("**文字**");
  });

  it("renders inactive formatting and reveals the current line without rewriting Markdown", () => {
    const source = "start\n# 标题\n**加粗**与*斜体*和~~删除~~\n`code`\n> 引用\n- 项目";
    const { container, view, onChange } = mount(source);
    expect(container.querySelector(".cm-live-h1")?.textContent).toBe("标题");
    expect(container.querySelector(".cm-live-strong")?.textContent).toBe("加粗");
    expect(container.querySelector(".cm-live-inline-code")?.textContent).toBe("code");
    expect(container.querySelector(".cm-live-quote")?.textContent).toBe("引用");
    expect(container.querySelector(".cm-live-bullet")?.textContent).toBe("•");
    act(() => view.dispatch({ selection: { anchor: source.indexOf("加粗") } }));
    expect(container.querySelectorAll(".cm-line")[2].textContent).toBe(
      "**加粗**与*斜体*和~~删除~~",
    );
    expect(view.state.doc.toString()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves selection and undo history across source / live mode changes", () => {
    const { view, props, rerender, container } = mount("first\n**text**", false);
    expect(container.querySelector(".cm-live-strong")).toBeNull();
    act(() => view.dispatch({ changes: { from: 5, insert: "中文" }, selection: { anchor: 7 } }));
    const source = view.state.doc.toString();
    rerender(<EditorPane {...props} value={source} livePreviewMode />);
    expect(container.querySelector(".cm-live-strong")?.textContent).toBe("text");
    expect(view.state.selection.main.head).toBe(7);
    rerender(<EditorPane {...props} value={source} livePreviewMode={false} />);
    expect(container.querySelector(".cm-live-strong")).toBeNull();
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe("first\n**text**");
  });

  it("toggles exactly the clicked task and supports undo, including after text shifts", () => {
    const { container, view, onChange } = mount("start\n- [ ] 一\n- [X] 二");
    fireEvent.click(container.querySelectorAll("input.cm-live-task")[0]);
    expect(view.state.doc.toString()).toBe("start\n- [x] 一\n- [X] 二");
    expect(onChange).toHaveBeenLastCalledWith("start\n- [x] 一\n- [X] 二");
    act(() => {
      undo(view);
    });
    act(() => view.dispatch({ changes: { from: 0, insert: "中文" }, selection: { anchor: 0 } }));
    fireEvent.click(container.querySelectorAll("input.cm-live-task")[1]);
    expect(view.state.doc.toString()).toBe("中文start\n- [ ] 一\n- [ ] 二");
  });

  it("keeps task widgets disabled in read-only documents", () => {
    const { container, onChange, view } = mount("start\n- [ ] task", true, true);
    const checkbox = container.querySelector<HTMLInputElement>("input.cm-live-task")!;
    expect(checkbox.disabled).toBe(true);
    fireEvent.click(checkbox);
    expect(view.state.doc.toString()).toBe("start\n- [ ] task");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects formatting shortcuts and list continuation in read-only documents", () => {
    const source = "- task";
    const { view, onChange } = mount(source, true, true);
    act(() => view.dispatch({ selection: { anchor: source.length } }));
    fireEvent.keyDown(view.contentDOM, { key: "b", code: "KeyB", ctrlKey: true });
    fireEvent.keyDown(view.contentDOM, { key: "Enter", code: "Enter" });
    expect(view.state.doc.toString()).toBe(source);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves code, escaped markers, incomplete links and images as source", () => {
    const source =
      "start\n```md\n# heading\n**bold** [[note]] ==mark==\n```\n`[[code]] ==code==`\n\\*literal\\*\n[unfinished](\n![image](assets/a.png)";
    const { container, view } = mount(source);
    expect(container.querySelector(".cm-live-h1")).toBeNull();
    expect(container.querySelector(".cm-live-strong")).toBeNull();
    expect(container.querySelector(".cm-live-link")).toBeNull();
    expect(container.querySelector(".cm-live-highlight")).toBeNull();
    expect(container.textContent).toContain("**bold** [[note]] ==mark==");
    expect(container.textContent).toContain("![image](assets/a.png)");
    expect(view.state.doc.toString()).toBe(source);
  });

  it("renders links, wiki aliases and highlights while revealing selected lines", () => {
    const source = "start\n[网站](https://example.com)\n[[笔记|别名]] 与 ==重点==";
    const { container, view } = mount(source);
    expect([...container.querySelectorAll(".cm-live-link")].map((el) => el.textContent)).toEqual([
      "网站",
      "别名",
    ]);
    expect(container.querySelector(".cm-live-highlight")?.textContent).toBe("重点");
    act(() => view.dispatch({ selection: { anchor: 6, head: source.length } }));
    expect(container.querySelector(".cm-live-link")).toBeNull();
    expect(container.textContent).toContain("[[笔记|别名]] 与 ==重点==");
  });

  it("handles empty documents and exposes a selectable live preview mode", () => {
    const { view } = mount("");
    expect(view.state.doc.toString()).toBe("");
    const onChange = vi.fn();
    render(<ViewModeControl mode="read" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "实时预览" }));
    expect(onChange).toHaveBeenCalledWith("live");
  });

  it("preserves escaped custom syntax and multiline link source", () => {
    const source = "start\n\\[[literal]] \\==literal==\n[link](\nhttps://example.com)\n![[embed]]";
    const { container, view } = mount(source);
    expect(container.querySelector(".cm-live-link")).toBeNull();
    expect(container.querySelector(".cm-live-highlight")).toBeNull();
    expect(view.state.doc.toString()).toBe(source);
  });

  it("retains the same editor, caret and undo history when returning from reading view", () => {
    let view: EditorView;
    const props = {
      source: "original",
      onSourceChange: vi.fn(),
      renderedChapter: null,
      containerRef: createRef<HTMLElement>(),
      theme: "light" as const,
      fontScale: 1,
      currentFilePath: "C:/test/first.md",
      mermaidTheme: "default" as const,
      onMermaidError: vi.fn(),
      onEditorViewReady: (editor: EditorView | null) => {
        if (editor) view = editor;
      },
    };
    const { rerender, container } = render(<DocumentWorkspace {...props} viewMode="live" />);
    const originalView = view!;
    act(() => view.dispatch({ changes: { from: 8, insert: "中文" }, selection: { anchor: 10 } }));
    const source = view!.state.doc.toString();
    rerender(<DocumentWorkspace {...props} source={source} viewMode="read" />);
    expect((container.querySelector(".editor-section") as HTMLElement).style.display).toBe("none");
    rerender(<DocumentWorkspace {...props} source={source} viewMode="live" />);
    expect(view!).toBe(originalView);
    expect(view!.state.selection.main.head).toBe(10);
    act(() => {
      expect(undo(view!)).toBe(true);
    });
    expect(view!.state.doc.toString()).toBe("original");
    rerender(
      <DocumentWorkspace
        {...props}
        source="another document"
        currentFilePath="C:/test/second.md"
        viewMode="live"
      />,
    );
    expect(view!).not.toBe(originalView);
    expect(view!.state.doc.toString()).toBe("another document");
    act(() => {
      expect(undo(view!)).toBe(false);
    });
  });
});
