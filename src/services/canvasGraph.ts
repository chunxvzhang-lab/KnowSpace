/**
 * Canvas graph: cycle detection and topology-driven loop geometry.
 *
 * The cycle scan is memoised on an FNV-1a fingerprint of the edge topology —
 * dragging only moves coordinates, never the topology, so the O(E x (V+E))
 * scan is skipped on every drag frame. The cache lives here rather than in the
 * colour module that also consults it, so the dependency stays one-way.
 *
 * Extracted from canvasService during the R2 split — see
 * docs/CANVAS_SPLIT_DESIGN.md. Code is byte-identical to the original.
 */

import type { CanvasData, CanvasNode, CanvasEdge, CanvasGroupNode } from "../types/canvasTypes";
import { getNodesInsideGroup } from "./canvasPrimitives";
import { computeGridLayout, computeRingLayout } from "./canvasGeometry";

/**
 * Builds the presentation slide sequence for Canvas Presentation Mode according to user specifications:
 * 1. Same container priority: play cards within the container in order.
 * 2. When reaching an initiator card (a card with outgoing edges), play the cards it points to in order;
 *    after completing that branch, continue playing the NEXT card in the initiator's container.
 * 3. When pointing to both single cards and a cycle group: play single cards first, then the cycle group.
 * 4. Cycle groups play in clockwise order around their centroid; outgoing connections from the cycle
 *    are played at the very end of the cycle.
 * 5. Standalone empty groups act as independent framing slides.
 */
