/**
 * 阅读视图里点击任务复选框 → 定位到源码行并翻转的操作集合。
 *
 * 为什么按「块起始行 + 块内序号」而不是全局序号：正文阅读器对长文档做
 * 块级虚拟化，DOM 里只有视口附近的块 —— 用 `querySelectorAll` 数出来的
 * 全局序号在虚拟化下必然错位。每个渲染块的最外层元素都带
 * `data-source-line`（sourceLineMappingPlugin 注入，1-based 块起始行），
 * 它不随虚拟化变化，从它出发能在源码里精确定位。
 *
 * 全部为纯函数（DOM 解析除外，见 resolveCheckboxTarget），可直接单测。
 */

/** 任务行前缀：`- [ ] ` / `* [x] ` / `+ [ ]`，允许缩进。与 canvasPrimitives 同一形状。 */
const TASK_LINE_RE = /^(\s*[-*+]\s*\[)([ xX])(\])/;

/**
 * 从 `blockStartLine`（1-based，含）向下扫描，找到块内第 withinBlockIndex
 * 个任务行的 0-based 行号；找不到返回 -1。
 */
export function findTaskLineIndex(
  source: string,
  blockStartLine: number,
  withinBlockIndex: number,
): number {
  if (blockStartLine < 1 || withinBlockIndex < 0) return -1;
  const lines = source.split(/\r?\n/);
  if (blockStartLine > lines.length) return -1;

  let seen = 0;
  for (let i = blockStartLine - 1; i < lines.length; i++) {
    if (TASK_LINE_RE.test(lines[i])) {
      if (seen === withinBlockIndex) return i;
      seen += 1;
    }
  }
  return -1;
}

/**
 * 翻转 `lineIndex`（0-based）那一行的复选框状态。该行不是任务行时返回
 * null（调用方据此放弃，不做任何写入）。
 *
 * 采用逐行替换而不是 split/join：join("\n") 会把 CRLF 文档整体改成 LF，
 * 一次点击改写整个文件的换行符是这里最容易犯也最难发现的错。
 */
export function toggleTaskLine(source: string, lineIndex: number): string | null {
  if (lineIndex < 0) return null;
  let current = 0;
  let matched = false;
  const next = source.replace(/^.*$/gm, (lineText) => {
    const idx = current++;
    if (idx !== lineIndex) return lineText;
    const m = lineText.match(TASK_LINE_RE);
    if (!m) return lineText;
    matched = true;
    const flipped = m[2].toLowerCase() === "x" ? " " : "x";
    return `${m[1]}${flipped}${lineText.slice(m[1].length + 1)}`;
  });
  return matched ? next : null;
}

/**
 * 把一个被点击的复选框元素解析成（块起始行, 块内序号）。
 *
 * 返回 null 的情形都是"这次点击不该回写"：
 *  - 不在任何渲染块里（不属于正文内容）；
 *  - 块没有行号标记；
 *  - 点击来自 `[[...]]` 内联引用的渲染内容 —— 那些任务行属于**别的文档**，
 *    回写本文档只会把别人的行号翻到本文件的第 n 行上。
 */
export function resolveCheckboxTarget(
  target: HTMLElement,
): { blockStartLine: number; withinBlockIndex: number } | null {
  if (target.tagName !== "INPUT") return null;
  const input = target as HTMLInputElement;
  if (input.type !== "checkbox") return null;

  if (input.closest(".wikilink-embed-card")) return null;

  const block = input.closest("[data-source-line]") as HTMLElement | null;
  if (!block) return null;
  const blockStartLine = Number(block.getAttribute("data-source-line"));
  if (!Number.isFinite(blockStartLine) || blockStartLine < 1) return null;

  const boxes = Array.from(block.querySelectorAll('input[type="checkbox"]'));
  const withinBlockIndex = boxes.indexOf(input);
  if (withinBlockIndex === -1) return null;

  return { blockStartLine, withinBlockIndex };
}
