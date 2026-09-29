/**
 * The right-click "列表与段落排版" transforms at the document level.
 *
 * Regression anchor for the shipped bug (confirmed by screenshot, scripts/
 * repro-list-ui.cjs): transformLinePrefix stripped the old prefix with
 * `replace(pattern, "")` and then CONCATENATED a replacement string written
 * for `.replace` semantics - so every 转为标题/待办/无序/有序/引用 command
 * inserted the LITERAL TEXT `$1- ` into the document instead of a list
 * marker. Hence: no output may ever contain a "$1", the transforms must
 * produce real markdown (the "word 展示效果"), indentation must survive,
 * ordered lists must increment, and 转为普通文本 must cancel what the family
 * applies (the report's 无法取消).
 */
import { describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { EditorContextMenu } from "../components/EditorContextMenu";
import type { EditorView } from "@codemirror/view";

type LineInfo = { text: string; from: number; to: number; number: number };

function lineMap(text: string): LineInfo[] {
  const lines = text.split("\n");
  let pos = 0;
  return lines.map((t, i) => {
    const info = { text: t, from: pos, to: pos + t.length, number: i + 1 };
    pos += t.length + 1; // the newline
    return info;
  });
}

function docAfter(text: string, changes: { from: number; to: number; insert: string }[]) {
  let out = text;
  // Apply from the end backwards so earlier offsets stay valid.
  for (const ch of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, ch.from) + ch.insert + out.slice(ch.to);
  }
  return out;
}

function createView(text: string, selFrom: number, selTo: number) {
  const lines = lineMap(text);
  const doc = {
    toString: () => text,
    length: text.length,
    sliceString: (from: number, to: number) => text.slice(from, to),
    lineAt: (pos: number) =>
      lines.find((l) => pos >= l.from && pos <= l.to) ?? lines[lines.length - 1],
    line: (n: number) => lines[n - 1],
  };
  return {
    state: {
      doc,
      selection: { main: { from: selFrom, to: selTo, empty: selFrom === selTo } },
      sliceDoc: (from: number, to: number) => text.slice(from, to),
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn> };
}

const DOC = ["# 标题文档", "苹果", "香蕉", "", "  缩进橙子"].join("\n");
// Offsets into DOC for selecting lines 2-3 (苹果/香蕉).
const 苹果Line = lineMap(DOC)[1];
const 香蕉Line = lineMap(DOC)[2];

function openListSubmenu(view: EditorView) {
  render(<EditorContextMenu x={150} y={200} onClose={vi.fn()} view={view} />);
  const trigger = screen.getByText("列表与段落排版");
  fireEvent.mouseEnter(trigger.closest(".context-menu-item")!);
}

function dispatchChanges(view: EditorView) {
  const call = (view.dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
  return call.changes as { from: number; to: number; insert: string }[];
}

describe("right-click line transforms (list bug report)", () => {
  it("转为无序列表 produces real markers with no literal $1 anywhere", () => {
    const view = createView(DOC, 苹果Line.from, 香蕉Line.to);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为无序列表"));
    const changes = dispatchChanges(view);
    const result = docAfter(DOC, changes);
    // The regression anchor: the shipped bug wrote "$1- " into the text.
    expect(result).not.toContain("$1");
    expect(result).toBe("# 标题文档\n- 苹果\n- 香蕉\n\n  缩进橙子");
  });

  it("转为无序列表 converts existing ordered items and is idempotent", () => {
    const src = "1. 第一步\n2. 第二步";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为无序列表"));
    const once = docAfter(src, dispatchChanges(view));
    expect(once).toBe("- 第一步\n- 第二步");

    // Converting an already-unordered line again changes nothing (no churn).
    cleanup();
    const view2 = createView(once, 0, once.length);
    openListSubmenu(view2);
    fireEvent.click(screen.getByText("转为无序列表"));
    const calls = (view2.dispatch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    if (calls.length > 0) {
      expect(docAfter(once, calls[0][0].changes)).toBe(once);
    }
  });

  it("转为有序列表 numbers items incrementing, preserving indentation", () => {
    const src = "甲\n乙\n  丙";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为有序列表"));
    const result = docAfter(src, dispatchChanges(view));
    expect(result).toBe("1. 甲\n2. 乙\n  3. 丙");
    expect(result).not.toContain("$1");
  });

  it("blank lines inside the selection stay blank (no dangling markers)", () => {
    const view = createView(DOC, 苹果Line.from, 香蕉Line.to + 1 + "  缩进橙子".length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为无序列表"));
    const result = docAfter(DOC, dispatchChanges(view));
    expect(result).toBe("# 标题文档\n- 苹果\n- 香蕉\n\n  - 缩进橙子");
  });

  it("转为待办清单 and 转为引用块 keep working through replace semantics", () => {
    const src = "任务行";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为待办清单"));
    expect(docAfter(src, dispatchChanges(view))).toBe("- [ ] 任务行");

    cleanup();
    const view2 = createView(src, 0, src.length);
    render(<EditorContextMenu x={150} y={200} onClose={vi.fn()} view={view2} />);
    fireEvent.mouseEnter(screen.getByText("列表与段落排版").closest(".context-menu-item")!);
    fireEvent.click(screen.getByText("转为引用块"));
    expect(docAfter(src, dispatchChanges(view2))).toBe("> 任务行");
  });

  it("转为标题 preserves the indentation the line had", () => {
    const src = "  小节";
    const view = createView(src, 0, src.length);
    render(<EditorContextMenu x={150} y={200} onClose={vi.fn()} view={view} />);
    fireEvent.mouseEnter(screen.getByText("转为标题").closest(".context-menu-item")!);
    fireEvent.click(screen.getByText("二级标题 H2"));
    expect(docAfter(src, dispatchChanges(view))).toBe("  ## 小节");
  });

  it("转为普通文本 cancels every marker the family applies", () => {
    const cases: [string, string][] = [
      ["- 苹果", "苹果"],
      ["2. 第二步", "第二步"],
      ["- [x] 任务", "任务"],
      ["> 引用", "引用"],
      ["### 标题", "标题"],
      ["  - 缩进项", "  缩进项"],
    ];
    for (const [src, want] of cases) {
      cleanup();
      const view = createView(src, 0, src.length);
      openListSubmenu(view);
      fireEvent.click(screen.getByText("转为普通文本"));
      expect(docAfter(src, dispatchChanges(view))).toBe(want);
    }
  });

  it("转为普通文本 on a plain line is a no-op (negative pair)", () => {
    const src = "本来就普通";
    const view = createView(src, 0, src.length);
    openListSubmenu(view);
    fireEvent.click(screen.getByText("转为普通文本"));
    expect(view.dispatch).not.toHaveBeenCalled();
  });
});