export function buildPresentationSequence(data: CanvasData): string[] {
  if (!data.nodes || data.nodes.length === 0) return [];

  const groups = data.nodes.filter((n): n is CanvasGroupNode => n.type === "group");
  const contentNodes = data.nodes.filter((n) => n.type !== "group");

  // An empty group acts as a standalone framing slide
  const emptyGroups = groups.filter((g) => getNodesInsideGroup(data.nodes, g).length === 0);
  const presentableNodes = [...contentNodes, ...emptyGroups];
  if (presentableNodes.length === 0) return [];

  const nodeMap = new Map<string, CanvasNode>(presentableNodes.map((n) => [n.id, n]));

  // 1. Map each card to its immediate parent group container
  const cardToContainerId = new Map<string, string>();
  const containerMembers = new Map<string, string[]>();

  for (const grp of groups) {
    const inside = getNodesInsideGroup(contentNodes, grp);
    if (inside.length > 0) {
      containerMembers.set(grp.id, inside.map((n) => n.id));
      for (const n of inside) {
        cardToContainerId.set(n.id, grp.id);
      }
    }
  }

  // 2. Build adjacency list of directed edges between presentable nodes
  const resolveEndpoint = (id: string): string[] => {
    if (nodeMap.has(id)) return [id];
    return [];
  };

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of presentableNodes) {
    adj.set(n.id, []);
    inDegree.set(n.id, 0);
  }

  const addedEdges = new Set<string>();
  for (const edge of data.edges) {
    const froms = resolveEndpoint(edge.fromNode);
    const tos = resolveEndpoint(edge.toNode);
    for (const f of froms) {
      for (const t of tos) {
        if (f === t) continue;
        const key = `${f}->${t}`;
        if (!addedEdges.has(key)) {
          addedEdges.add(key);
          adj.get(f)!.push(t);
          inDegree.set(t, (inDegree.get(t) || 0) + 1);
        }
      }
    }
  }

  // 3. Cycle & Ring Detection
  // A. Tarjan's SCC to detect strongly connected components (size >= 2)
  let sccIndex = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, sccIndex);
    lowlink.set(v, sccIndex);
    sccIndex++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const n of presentableNodes) {
    if (!indices.has(n.id)) {
      strongconnect(n.id);
    }
  }

  // B. Loop edge detection via getLoopEdgeIds
  const loopEdgeIds = getLoopEdgeIds(data.edges);

  // C. Disjoint-Set (Union-Find) to partition cycle nodes into isolated, independent cycle components
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) {
      root = parent.get(root) ?? root;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const cycleNodesSet = new Set<string>();

  // Add SCCs with length >= 2
  for (const scc of sccs) {
    if (scc.length >= 2) {
      for (const id of scc) {
        cycleNodesSet.add(id);
        if (!parent.has(id)) parent.set(id, id);
      }
      for (let i = 1; i < scc.length; i++) {
        union(scc[0], scc[i]);
      }
    }
  }

  // Add loop edge endpoints (size >= 3)
  for (const edge of data.edges) {
    if (loopEdgeIds.has(edge.id) && nodeMap.has(edge.fromNode) && nodeMap.has(edge.toNode)) {
      cycleNodesSet.add(edge.fromNode);
      cycleNodesSet.add(edge.toNode);
      if (!parent.has(edge.fromNode)) parent.set(edge.fromNode, edge.fromNode);
      if (!parent.has(edge.toNode)) parent.set(edge.toNode, edge.toNode);
      union(edge.fromNode, edge.toNode);
    }
  }

  // Group into separate cycle components
  const cycleComponents = new Map<string, string[]>();
  for (const id of cycleNodesSet) {
    const root = find(id);
    const list = cycleComponents.get(root) || [];
    list.push(id);
    cycleComponents.set(root, list);
  }

  const nodeCycleMap = new Map<string, number>();
  const cycleNodesMap = new Map<number, string[]>();
  let nextCycleIdx = 0;
  for (const comp of cycleComponents.values()) {
    if (comp.length >= 2) {
      const cIdx = nextCycleIdx++;
      cycleNodesMap.set(cIdx, comp);
      for (const id of comp) {
        nodeCycleMap.set(id, cIdx);
      }
    }
  }

  // 4. Spatial sort comparator
  const spatialSort = (aId: string, bId: string): number => {
    const na = nodeMap.get(aId);
    const nb = nodeMap.get(bId);
    if (!na || !nb) return 0;
    if (Math.abs(na.y - nb.y) > 40) return na.y - nb.y;
    return na.x - nb.x;
  };

  // Helper: sort cycle clockwise around centroid starting from entry node
  const sortCycleClockwise = (cycleNodeIds: string[], entryId?: string): string[] => {
    if (cycleNodeIds.length <= 2) {
      if (entryId && cycleNodeIds.includes(entryId)) {
        return [entryId, ...cycleNodeIds.filter((id) => id !== entryId)];
      }
      return [...cycleNodeIds].sort(spatialSort);
    }

    const nodes = cycleNodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const cx = nodes.reduce((sum, n) => sum + (n.x + n.width / 2), 0) / nodes.length;
    const cy = nodes.reduce((sum, n) => sum + (n.y + n.height / 2), 0) / nodes.length;

    let startNodeId = entryId;
    if (!startNodeId || !cycleNodeIds.includes(startNodeId)) {
      const sortedByPos = [...nodes].sort((a, b) => {
        if (Math.abs(a.y - b.y) > 40) return a.y - b.y;
        return a.x - b.x;
      });
      startNodeId = sortedByPos[0].id;
    }

    const startNode = nodeMap.get(startNodeId)!;
    const startAngle = Math.atan2(
      startNode.y + startNode.height / 2 - cy,
      startNode.x + startNode.width / 2 - cx
    );

    return [...nodes]
      .sort((a, b) => {
        if (a.id === startNodeId) return -1;
        if (b.id === startNodeId) return 1;
        const angleA = Math.atan2(a.y + a.height / 2 - cy, a.x + a.width / 2 - cx);
        const angleB = Math.atan2(b.y + b.height / 2 - cy, b.x + b.width / 2 - cx);
        const offsetA = (angleA - startAngle + 2 * Math.PI) % (2 * Math.PI);
        const offsetB = (angleB - startAngle + 2 * Math.PI) % (2 * Math.PI);
        if (Math.abs(offsetA - offsetB) > 0.001) {
          return offsetA - offsetB;
        }
        return a.id.localeCompare(b.id);
      })
      .map((n) => n.id);
  };

  // 5. Pre-order cards within each container
  const containerOrder = new Map<string, string[]>();
  for (const [grpId, members] of containerMembers.entries()) {
    const memberSet = new Set(members);
    const memberInDegree = new Map<string, number>();
    for (const m of members) memberInDegree.set(m, 0);

    for (const m of members) {
      for (const target of adj.get(m) || []) {
        if (memberSet.has(target)) {
          memberInDegree.set(target, (memberInDegree.get(target) || 0) + 1);
        }
      }
    }

    const roots = members.filter((m) => memberInDegree.get(m) === 0).sort(spatialSort);
    const ordered: string[] = [];
    const q = [...roots];
    const seen = new Set<string>();

    while (q.length > 0) {
      const curr = q.shift()!;
      if (seen.has(curr)) continue;
      seen.add(curr);
      ordered.push(curr);

      const children = (adj.get(curr) || []).filter((id) => memberSet.has(id) && !seen.has(id)).sort(spatialSort);
      for (const c of children) {
        memberInDegree.set(c, memberInDegree.get(c)! - 1);
        if (memberInDegree.get(c)! <= 0) {
          q.push(c);
        }
      }
    }

    for (const m of [...members].sort(spatialSort)) {
      if (!seen.has(m)) {
        seen.add(m);
        ordered.push(m);
      }
    }
    containerOrder.set(grpId, ordered);
  }

  // 6. Presentation sequencing engine
  const sequence: string[] = [];
  const activeStack = new Set<string>(); // recursion protection against infinite loops

  // Helper to emit a slide with immediate consecutive debounce
  function emitSlide(id: string) {
    if (sequence.length > 0 && sequence[sequence.length - 1] === id) {
      return;
    }
    sequence.push(id);
  }

  // Function to play an entire cycle in clockwise order
  function playCycle(
    cycleIdx: number,
    entryNodeId?: string,
    containerVisited?: Set<string>
  ) {
    const cycleNodeIds = cycleNodesMap.get(cycleIdx) || [];
    if (cycleNodeIds.length === 0) return;

    // Avoid recursing if all nodes in this cycle are currently in activeStack
    if (cycleNodeIds.every((id) => activeStack.has(id))) return;

    const orderedCycle = sortCycleClockwise(cycleNodeIds, entryNodeId);

    // Emit ALL cycle nodes first (Complete clockwise circle - never truncated!)
    for (const id of orderedCycle) {
      if (containerVisited && cardToContainerId.get(id) === cardToContainerId.get(entryNodeId || "")) {
        containerVisited.add(id);
      }
      emitSlide(id);
    }

    // "环外连接在环的最后播放":
    // After the entire cycle has finished emitting, process outgoing edges from the cycle
    // in clockwise order of the source cards in the cycle
    for (const cycleCardId of orderedCycle) {
      const outEdges = (adj.get(cycleCardId) || []).filter(
        (targetId) => !cycleNodeIds.includes(targetId) && !activeStack.has(targetId)
      );
      if (outEdges.length > 0) {
        playOutgoingTargets(outEdges, cardToContainerId.get(cycleCardId), containerVisited);
      }
    }
  }

  // Function to partition outgoing targets into single cards and cycle groups,
  // playing single cards first, then cycle groups ("现播放单独的卡片，播放成环卡片组")
  function playOutgoingTargets(
    targetIds: string[],
    currentContainerId?: string,
    containerVisited?: Set<string>,
    parentDeferredCycleIds?: Set<number>
  ) {
    const validTargets = targetIds.filter((id) => nodeMap.has(id) && !activeStack.has(id));
    if (validTargets.length === 0) return;

    const sameContainerTargets: string[] = [];
    const singleTargets: string[] = [];
    const cycleTargetMap = new Map<number, string>(); // cycleIdx -> entryId

    for (const tid of validTargets) {
      const targetContainerId = cardToContainerId.get(tid);
      const cycleIdx = nodeCycleMap.get(tid);

      if (cycleIdx !== undefined) {
        // Belong to a cycle: always group as cycle target (whether in container or not)
        if (parentDeferredCycleIds?.has(cycleIdx)) continue;
        if (!cycleTargetMap.has(cycleIdx)) {
          cycleTargetMap.set(cycleIdx, tid);
        }
      } else if (currentContainerId && targetContainerId === currentContainerId) {
        if (!containerVisited || !containerVisited.has(tid)) {
          sameContainerTargets.push(tid);
        }
      } else {
        singleTargets.push(tid);
      }
    }

    // Cycles to defer during single card branch traversal so single cards don't prematurely fire them
    const deferredForSingles = new Set<number>([
      ...(parentDeferredCycleIds || []),
      ...cycleTargetMap.keys(),
    ]);

    // 1. "先播放单独的卡片"
    singleTargets.sort(spatialSort);
    for (const tid of singleTargets) {
      playCard(tid, undefined, deferredForSingles);
    }

    // 2. "再播放成环卡片组"
    for (const [cIdx, entryId] of cycleTargetMap.entries()) {
      playCycle(cIdx, entryId, containerVisited);
    }

    // 3. "播放完成后继续播放发起点卡片所在的容器的下一个卡片"
    sameContainerTargets.sort(spatialSort);
    for (const tid of sameContainerTargets) {
      playCard(tid, containerVisited);
    }
  }

  // Active presenting container ID
  let activeContainerId: string | null = null;

  // Function to play a single card and its drill-down branches
  function playCard(
    cardId: string,
    containerVisited?: Set<string>,
    deferredCycleIds?: Set<number>
  ) {
    if (activeStack.has(cardId)) return;
    activeStack.add(cardId);

    if (containerVisited) {
      containerVisited.add(cardId);
    }

    // If this card is part of a cycle, play the full cycle clockwise
    const cycleIdx = nodeCycleMap.get(cardId);
    if (cycleIdx !== undefined && !deferredCycleIds?.has(cycleIdx)) {
      playCycle(cycleIdx, cardId, containerVisited);
      activeStack.delete(cardId);
      return;
    }

    emitSlide(cardId);

    const containerId = cardToContainerId.get(cardId);

    // If this card belongs to a different container than the active presenting container,
    // it acts as a cross-container reference slide; do not recursively play that other container's internal cards.
    const isCrossContainerReference =
      Boolean(activeContainerId && containerId && containerId !== activeContainerId);

    if (!isCrossContainerReference) {
      // "当播放到做为发起点的卡片，按顺序播放其指向的卡片"
      const targets = adj.get(cardId) || [];
      if (targets.length > 0) {
        playOutgoingTargets(targets, containerId, containerVisited, deferredCycleIds);
      }
    }

    activeStack.delete(cardId);
  }

  // Function to play an entire container in order
  function playContainer(grpId: string) {
    const cardIds = containerOrder.get(grpId) || [];
    const containerVisited = new Set<string>();
    const prevActiveContainerId = activeContainerId;
    activeContainerId = grpId;

    for (const cardId of cardIds) {
      if (!containerVisited.has(cardId)) {
        playCard(cardId, containerVisited);
        // "播放完成后继续播放发起点卡片所在的容器的下一个卡片":
        // Once playCard(cardId) finishes expanding cardId's drill-down targets,
        // this loop naturally advances to the next unvisited card in this container!
      }
    }

    activeContainerId = prevActiveContainerId;
  }

  // 7. Top-level sequencing across containers, empty groups, and standalone cards
  interface TopEntity {
    id: string;
    type: "container" | "empty-group" | "standalone";
    nodeIds: string[];
    x: number;
    y: number;
  }

  const topEntities: TopEntity[] = [];
  const handledCards = new Set<string>();

  // Containers (non-empty groups)
  for (const grp of groups) {
    const members = containerMembers.get(grp.id);
    if (members && members.length > 0) {
      topEntities.push({
        id: grp.id,
        type: "container",
        nodeIds: members,
        x: grp.x,
        y: grp.y,
      });
      members.forEach((id) => handledCards.add(id));
    }
  }

  // Empty groups
  for (const eg of emptyGroups) {
    topEntities.push({
      id: eg.id,
      type: "empty-group",
      nodeIds: [eg.id],
      x: eg.x,
      y: eg.y,
    });
    handledCards.add(eg.id);
  }

  // Standalone content nodes
  for (const cn of contentNodes) {
    if (!handledCards.has(cn.id)) {
      topEntities.push({
        id: cn.id,
        type: "standalone",
        nodeIds: [cn.id],
        x: cn.x,
        y: cn.y,
      });
      handledCards.add(cn.id);
    }
  }

  // Macro dependency between top-level entities
  const entityInDegree = new Map<string, number>();
  const entityAdj = new Map<string, string[]>();
  for (const te of topEntities) {
    entityInDegree.set(te.id, 0);
    entityAdj.set(te.id, []);
  }

  const nodeToEntityId = new Map<string, string>();
  for (const te of topEntities) {
    for (const nid of te.nodeIds) {
      nodeToEntityId.set(nid, te.id);
    }
    nodeToEntityId.set(te.id, te.id);
  }

  const addedEntityEdges = new Set<string>();
  for (const edge of data.edges) {
    const ef = nodeToEntityId.get(edge.fromNode);
    const et = nodeToEntityId.get(edge.toNode);
    if (ef && et && ef !== et) {
      const k = `${ef}->${et}`;
      if (!addedEntityEdges.has(k)) {
        addedEntityEdges.add(k);
        entityAdj.get(ef)!.push(et);
        entityInDegree.set(et, (entityInDegree.get(et) || 0) + 1);
      }
    }
  }

  const entitySpatialSort = (a: TopEntity, b: TopEntity) => {
    if (Math.abs(a.y - b.y) > 60) return a.y - b.y;
    return a.x - b.x;
  };

  const entityMap = new Map<string, TopEntity>(topEntities.map((te) => [te.id, te]));
  const orderedEntityIds: string[] = [];
  const entityQueue = topEntities
    .filter((te) => (entityInDegree.get(te.id) || 0) === 0)
    .sort(entitySpatialSort)
    .map((te) => te.id);

  const seenEntities = new Set<string>();
  while (entityQueue.length > 0) {
    const eid = entityQueue.shift()!;
    if (seenEntities.has(eid)) continue;
    seenEntities.add(eid);
    orderedEntityIds.push(eid);

    const downs = (entityAdj.get(eid) || []).filter((id) => !seenEntities.has(id));
    for (const nextId of downs) {
      entityInDegree.set(nextId, (entityInDegree.get(nextId) || 0) - 1);
      if (entityInDegree.get(nextId)! <= 0) {
        entityQueue.push(nextId);
      }
    }
  }

  // Any remaining entities (e.g. cycle between containers)
  const remainingEntities = topEntities
    .filter((te) => !seenEntities.has(te.id))
    .sort(entitySpatialSort);
  for (const re of remainingEntities) {
    if (!seenEntities.has(re.id)) {
      seenEntities.add(re.id);
      orderedEntityIds.push(re.id);
    }
  }

  // Execute each top-level entity in order
  for (const eid of orderedEntityIds) {
    const te = entityMap.get(eid);
    if (!te) continue;

    if (te.type === "container") {
      playContainer(te.id);
    } else if (te.type === "empty-group") {
      emitSlide(te.id);
      const outs = adj.get(te.id) || [];
      if (outs.length > 0) {
        playOutgoingTargets(outs);
      }
    } else {
      // Standalone card: if not already played anywhere in sequence, play it
      if (!sequence.includes(te.id)) {
        playCard(te.id);
      }
    }
  }

  return sequence;
}

