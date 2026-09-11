import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "../components/StatusBar";

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
      />
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
      />
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
      />
    );

    expect(screen.getByText("只读")).toBeDefined();
    expect(screen.getByText("阅读视图")).toBeDefined();
  });

  it("calculates characters, words, and reading time accurately", () => {
    // 800 characters => approx 2 minutes reading
    const text = "A".repeat(800);
    render(
      <StatusBar
        fileName="stats.md"
        source={text}
        viewMode="canvas"
      />
    );

    expect(screen.getByText("800 字符")).toBeDefined();
    expect(screen.getByText("1 词")).toBeDefined();
    expect(screen.getByText("约 2 分钟阅读")).toBeDefined();
    expect(screen.getByText("空间白板")).toBeDefined();
  });

  it("shows large document optimization warning badge", () => {
    render(
      <StatusBar
        fileName="big.md"
        source="大文档"
        viewMode="split"
        isLargeDocument={true}
      />
    );

    expect(screen.getByText("大文档优化")).toBeDefined();
  });
});
