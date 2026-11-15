import type { EditorView } from "@codemirror/view";
import type { DocumentSession, MindmapNode } from "../core/types";
import type { AiMode } from "../types/ai";
import { formatStyleComment, parseMarkdownToMindmapTree } from "./mindmapService";
import { serializeCanvasData } from "./canvasSerialization";
import type { CanvasTextNode } from "../types/canvasTypes";

export type AiCreationMode = "create" | "edit" | "mindmap" | "canvas";
export type AiTarget = Pick<
  DocumentSession,
  "chapterId" | "absolutePath" | "fileName" | "source" | "sourceRevision"
> & { cursor: number };
export const isCreationMode = (mode: AiMode): mode is AiCreationMode =>
  mode === "create" || mode === "edit" || mode === "mindmap" || mode === "canvas";

export function inferAiCreationMode(prompt: string): AiCreationMode {
  if (
    /修改|改为|改成|重命名|设为|设置为|替换|删除|删掉|移除|重写|改写|调整|更改|更新|润色|纠正|修正|(?:分支|节点|卡片).*(?:添加|增加|新增|补充)|(?:添加|增加|新增|补充).*(?:分支|节点)|\b(edit|replace|remove|delete|rewrite|rename)\b|\badd\b.*\b(child|branch|node)\b/i.test(
      prompt,
    )
  )
    return "edit";
  if (/白板|卡片|\bcanvas\b|\bwhiteboard\b/i.test(prompt)) return "canvas";
  if (/思维导图|思维脑图|脑图|\bmind\s*map\b/i.test(prompt)) return "mindmap";
  return "create";
}

export function captureAiTarget(
  session: DocumentSession | null,
  view: EditorView | null,
): AiTarget {
  if (!session?.writable || !/\.(md|markdown|canvas)$/i.test(session.fileName))
    throw new Error("请打开可编辑的 Markdown 文档或白板。生成结果仍可保存为新文件。");
  return {
    chapterId: session.chapterId,
    absolutePath: session.absolutePath,
    fileName: session.fileName,
    source: session.source,
    sourceRevision: session.sourceRevision,
    cursor:
      view && !view.state.readOnly && view.state.doc.toString() === session.source
        ? view.state.selection.main.head
        : session.source.length,
  };
}

export function assertAiTarget(
  session: DocumentSession | null,
  target: AiTarget,
): asserts session is DocumentSession {
  if (
    !session?.writable ||
    session.chapterId !== target.chapterId ||
    session.absolutePath !== target.absolutePath ||
    session.fileName !== target.fileName ||
    session.sourceRevision !== target.sourceRevision ||
    session.source !== target.source
  )
    throw new Error("文档已变化或已切换，未写入任何内容；请核对草稿后重新生成，或保存为新文件。");
}

function unwrap(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("生成内容不能为空。");
  if (trimmed.length > 100000) throw new Error("生成内容超过 100000 字符，请分批生成。");
  const unwrapped = trimmed.replace(/^```(?:markdown|md|json)?\s*\n([\s\S]*?)\n```$/i, "$1");
  if (!unwrapped.trim()) throw new Error("生成内容不能为空。");
  return unwrapped;
}

export function creationContent(
  mode: AiCreationMode,
  text: string,
  source?: string,
  fileName = "",
): string {
  const content = unwrap(text);
  if (mode === "edit") {
    if (source === undefined) throw new Error("缺少修改时的文档原文，未写入。请重新生成。");
    return /\.canvas$/i.test(fileName)
      ? applyAiCanvasEdits(source, content)
      : applyAiEdits(source, content);
  }
  if (mode === "mindmap" && !parseMarkdownToMindmapTree(content).children.length)
    throw new Error("思维导图需要标题和分支，请让模型输出 Markdown 标题与嵌套列表后重试。");
  if (mode !== "canvas") return content;
  const cards = parseAiCards(content);
  const nodes: CanvasTextNode[] = [];
  let y = 0;
  for (let start = 0; start < cards.length; start += 3) {
    const row: CanvasTextNode[] = cards.slice(start, start + 3).map((card, i) => ({
      id: crypto.randomUUID(),
      type: "text",
      text: `## ${card.title}\n\n${card.content}`,
      x: i * 400,
      y,
      width: 340,
      height: Math.max(
        220,
        Math.min(
          900,
          (card.content.split("\n").length + Math.ceil(card.content.length / 22)) * 24 + 80,
        ),
      ),
      color: String(((start + i) % 6) + 1),
    }));
    nodes.push(...row);
    y += Math.max(...row.map((node) => node.height)) + 60;
  }
  return serializeCanvasData({ nodes, edges: [] });
}

