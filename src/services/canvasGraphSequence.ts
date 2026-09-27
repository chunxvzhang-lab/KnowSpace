/**
 * Canvas graph: Presentation Mode sequencing (buildPresentationSequence).
 *
 * Turns the graph into the ordered slide id list for Canvas Presentation Mode.
 * Depends on the cycle scan in ./canvasGraphLoops (one-way) so rings play as a
 * single clockwise sequence.
 *
 * Split out of canvasGraph during the phase-1 size split; the code is
 * byte-identical to the original there (which itself came from canvasService
 * in the R2 split). See canvasGraph.ts for the import surface.
 */

import type { CanvasData, CanvasNode, CanvasGroupNode } from "../types/canvasTypes";
import { getNodesInsideGroup } from "./canvasPrimitives";
import { getLoopEdgeIds } from "./canvasGraphLoops";

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
      containerMembers.set(
        grp.id,
        inside.map((n) => n.id),
      );
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
      startNode.x + startNode.width / 2 - cx,
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

      const children = (adj.get(curr) || [])
        .filter((id) => memberSet.has(id) && !seen.has(id))
        .sort(spatialSort);
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
  function playCycle(cycleIdx: number, entryNodeId?: string, containerVisited?: Set<string>) {
    const cycleNodeIds = cycleNodesMap.get(cycleIdx) || [];
    if (cycleNodeIds.length === 0) return;

    // Avoid recursing if all nodes in this cycle are currently in activeStack
    if (cycleNodeIds.every((id) => activeStack.has(id))) return;

    const orderedCycle = sortCycleClockwise(cycleNodeIds, entryNodeId);

    // Emit ALL cycle nodes first (Complete clockwise circle - never truncated!)
    for (const id of orderedCycle) {
      if (
        containerVisited &&
        cardToContainerId.get(id) === cardToContainerId.get(entryNodeId || "")
      ) {
        containerVisited.add(id);
      }
      emitSlide(id);
    }

    // "环外连接在环的最后播放":
    // After the entire cycle has finished emitting, process outgoing edges from the cycle
    // in clockwise order of the source cards in the cycle
    for (const cycleCardId of orderedCycle) {
      const outEdges = (adj.get(cycleCardId) || []).filter(
        (targetId) => !cycleNodeIds.includes(targetId) && !activeStack.has(targetId),
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
    parentDeferredCycleIds?: Set<number>,
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
    deferredCycleIds?: Set<number>,
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
    const isCrossContainerReference = Boolean(
      activeContainerId && containerId && containerId !== activeContainerId,
    );

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
