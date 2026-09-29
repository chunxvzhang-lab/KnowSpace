import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { StatusBar } from "../components/StatusBar";

// The 2-4 profile caught StatusBar re-running its full body (including the
// whole-document word split) on unrelated parent commits during a scroll
// burst. The fix is React.memo; this spy counts when the inner render
// function actually executes, so a future un-memoizing refactor regresses
// loudly (rule 10: the guarantee must be machine-checked). vi.hoisted keeps
// the counter initialized before the hoisted mock factory can touch it.
const spy = vi.hoisted(() => ({ renders: 0 }));
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  const { forwardRef } = await import("react");
  return {
    ...actual,
    Cpu: forwardRef<HTMLSpanElement, Record<string, unknown>>((props, ref) => {
      spy.renders += 1;
      return <span ref={ref} data-spy="cpu" {...props} />;
    }),
  };
});

describe("StatusBar Component Sub-function Tests", () => {
  it("renders file title, saved status badge, and tech info", () => {
    render(
      <StatusBar
        fileName="chapter-1.md"
        source="这是第一章的内容。测试字数统计与状态栏。"
        isDirty={false}
        writable={true}
        viewMode="split"
        lineEnding="LF"
      />,
    );

    expect(screen.getByText("已保存")).toBeDefined();
    expect(screen.getByText("chapter-1.md")).toBeDefined();
    expect(screen.getByText("分屏协作")).toBeDefined();
    expect(screen.getByText("LF")).toBeDefined();
    expect(screen.getByText("UTF-8")).toBeDefined();
    expect(screen.getByText("KnowSpace")).toBeDefined();
  });

  it("renders dirty unsaved status badge when isDirty is true", () => {
    render(
      <StatusBar
        fileName="draft.md"
        source="未保存的修改内容"
        isDirty={true}
        writable={true}
        viewMode="source"
      />,
    );

    expect(screen.getByText("未保存")).toBeDefined();
    expect(screen.getByText("draft.md")).toBeDefined();
    expect(screen.getByText("源码编辑")).toBeDefined();
  });

  it("renders readonly badge when writable is false", () => {
    render(
      <StatusBar
        fileName="readonly.md"
        source="只读档案"
        isDirty={false}
        writable={false}
        viewMode="read"
      />,
    );

    expect(screen.getByText("只读")).toBeDefined();
    expect(screen.getByText("阅读视图")).toBeDefined();
  });

  it("calculates characters, words, and reading time accurately", () => {
    // 800 characters => approx 2 minutes reading
    const text = "A".repeat(800);
    render(<StatusBar fileName="stats.md" source={text} viewMode="canvas" />);

    expect(screen.getByText("800 字符")).toBeDefined();
    expect(screen.getByText("1 词")).toBeDefined();
    expect(screen.getByText("约 2 分钟阅读")).toBeDefined();
    expect(screen.getByText("空间白板")).toBeDefined();
  });

  it("shows large document optimization warning badge", () => {
    render(<StatusBar fileName="big.md" source="大文档" viewMode="split" isLargeDocument={true} />);

    expect(screen.getByText("大文档优化")).toBeDefined();
  });

  it("is memoized: an unrelated parent commit does not re-render it, a prop change does", () => {
    expect(typeof (StatusBar as unknown as { $$typeof: symbol }).$$typeof).toBe("symbol");

    function Parent() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button onClick={() => setTick(tick + 1)}>tick</button>
          <StatusBar fileName="memo.md" source="固定内容" viewMode="split" />
          <span>commit {tick}</span>
        </div>
      );
    }
    render(<Parent />);
    expect(screen.getByText("memo.md")).toBeDefined();
    const afterMount = spy.renders;
    expect(afterMount).toBeGreaterThan(0); // the spy sees the mount render

    fireEvent.click(screen.getByText("tick"));
    expect(screen.getByText("commit 1")).toBeDefined(); // parent re-rendered...
    expect(spy.renders).toBe(afterMount); // ...StatusBar did not

    // Negative pair: the same component WITH a changed prop must render.
    const { rerender } = render(
      <StatusBar fileName="memo.md" source="固定内容" viewMode="split" />,
    );
    const before = spy.renders;
    rerender(<StatusBar fileName="memo.md" source="内容变了" viewMode="split" />);
    expect(spy.renders).toBeGreaterThan(before);
  });
});