/**
 * Extracts canvas topological structure and nodes into a structured Markdown document
 * (Canvas-to-Article Transformation)
 */
export function extractCanvasToMarkdown(
  data: CanvasData,
  title: string = "白板结构化萃取专著"
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
            ? `「${target.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 20)}」`
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

/**
 * Determines whether a directed edge participates in a closed ring of at
 * least 3 nodes. Implemented as a BFS from the edge's target node back to
 * its source, skipping the edge under test.
 *
 * The return path must be at least 2 hops long so that a mere two-way pair
 * (A->B together with B->A, i.e. a bidirectional arrow) is NOT treated as a
 * ring — those should stay free to reuse any palette color.
 */
function isEdgeOnCycle(
  edge: CanvasEdge,
  outgoing: Map<string, CanvasEdge[]>
): boolean {
  const start = edge.toNode;
  const target = edge.fromNode;
  if (start === target) return true; // self-loop

  const visited = new Set<string>([start]);
  // Track hop distance so we can require a return path of >= 2 edges
  const queue: Array<{ node: string; dist: number }> = [{ node: start, dist: 0 }];

  while (queue.length > 0) {
    const { node, dist } = queue.shift()!;
    const outs = outgoing.get(node);
    if (!outs) continue;
    for (const e of outs) {
      if (e.id === edge.id) continue; // skip the edge being tested
      const nextDist = dist + 1;
      if (e.toNode === target && nextDist >= 2) return true;
      if (!visited.has(e.toNode)) {
        visited.add(e.toNode);
        queue.push({ node: e.toNode, dist: nextDist });
      }
    }
  }

  return false;
}

/**
 * Returns the ids of every edge that participates in a closed ring of at
 * least 3 nodes. See isEdgeOnCycle for the detailed rules.
 */
export function getLoopEdgeIds(edges: CanvasEdge[]): Set<string> {
  const ids = new Set<string>();
  if (!edges || edges.length === 0) return ids;

  const outgoing = new Map<string, CanvasEdge[]>();
  for (const e of edges) {
    const list = outgoing.get(e.fromNode);
    if (list) list.push(e);
    else outgoing.set(e.fromNode, [e]);
  }

  for (const e of edges) {
    if (isEdgeOnCycle(e, outgoing)) ids.add(e.id);
  }

  return ids;
}

/**
 * Order-independent FNV-1a fingerprint of the edge topology (ids + endpoints).
 *
 * Card coordinates change on every drag frame, but the topology does not, so
 * this lets us skip the O(E×(V+E)) cycle scan while a card is being dragged —
 * otherwise every frame would re-run a BFS per edge.
 */
function edgeTopologyFingerprint(edges: CanvasEdge[]): number {
  let hash = 2166136261;
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const key = `${e.id}\u0000${e.fromNode}\u0000${e.toNode}`;
    for (let j = 0; j < key.length; j += 1) {
      hash ^= key.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
  }
  // Fold the edge count in as well to make collisions even less likely.
  hash ^= edges.length;
  return hash >>> 0;
}

let cachedTopologyHash = -1;

let cachedLoopEdgeIds: Set<string> | null = null;

/**
 * Memoised `getLoopEdgeIds`. Cache is module-level but purely an optimisation:
 * identical input always produces the identical set, so callers cannot observe
 * a behavioural difference.
 */
export function getLoopEdgeIdsCached(edges: CanvasEdge[]): Set<string> {
  const hash = edgeTopologyFingerprint(edges);
  if (hash === cachedTopologyHash && cachedLoopEdgeIds) return cachedLoopEdgeIds;
  const ids = getLoopEdgeIds(edges);
  cachedTopologyHash = hash;
  cachedLoopEdgeIds = ids;
  return ids;
}

/**
 * Collects the palette colors already claimed by edges that form a closed
 * loop. This lets newly created rings pick a color that no other ring on the
 * canvas is currently using, so that multiple loops stay visually distinct.
 * Edges that are NOT part of a cycle (chains, one-to-many stars) are ignored
 * so they remain free to use any palette color.
 */
export function getLoopEdgeColors(edges: CanvasEdge[]): Set<string> {
  const colors = new Set<string>();
  if (!edges || edges.length === 0) return colors;

  const loopIds = getLoopEdgeIds(edges);
  for (const e of edges) {
    if (e.color && loopIds.has(e.id)) colors.add(e.color);
  }

  return colors;
}

/**
 * Expands a set of edge ids so that, whenever a selected edge belongs to a
 * closed ring, every other edge of that same ring is included as well.
 *
 * Used by color / stroke mutations so that the "one ring = one color" rule
 * survives partial edits: right-clicking a single segment of a ring will
 * repaint the entire ring instead of breaking it into mixed colors.
 */
export function expandLoopEdgeSelection(
  edges: CanvasEdge[],
  targetIds: Iterable<string>
): Set<string> {
  const result = new Set<string>(targetIds);
  const loopIds = getLoopEdgeIds(edges);
  if (loopIds.size === 0) return result;

  // Adjacency: node -> ids of ring edges touching it
  const byNode = new Map<string, string[]>();
  for (const e of edges) {
    if (!loopIds.has(e.id)) continue;
    for (const nid of [e.fromNode, e.toNode]) {
      const list = byNode.get(nid);
      if (list) list.push(e.id);
      else byNode.set(nid, [e.id]);
    }
  }

  const edgeById = new Map(edges.map((e) => [e.id, e]));
  const queue: string[] = [];
  for (const id of result) {
    if (loopIds.has(id)) queue.push(id);
  }

  const visitedNodes = new Set<string>();
  while (queue.length > 0) {
    const eid = queue.pop()!;
    const edge = edgeById.get(eid);
    if (!edge) continue;
    for (const nid of [edge.fromNode, edge.toNode]) {
      if (visitedNodes.has(nid)) continue;
      visitedNodes.add(nid);
      const neighbours = byNode.get(nid);
      if (!neighbours) continue;
      for (const neighbourId of neighbours) {
        if (!result.has(neighbourId)) {
          result.add(neighbourId);
          queue.push(neighbourId);
        }
      }
    }
  }

  return result;
}

/**
 * Keeps grid straight-line metadata in sync with the layout: when the given
 * cards form a rectangular grid, loop edges between them are flagged as
 * orthogonal straight segments; otherwise the flag is cleared.
 */
export function syncGridEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[]
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));
  const scopedIds = new Set(scopedNodes.map((n) => n.id));

  const scopedEdges = edges.filter(
    (e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode)
  );
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  const isGrid = computeGridLayout(loopNodes) !== null;

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (isGrid) {
      if (e.gridPath !== true) {
        changed = true;
        return { ...e, gridPath: true };
      }
      return e;
    }
    if (e.gridPath) {
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Keeps ring edges in sync with the node layout:
 * - when the given nodes form a circle, every loop edge between them is
 *   stamped with the ring centre/radius so it renders as a true arc;
 * - otherwise any stale ring metadata is cleared so the edge falls back to a
 *   normal bezier/step/straight path.
 *
 * Only edges whose BOTH endpoints are inside `scopeNodeIds` are touched, so
 * unrelated loops elsewhere on the canvas (or a manual ring the user built
 * separately) are left alone.
 */
export function syncRingEdges(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  scopeNodeIds: Set<string> | string[]
): CanvasEdge[] {
  const scope = scopeNodeIds instanceof Set ? scopeNodeIds : new Set(scopeNodeIds);
  const scopedNodes = nodes.filter((n) => scope.has(n.id));

  // Ring detection only considers cards that are themselves part of a cycle,
  // so a plain row of cards is never mistaken for a ring.
  const scopedIds = new Set(scopedNodes.map((n) => n.id));
  const scopedEdges = edges.filter(
    (e) => scopedIds.has(e.fromNode) && scopedIds.has(e.toNode)
  );
  if (scopedEdges.length === 0) return edges;

  const loopIds = getLoopEdgeIds(scopedEdges);
  if (loopIds.size === 0) return edges;

  const loopNodeIds = new Set<string>();
  for (const e of scopedEdges) {
    if (loopIds.has(e.id)) {
      loopNodeIds.add(e.fromNode);
      loopNodeIds.add(e.toNode);
    }
  }
  const loopNodes = nodes.filter((n) => loopNodeIds.has(n.id));

  // A rectangular grid also satisfies the circle test — the four corners of a
  // 2x2 rectangle are exactly equidistant from their centroid — so the grid
  // must take precedence here as well. Otherwise a rectangular loop would be
  // stamped as an arc and stop being a rectangle.
  const isGrid = computeGridLayout(loopNodes) !== null;
  const layout = isGrid ? null : computeRingLayout(loopNodes);

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    if (layout) {
      if (
        !e.ringCenter ||
        e.ringCenter.x !== layout.center.x ||
        e.ringCenter.y !== layout.center.y ||
        e.ringRadius !== layout.radius
      ) {
        changed = true;
        return { ...e, ringCenter: layout.center, ringRadius: layout.radius };
      }
      return e;
    }
    if (e.ringCenter || e.ringRadius) {
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return rest as CanvasEdge;
    }
    return e;
  });

  return changed ? next : edges;
}

