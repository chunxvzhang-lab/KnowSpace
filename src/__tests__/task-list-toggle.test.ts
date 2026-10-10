import { afterEach, describe, expect, it } from "vitest";
import {
  findTaskLineIndex,
  toggleTaskLine,
  resolveCheckboxTarget,
} from "../services/taskListToggle";

/**
 * 阅读视图点复选框 → 源码行翻转的定位逻辑。
 *
 * 关键约束（都来自阅读器的真实渲染方式）：
 *  - 块虚拟化下不能数 DOM 全局序号，只能从块起始行出发定位；
 *  - CRLF 文档点一下不能把整个文件改成 LF（split/join 的实现会犯这个错）。
 */
describe("taskListToggle - 块定位与行翻转", () => {
  it("从块起始行找到块内第 n 个任务行", () => {
    const source = [
      "# 标题", // 行 1
      "", // 行 2
      "- [ ] 甲", // 行 3 ← 块起始
      "- [x] 乙", // 行 4
      "    - [ ] 甲一（嵌套）", // 行 5
      "", // 行 6
      "- [ ] 丙", // 行 7（另一个块）
    ].join("\n");

    // 块从行 3 起，块内第 0 / 1 / 2 个任务行分别是 2 / 3 / 4（0-based）
    expect(findTaskLineIndex(source, 3, 0)).toBe(2);
    expect(findTaskLineIndex(source, 3, 1)).toBe(3);
    expect(findTaskLineIndex(source, 3, 2)).toBe(4);
    // 第二个块从行 7 起
    expect(findTaskLineIndex(source, 7, 0)).toBe(6);
  });

  it("块内序号越界与非法块起始行返回 -1", () => {
    const source = "- [ ] 甲\n- [ ] 乙";
    expect(findTaskLineIndex(source, 1, 5)).toBe(-1);
    expect(findTaskLineIndex(source, 0, 0)).toBe(-1);
    expect(findTaskLineIndex(source, 99, 0)).toBe(-1);
  });

  it("翻转指定行：未完成→完成、完成→未完成", () => {
    const source = "- [ ] 甲\n- [x] 乙";
    expect(toggleTaskLine(source, 0)).toBe("- [x] 甲\n- [x] 乙");
    expect(toggleTaskLine(source, 1)).toBe("- [ ] 甲\n- [ ] 乙");
  });

  it("大写 X 与星号/加号标记都认", () => {
    expect(toggleTaskLine("* [X] 甲", 0)).toBe("* [ ] 甲");
    expect(toggleTaskLine("+ [ ] 甲", 0)).toBe("+ [x] 甲");
    expect(toggleTaskLine("  - [ ] 缩进", 0)).toBe("  - [x] 缩进");
  });

  it("CRLF 文档翻转后仍是 CRLF（不因一次点击改写整个文件）", () => {
    const source = "- [ ] 甲\r\n- [x] 乙\r\n";
    const next = toggleTaskLine(source, 0);
    expect(next).toBe("- [x] 甲\r\n- [x] 乙\r\n");
    // 行索引对 CRLF 与 LF 一致
    expect(findTaskLineIndex(source, 1, 1)).toBe(1);
  });

  it("不是任务行时返回 null（调用方放弃写入）", () => {
    expect(toggleTaskLine("普通文本", 0)).toBeNull();
    expect(toggleTaskLine("- [ ] 甲", 9)).toBeNull();
    expect(toggleTaskLine("", 0)).toBeNull();
  });

  it("注释块里的 [x] 不会被误认为任务行", () => {
    // 任务行前缀必须是合法的列表标记，纯文本方括号不匹配
    expect(findTaskLineIndex("这是 [x] 内联文本", 1, 0)).toBe(-1);
  });
});

describe("taskListToggle - DOM 目标解析", () => {
  afterEach(() => {
    // 每个用例后清掉挂到 body 的文章，避免 DOM 跨用例累积。
    document.body.innerHTML = "";
  });

  function buildBlock(html: string) {
    const article = document.createElement("article");
    article.innerHTML = html;
    document.body.appendChild(article);
    return article;
  }

  it("解析出块起始行与块内序号", () => {
    const article = buildBlock(
      '<ul data-source-line="3"><li><input type="checkbox"><span>甲</span></li><li><input type="checkbox"><span>乙</span></li></ul>',
    );
    const boxes = article.querySelectorAll('input[type="checkbox"]');

    expect(resolveCheckboxTarget(boxes[0] as HTMLElement)).toEqual({
      blockStartLine: 3,
      withinBlockIndex: 0,
    });
    expect(resolveCheckboxTarget(boxes[1] as HTMLElement)).toEqual({
      blockStartLine: 3,
      withinBlockIndex: 1,
    });
  });

  it("不在任何块里的复选框返回 null", () => {
    const article = buildBlock('<div><input type="checkbox"></div>');
    expect(resolveCheckboxTarget(article.querySelector("input") as HTMLElement)).toBeNull();
  });

  it("内联引用（wikilink-embed-card）里的任务行不参与回写", () => {
    const article = buildBlock(
      '<div class="wikilink-embed-card" data-source-line="5"><ul><li><input type="checkbox"></li></ul></div>',
    );
    expect(resolveCheckboxTarget(article.querySelector("input") as HTMLElement)).toBeNull();
  });

  it("非复选框元素直接 null", () => {
    const article = buildBlock('<span data-source-line="1">文本</span>');
    expect(resolveCheckboxTarget(article.querySelector("span") as HTMLElement)).toBeNull();
  });
});