type AiEdit = { before: string; after: string; nodeId?: string };

export function parseAiEdits(text: string): AiEdit[] {
  let value;
  try {
    value = JSON.parse(unwrap(text));
  } catch {
    throw new Error("模型未返回可执行的文档修改，原文未变。请重新生成，不要使用修订说明。");
  }
  if (
    !value ||
    !Array.isArray(value.edits) ||
    !value.edits.length ||
    value.edits.length > 32 ||
    value.edits.some(
      (edit: { before?: unknown; after?: unknown; nodeId?: unknown } | null) =>
        !edit ||
        typeof edit.before !== "string" ||
        !edit.before.length ||
        typeof edit.after !== "string" ||
        (edit.nodeId !== undefined && (typeof edit.nodeId !== "string" || !edit.nodeId.trim())),
    )
  )
    throw new Error("文档修改格式无效，原文未变。每处修改需提供原文和替换内容。");
  return value.edits.map((edit: AiEdit) => ({
    before: edit.before,
    after: edit.after,
    ...(edit.nodeId === undefined ? {} : { nodeId: edit.nodeId }),
  }));
}

export function applyAiEdits(source: string, text: string): string {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = source.replace(/\r\n/g, "\n");
  const offsets = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\r" && source[i + 1] === "\n") i++;
    offsets.push(i + 1);
  }
  const edits = parseAiEdits(text)
    .map((edit) => {
      if (edit.nodeId !== undefined) throw new Error("文档修改不能包含白板节点 ID，未写入。");
      const before = edit.before.replace(/\r\n/g, "\n");
      const at = normalized.indexOf(before);
      if (at < 0 || normalized.indexOf(before, at + 1) !== -1)
        throw new Error("待修改原文未唯一匹配，未写入。请指定更完整的段落后重新生成。");
      return { at, end: at + before.length, after: edit.after.replace(/\r\n/g, "\n") };
    })
    .sort((a, b) => a.at - b.at);
  for (let i = 1; i < edits.length; i++)
    if (edits[i].at < edits[i - 1].end) throw new Error("多处修改范围重叠，未写入。请拆分请求。");
  let result = source;
  for (const edit of edits.reverse())
    result =
      result.slice(0, offsets[edit.at]) +
      edit.after.replace(/\n/g, eol) +
      result.slice(offsets[edit.end]);
  if (result === source) throw new Error("生成的修改与原文相同，未写入。");
  return result;
}

export function readAiCanvas(source: string) {
  let board;
  try {
    board = JSON.parse(source);
  } catch {
    throw new Error("当前白板格式损坏，未写入卡片。");
  }
  if (
    !board ||
    !Array.isArray(board.nodes) ||
    !Array.isArray(board.edges) ||
    board.nodes.some(
      (node: CanvasTextNode) =>
        !node ||
        typeof node.id !== "string" ||
        !node.id ||
        !Number.isFinite(node.x) ||
        !Number.isFinite(node.y) ||
        !Number.isFinite(node.width) ||
        node.width <= 0 ||
        !Number.isFinite(node.height) ||
        node.height <= 0 ||
        !Number.isFinite(node.x + node.width) ||
        !Number.isFinite(node.y + node.height) ||
        (node.type === "text" && typeof node.text !== "string"),
    ) ||
    new Set(board.nodes.map((node: CanvasTextNode) => node.id)).size !== board.nodes.length ||
    board.edges.some(
      (edge: { fromNode?: unknown; toNode?: unknown } | null) =>
        !edge || typeof edge.fromNode !== "string" || typeof edge.toNode !== "string",
    )
  )
    throw new Error("当前白板数据无效，未写入卡片。");
  return board;
}

function applyAiCanvasEdits(source: string, text: string): string {
  const board = readAiCanvas(source);
  const grouped = new Map<string, AiEdit[]>();
  for (const edit of parseAiEdits(text)) {
    if (
      !edit.nodeId ||
      !board.nodes.some((node: CanvasTextNode) => node.id === edit.nodeId && node.type === "text")
    )
      throw new Error("未找到唯一的白板文本卡片 ID，未写入。请明确指定卡片后重新生成。");
    grouped.set(edit.nodeId, [...(grouped.get(edit.nodeId) || []), edit]);
  }
  const removed = new Set<string>();
  const nodes = board.nodes.flatMap((node: CanvasTextNode) => {
    const edits = grouped.get(node.id);
    if (!edits) return [node];
    const next = applyAiEdits(
      node.text,
      JSON.stringify({
        edits: edits.map(({ before, after }) => ({ before, after })),
      }),
    );
    if (!next.trim()) {
      removed.add(node.id);
      return [];
    }
    return [{ ...node, text: next }];
  });
  return JSON.stringify(
    {
      ...board,
      nodes,
      edges: board.edges.filter(
        (edge: { fromNode: string; toNode: string }) =>
          !removed.has(edge.fromNode) && !removed.has(edge.toNode),
      ),
    },
    null,
    2,
  );
}

