import { describe, expect, it } from "vitest";
import type { BookManifest } from "../core/types";
import {
  createBacklinkIndex,
  updateDocumentInIndex,
} from "../services/backlinkIndex";
import {
  buildGraphDataFromIndex,
  computeOrganicGraphPositions,
  extractLocalSubgraph,
  filterGraphData,
  toCytoscapeElements,
} from "../services/graphService";

describe("graphService", () => {
  const mockManifest: BookManifest = {
    id: "test-book",
    title: "Test Book",
    chapters: [
      { id: "doc-1", title: "Introduction", src: "intro.md" },
      { id: "doc-2", title: "Architecture", src: "arch.md" },
      { id: "doc-3", title: "Deployment", src: "deploy.md" },
      { id: "doc-4", title: "Orphan Doc", src: "orphan.md" },
    ],
  };

  it("builds correct nodes, edges, and degree counts from backlink index", () => {
    const index = createBacklinkIndex([]);

    // doc-1 links to Architecture and Deployment
    updateDocumentInIndex(
      index,
      "doc-1",
      "Introduction",
      "We follow [[Architecture]] before doing [[Deployment]].",
      "intro.md"
    );

    // doc-2 links to Deployment
    updateDocumentInIndex(
      index,
      "doc-2",
      "Architecture",
      "See [[Deployment]] guide for containers.",
      "arch.md"
    );

    // doc-3 has no outgoing links
    updateDocumentInIndex(index, "doc-3", "Deployment", "Deploying with Docker.", "deploy.md");

    // doc-4 is orphan
    updateDocumentInIndex(index, "doc-4", "Orphan Doc", "No links here.", "orphan.md");

    const graph = buildGraphDataFromIndex(mockManifest, index, "doc-1");

    expect(graph.nodes.length).toBe(4);
    expect(graph.edges.length).toBe(3);

    const doc1 = graph.nodes.find((n) => n.id === "doc-1")!;
    expect(doc1.isCurrent).toBe(true);
    expect(doc1.outDegree).toBe(2);
    expect(doc1.inDegree).toBe(0);

    const doc3 = graph.nodes.find((n) => n.id === "doc-3")!;
    expect(doc3.inDegree).toBe(2); // linked by doc-1 and doc-2
    expect(doc3.outDegree).toBe(0);

    const doc4 = graph.nodes.find((n) => n.id === "doc-4")!;
    expect(doc4.inDegree).toBe(0);
    expect(doc4.outDegree).toBe(0);
  });

  it("extracts 1-hop local subgraph around a center node", () => {
    const index = createBacklinkIndex([]);
    updateDocumentInIndex(index, "doc-1", "Introduction", "See [[Architecture]]", "intro.md");
    updateDocumentInIndex(index, "doc-2", "Architecture", "See [[Deployment]]", "arch.md");
    updateDocumentInIndex(index, "doc-3", "Deployment", "Nothing", "deploy.md");
    updateDocumentInIndex(index, "doc-4", "Orphan Doc", "Lonely", "orphan.md");

    const fullGraph = buildGraphDataFromIndex(mockManifest, index, "doc-2");
    const subGraph = extractLocalSubgraph(fullGraph, "doc-2", 1);

    // doc-2 is linked from doc-1 and links to doc-3. doc-4 should NOT be in subgraph.
    const subNodeIds = subGraph.nodes.map((n) => n.id).sort();
    expect(subNodeIds).toEqual(["doc-1", "doc-2", "doc-3"].sort());
    expect(subNodeIds.includes("doc-4")).toBe(false);

    // Current node should be doc-2
    const center = subGraph.nodes.find((n) => n.id === "doc-2");
    expect(center?.isCurrent).toBe(true);
  });

  it("filters isolate nodes and search queries", () => {
    const index = createBacklinkIndex([]);
    updateDocumentInIndex(index, "doc-1", "Introduction", "See [[Architecture]]", "intro.md");
    updateDocumentInIndex(index, "doc-2", "Architecture", "Done", "arch.md");
    updateDocumentInIndex(index, "doc-4", "Orphan Doc", "Nothing", "orphan.md");

    const fullGraph = buildGraphDataFromIndex(mockManifest, index, "doc-1");

    // Filter isolates: doc-4 should be excluded, doc-1 and doc-2 retained
    const noIsolates = filterGraphData(fullGraph, { hideIsolates: true });
    expect(noIsolates.nodes.map((n) => n.id)).toEqual(["doc-1", "doc-2"]);

    // Search query filter: search "Arch"
    const searchArch = filterGraphData(fullGraph, { query: "Arch" });
    expect(searchArch.nodes.length).toBe(1);
    expect(searchArch.nodes[0].id).toBe("doc-2");
  });

  it("converts GraphData to Cytoscape elements correctly", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          label: "Node 1",
          type: "chapter" as const,
          inDegree: 0,
          outDegree: 1,
          normTitle: "node 1",
        },
        {
          id: "n2",
          label: "Node 2",
          type: "chapter" as const,
          inDegree: 1,
          outDegree: 0,
          normTitle: "node 2",
        },
      ],
      edges: [{ id: "n1->n2", source: "n1", target: "n2" }],
    };

    const cyElements = toCytoscapeElements(graph);
    expect(cyElements.length).toBe(3);
    expect(cyElements[0].group).toBe("nodes");
    expect(cyElements[0].data.id).toBe("n1");
    expect(cyElements[2].group).toBe("edges");
    expect((cyElements[2].data as any).source).toBe("n1");
  });

  it("computes organic 2D positions for nodes without 1D stacking or collision", () => {
    const graph: any = {
      nodes: [
        { id: "n1", label: "Doc 1" },
        { id: "n2", label: "Doc 2" },
        { id: "n3", label: "Doc 3" },
        { id: "n4", label: "Doc 4" },
        { id: "n5", label: "Doc 5" },
      ],
      edges: [{ id: "n1->n2", source: "n1", target: "n2" }],
    };

    const positions = computeOrganicGraphPositions(graph);
    expect(positions.size).toBe(5);

    // All nodes have valid numeric positions
    for (const [id, pos] of positions.entries()) {
      expect(Number.isFinite(pos.x)).toBe(true);
      expect(Number.isFinite(pos.y)).toBe(true);
    }

    // Nodes are not all stacked on a single 1D axis (both x and y have variance)
    const xCoords = Array.from(positions.values()).map((p) => p.x);
    const yCoords = Array.from(positions.values()).map((p) => p.y);
    const uniqueX = new Set(xCoords);
    const uniqueY = new Set(yCoords);
    expect(uniqueX.size).toBeGreaterThanOrEqual(4);
    expect(uniqueY.size).toBeGreaterThanOrEqual(4);

    // Distance between any two nodes is adequately spaced
    const posArr = Array.from(positions.values());
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const dx = posArr[i].x - posArr[j].x;
        const dy = posArr[i].y - posArr[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeGreaterThan(40);
      }
    }
  });

  it("identifies isCurrent and resolves local subgraph resiliently across paths and IDs", () => {
    const manifest: BookManifest = {
      id: "book-1",
      title: "Test",
      chapters: [
        { id: "chap-intro", title: "Introduction", src: "docs/intro.md" },
        { id: "chap-guide", title: "User Guide", src: "docs/guide.md" },
      ],
    };
    const index = createBacklinkIndex();

    // 1. Match by absolute or relative path
    const graphByPath = buildGraphDataFromIndex(manifest, index, "docs/intro.md");
    expect(graphByPath.nodes.find((n) => n.id === "chap-intro")?.isCurrent).toBe(true);
    expect(graphByPath.nodes.find((n) => n.id === "chap-guide")?.isCurrent).toBe(false);

    // 2. Extract local subgraph using path instead of chapter ID
    const localByPath = extractLocalSubgraph(graphByPath, "docs/intro.md");
    expect(localByPath.nodes.some((n) => n.id === "chap-intro")).toBe(true);

    // 3. Match by encoded file URI
    const graphByUri = buildGraphDataFromIndex(manifest, index, "file:c%3A%2Fdocs%2Fguide.md");
    expect(graphByUri.nodes.find((n) => n.id === "chap-guide")?.isCurrent).toBe(true);
  });

  it("deduplicates identical documents across manifest chapters and index documents", () => {
    const manifest: BookManifest = {
      id: "book-dup",
      title: "Dup Book",
      chapters: [
        { id: "chapter-0", title: "USER_MANUAL", src: "USER_MANUAL.md" },
      ],
    };
    const index = createBacklinkIndex();
    // Simulate user editing where document is indexed under a different docId like 'uploaded'
    updateDocumentInIndex(
      index,
      "uploaded",
      "USER_MANUAL",
      "Content of user manual",
      "USER_MANUAL.md"
    );

    const graph = buildGraphDataFromIndex(manifest, index, "USER_MANUAL");
    // MUST have exactly 1 node for USER_MANUAL, NEVER duplicate nodes
    const manualNodes = graph.nodes.filter(
      (n) => n.label === "USER_MANUAL" || n.normTitle === "user_manual"
    );
    expect(manualNodes.length).toBe(1);
    expect(graph.nodes.length).toBe(1);
    expect(manualNodes[0].isCurrent).toBe(true);
  });

  it("normalizes .canvas and .markdown extensions consistently for nodes and links", () => {
    const manifest: BookManifest = {
      id: "canvas-book",
      title: "Canvas Book",
      chapters: [
        { id: "chap-canvas", title: "ArchitectureBoard.canvas", src: "ArchitectureBoard.canvas" },
        { id: "chap-notes", title: "Notes.markdown", src: "Notes.markdown" },
      ],
    };
    const index = createBacklinkIndex([]);
    updateDocumentInIndex(
      index,
      "chap-notes",
      "Notes.markdown",
      "Check our [[ArchitectureBoard]] for details.",
      "Notes.markdown"
    );

    const graph = buildGraphDataFromIndex(manifest, index, "ArchitectureBoard");
    expect(graph.nodes.length).toBe(2);
    const canvasNode = graph.nodes.find((n) => n.id === "chap-canvas");
    expect(canvasNode).toBeDefined();
    expect(canvasNode?.isCurrent).toBe(true);
    expect(canvasNode?.normTitle).toBe("architectureboard");

    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].source).toBe("chap-notes");
    expect(graph.edges[0].target).toBe("chap-canvas");
  });
});