/**
 * Re-synchronises the geometric metadata (ring arc / grid straight line) of
 * every loop edge against the current node positions.
 *
 * This is what keeps a closed loop glued to its cards while they are dragged:
 * the ring centre/radius is stored on the edge, so it has to be recomputed
 * whenever the cards move — otherwise the arc keeps pivoting around a stale
 * centre and visibly detaches from the cards.
 *
 * Loops are grouped into independent connected components first, so two
 * unrelated rings on the same canvas never average into each other. Within a
 * component, a rectangular grid takes precedence over a circle (a 2x2
 * rectangle satisfies both tests); failing both, the metadata is cleared so
 * the edge falls back to a plain bezier/step/straight path.
 */
export function syncLoopEdgeGeometry(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): CanvasEdge[] {
  // Memoised on the edge topology: this runs on every drag frame, where the
  // topology is unchanged and only the coordinates move.
  const loopIds = getLoopEdgeIdsCached(edges);
  if (loopIds.size === 0) return edges;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const loopEdges = edges.filter((e) => loopIds.has(e.id));

  // Union-Find to isolate independent loops
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = parent.get(x) ?? x;
    while (root !== (parent.get(root) ?? root)) {
      root = parent.get(root) ?? root;
    }
    let cur = x;
    while (cur !== root) {
      const next = parent.get(cur) ?? cur;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of loopEdges) {
    if (!parent.has(e.fromNode)) parent.set(e.fromNode, e.fromNode);
    if (!parent.has(e.toNode)) parent.set(e.toNode, e.toNode);
    union(e.fromNode, e.toNode);
  }

  const groups = new Map<string, CanvasEdge[]>();
  for (const e of loopEdges) {
    const root = find(e.fromNode);
    const list = groups.get(root) || [];
    list.push(e);
    groups.set(root, list);
  }

  type LoopMeta = { grid: boolean; center?: { x: number; y: number }; radius?: number };
  const meta = new Map<string, LoopMeta>();

  for (const [root, groupEdges] of groups.entries()) {
    const ids = new Set<string>();
    for (const e of groupEdges) {
      ids.add(e.fromNode);
      ids.add(e.toNode);
    }
    const groupNodes = [...ids]
      .map((id) => nodeMap.get(id))
      .filter((n): n is CanvasNode => Boolean(n));

    if (computeGridLayout(groupNodes)) {
      meta.set(root, { grid: true });
      continue;
    }
    const ring = computeRingLayout(groupNodes);
    if (ring) {
      meta.set(root, { grid: false, center: ring.center, radius: ring.radius });
    } else {
      meta.set(root, { grid: false });
    }
  }

  let changed = false;
  const next = edges.map((e) => {
    if (!loopIds.has(e.id)) return e;
    const info = meta.get(find(e.fromNode));
    if (!info) return e;

    if (info.grid) {
      // Straight orthogonal segment, no arc metadata
      if (e.gridPath === true && !e.ringCenter && e.ringRadius === undefined) return e;
      changed = true;
      const { ringCenter: _c, ringRadius: _r, ...rest } = e;
      return { ...rest, gridPath: true } as CanvasEdge;
    }

    if (info.center) {
      // True arc, refreshed against the current card positions
      if (
        e.gridPath === undefined &&
        e.ringCenter?.x === info.center.x &&
        e.ringCenter?.y === info.center.y &&
        e.ringRadius === info.radius
      ) {
        return e;
      }
      changed = true;
      const { gridPath: _g, ...rest } = e;
      return { ...rest, ringCenter: info.center, ringRadius: info.radius } as CanvasEdge;
    }

    // Plain curve
    if (e.gridPath === undefined && !e.ringCenter && e.ringRadius === undefined) return e;
    changed = true;
    const { gridPath: _g, ringCenter: _c, ringRadius: _r, ...rest } = e;
    return rest as CanvasEdge;
  });

  return changed ? next : edges;
}
