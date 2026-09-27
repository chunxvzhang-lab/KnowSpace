/**
 * Canvas graph: Canvas-to-Article extraction (extractCanvasToMarkdown).
 *
 * Renders the canvas topology and cards into a structured Markdown document.
 * Pure computation — no dependency on the rest of the graph family.
 *
 * Split out of canvasGraph during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). See canvasGraph.ts for the import surface.
 */

import type { CanvasData, CanvasNode, CanvasGroupNode } from "../types/canvasTypes";

/**
 * Extracts canvas topological structure and nodes into a structured Markdown document
 * (Canvas-to-Article Transformation)
 */
export function extractCanvasToMarkdown(
  data: CanvasData,
  title: string = "白板结构化萃取专著",
): string {
  if (!data || data.nodes.length === 0) {
    return `# ${title}\n\n*（当前白板为空，暂无可萃取内容）*\n`;
  }

  const lines: string[] = [];
  lines.push(`# ${title}\n`);
  lines.push(`> 📅 本文由 KnowSpace 空间白板通过拓扑依赖与坐标层次智能萃取生成。\n`);

  // Build edge adjacency map for relationship context
  const outgoingMap = new Map<string, Array<{ toNode: string; label?: string }>>();
  for (const edge of data.edges) {
    const list = outgoingMap.get(edge.fromNode) ?? [];
    list.push({ toNode: edge.toNode, label: edge.label });
    outgoingMap.set(edge.fromNode, list);
  }

  // Separate groups and cards
  const groups = data.nodes.filter((n): n is CanvasGroupNode => n.type === "group");
  const cards = data.nodes.filter((n) => n.type !== "group");

  // Sort groups by Y coordinate
  groups.sort((a, b) => a.y - b.y || a.x - b.x);

  // Group membership map
  const cardGroupMap = new Map<string, string>(); // cardId -> groupId
  for (const card of cards) {
    for (const group of groups) {
      if (
        card.x >= group.x &&
        card.x + card.width <= group.x + group.width &&
        card.y >= group.y &&
        card.y + card.height <= group.y + group.height
      ) {
        cardGroupMap.set(card.id, group.id);
        break;
      }
    }
  }

  // Helper to render card
  const renderCardContent = (card: CanvasNode) => {
    const cardLines: string[] = [];
    if (card.type === "text") {
      cardLines.push(card.text.trim());
    } else if (card.type === "file") {
      const fileName = card.file.replace(/\.(md|markdown)$/i, "");
      cardLines.push(`### 📄 引用笔记：[[${fileName}]]`);
      cardLines.push(`> 原文路径: \`${card.file}\`${card.subpath ? ` (${card.subpath})` : ""}`);
    } else if (card.type === "link") {
      cardLines.push(`### 🔗 外部参考：[${card.url}](${card.url})`);
    }

    // Append outgoing relations
    const relations = outgoingMap.get(card.id);
    if (relations && relations.length > 0) {
      const relTexts = relations.map((r) => {
        const target = data.nodes.find((n) => n.id === r.toNode);
        const targetTitle = target
          ? target.type === "file"
            ? `[[${target.file.replace(/\.(md|markdown)$/i, "")}]]`
            : target.type === "text"
              ? `「${target.text
                  .split("\n")[0]
                  .replace(/^#+\s*/, "")
                  .slice(0, 20)}」`
              : target.type === "group"
                ? `组群【${target.label || "未命名"}】`
                : "目标节点"
          : "目标节点";
        return `${r.label ? `[${r.label}] -> ` : "-> "}${targetTitle}`;
      });
      cardLines.push(`\n*关联演化：${relTexts.join("； ")}*`);
    }

    return cardLines.join("\n\n");
  };

  // Render cards within groups first
  const handledCardIds = new Set<string>();

  for (const group of groups) {
    lines.push(`## 🏛️ ${group.label || "模块集群"}\n`);
    const innerCards = cards.filter((c) => cardGroupMap.get(c.id) === group.id);
    innerCards.sort((a, b) => a.y - b.y || a.x - b.x);

    if (innerCards.length === 0) {
      lines.push("*（该分组暂无子卡片）*\n");
    } else {
      for (const card of innerCards) {
        lines.push(renderCardContent(card));
        lines.push("\n---\n");
        handledCardIds.add(card.id);
      }
    }
  }

  // Render remaining standalone cards
  const standaloneCards = cards.filter((c) => !handledCardIds.has(c.id));
  if (standaloneCards.length > 0) {
    if (groups.length > 0) {
      lines.push(`## 📌 独立空间卡片与核心思考\n`);
    }
    standaloneCards.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const card of standaloneCards) {
      lines.push(renderCardContent(card));
      lines.push("\n---\n");
    }
  }

  return lines.join("\n").trim() + "\n";
}