export function parseAiCards(
  text: string,
  allowEmptyFields = false,
): { title: string; content: string }[] {
  let value;
  try {
    value = JSON.parse(unwrap(text));
  } catch {
    throw new Error("白板卡片格式无效，请重新生成完整 JSON。");
  }
  if (
    !value ||
    !Array.isArray(value.cards) ||
    !value.cards.length ||
    value.cards.length > 24 ||
    value.cards.some(
      (card: { title?: unknown; content?: unknown } | null) =>
        !card ||
        typeof card.title !== "string" ||
        (!allowEmptyFields && !card.title.trim()) ||
        card.title.length > 120 ||
        typeof card.content !== "string" ||
        (!allowEmptyFields && !card.content.trim()) ||
        card.content.length > 4000,
    )
  )
    throw new Error(
      "白板需包含 1–24 张卡片，每张需有标题（最多 120 字符）和内容（最多 4000 字符）。",
    );
  return value.cards.map((card: { title: string; content: string }) => ({
    title: card.title,
    content: card.content,
  }));
}

export function planAiInsertion(
  session: DocumentSession | null,
  target: AiTarget,
  text: string,
  mode: AiCreationMode,
  position: "append" | "cursor",
): string {
  assertAiTarget(session, target);
  if (mode === "edit") {
    if (!/\.(md|markdown|canvas)$/i.test(session.fileName))
      throw new Error("请打开可编辑的 Markdown 文档或白板。");
    return creationContent(mode, text, session.source, session.fileName);
  }
  let content = creationContent(mode, text, session.source);
  if (mode === "canvas") {
    if (!/\.canvas$/i.test(session.fileName))
      throw new Error("请保存为新白板，Markdown 原文会保留。");
    const existing = readAiCanvas(session.source);
    const generated = JSON.parse(content);
    const offset = existing.nodes.length
      ? existing.nodes.reduce(
          (right: number, node: CanvasTextNode) => Math.max(right, node.x + node.width),
          -Infinity,
        ) + 80
      : 0;
    const top = existing.nodes.length
      ? existing.nodes.reduce(
          (top: number, node: CanvasTextNode) => Math.min(top, node.y),
          Infinity,
        )
      : 0;
    return JSON.stringify(
      {
        ...existing,
        nodes: [
          ...existing.nodes,
          ...generated.nodes.map((node: CanvasTextNode) => ({
            ...node,
            x: node.x + offset,
            y: node.y + top,
          })),
        ],
      },
      null,
      2,
    );
  }
  if (!/\.(md|markdown)$/i.test(session.fileName))
    throw new Error("正文和思维导图需写入 Markdown 文档，可保存为新笔记。");
  // The document parser uses either lists or headings. Match that format so
  // appended branches stay visible without rewriting the existing document.
  if (mode === "mindmap" && session.source.trim()) {
    const existing = parseMarkdownToMindmapTree(session.source);
    const lists = existing.children.some((node) => node.id.startsWith("node-root"));
    const lines: string[] = [];
    const visit = (node: MindmapNode, depth: number) => {
      if (depth > 5) throw new Error("思维导图最多六级，请减少分支层级后重新生成。");
      lines.push(
        `${lists ? "  ".repeat(depth) + "-" : "#".repeat(depth + 1)} ${node.text}${formatStyleComment(node)}`,
      );
      node.children.forEach((child) => visit(child, depth + 1));
    };
    visit(parseMarkdownToMindmapTree(content), 0);
    content = lines.join("\n");
  }
  const eol = session.source.includes("\r\n") ? "\r\n" : "\n";
  const at = position === "cursor" ? target.cursor : session.source.length;
  if (!Number.isSafeInteger(at) || at < 0 || at > session.source.length)
    throw new Error("插入位置已失效。");
  const before = session.source.slice(0, at),
    after = session.source.slice(at);
  const separator = before.length
    ? before.endsWith(eol + eol)
      ? ""
      : before.endsWith(eol)
        ? eol
        : eol + eol
    : "";
  return before + separator + content.replace(/\r?\n/g, eol) + (after ? eol + eol : "") + after;
}
