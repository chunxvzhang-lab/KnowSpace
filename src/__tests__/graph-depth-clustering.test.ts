import { describe, it, expect } from "vitest";
import {
  extractFolderGroup,
  computeDirectoryClusterColors,
  filterGraphData,
  type GraphData,
} from "../services/graphService";

describe("Graph Depth & Directory Clustering", () => {
  const mockGraph: GraphData = {
    nodes: [
      {
        id: "doc-root",
        label: "根索引",
        path: "README.md",
        type: "chapter",
        inDegree: 4,
        outDegree: 2,
        isCurrent: true,
        normTitle: "根索引",
      },
      {
        id: "doc-backend",
        label: "服务端架构",
        path: "backend/server.md",
        type: "chapter",
        inDegree: 2,
        outDegree: 1,
        normTitle: "服务端架构",
      },
      {
        id: "doc-database",
        label: "数据库设计",
        path: "backend/db.md",
        type: "chapter",
        inDegree: 1,
        outDegree: 0,
        normTitle: "数据库设计",
      },
      {
        id: "doc-frontend",
        label: "前端架构",
        path: "frontend/ui.md",
        type: "chapter",
        inDegree: 1,
        outDegree: 0,
        normTitle: "前端架构",
      },
      {
        id: "doc-deep-infra",
        label: "底层驱动",
        path: "backend/infra/driver.md",
        type: "chapter",
        inDegree: 1,
        outDegree: 0,
        normTitle: "底层驱动",
      },
      {
        id: "doc-orphan",
        label: "孤岛笔记",
        path: "notes/orphan.md",
        type: "chapter",
        inDegree: 0,
        outDegree: 0,
        normTitle: "孤岛笔记",
      },
      {
        id: "space-1",
        label: "临时闪念",
        path: "space/memo.md",
        type: "space",
        inDegree: 0,
        outDegree: 0,
        normTitle: "临时闪念",
      },
    ],
    edges: [
      // doc-root -> doc-backend
      { id: "e1", source: "doc-root", target: "doc-backend" },
      // doc-root -> doc-frontend
      { id: "e2", source: "doc-root", target: "doc-frontend" },
      // doc-backend -> doc-database
      { id: "e3", source: "doc-backend", target: "doc-database" },
      // doc-database -> doc-deep-infra
      { id: "e4", source: "doc-database", target: "doc-deep-infra" },
    ],
  };

  it("extracts directory folder group correctly", () => {
    expect(extractFolderGroup("README.md", "chapter")).toBe("根目录");
    expect(extractFolderGroup("backend/server.md", "chapter")).toBe("backend");
    expect(extractFolderGroup("backend\\server.md", "chapter")).toBe("backend");
    expect(extractFolderGroup("frontend/ui.md", "chapter")).toBe("frontend");
    expect(extractFolderGroup("notes/sub/doc.md", "chapter")).toBe("notes");
    expect(extractFolderGroup("space/memo.md", "space")).toBe("闪念 Space");
    expect(extractFolderGroup(undefined, "chapter")).toBe("根目录");
  });

  it("computes harmonious directory cluster colors", () => {
    const clusterColors = computeDirectoryClusterColors(mockGraph.nodes);
    expect(clusterColors.get("根目录")).toBe("#94a3b8");
    expect(clusterColors.get("闪念 Space")).toBe("#f59e0b");
    expect(clusterColors.get("backend")).toBeDefined();
    expect(clusterColors.get("frontend")).toBeDefined();
    expect(clusterColors.get("notes")).toBeDefined();
    // Unique folders have distinct assigned colors
    expect(clusterColors.get("backend")).not.toBe(clusterColors.get("frontend"));
  });

  it("filters 1-Hop local neighborhood from center node", () => {
    const result1Hop = filterGraphData(mockGraph, {
      depth: 1,
      currentDocId: "doc-root",
    });

    const nodeIds = result1Hop.nodes.map((n) => n.id);
    expect(nodeIds).toContain("doc-root");
    expect(nodeIds).toContain("doc-backend");
    expect(nodeIds).toContain("doc-frontend");
    // 2-Hop or further nodes must NOT be included in 1-Hop
    expect(nodeIds).not.toContain("doc-database");
    expect(nodeIds).not.toContain("doc-deep-infra");
    expect(nodeIds).not.toContain("doc-orphan");
  });

  it("filters 2-Hop neighborhood from center node", () => {
    const result2Hop = filterGraphData(mockGraph, {
      depth: 2,
      currentDocId: "doc-root",
    });

    const nodeIds = result2Hop.nodes.map((n) => n.id);
    expect(nodeIds).toContain("doc-root");
    expect(nodeIds).toContain("doc-backend");
    expect(nodeIds).toContain("doc-frontend");
    expect(nodeIds).toContain("doc-database"); // 2-Hop away
    expect(nodeIds).not.toContain("doc-deep-infra"); // 3-Hop away
    expect(nodeIds).not.toContain("doc-orphan");
  });

  it("filters MOC core hubs (degree >= 3)", () => {
    const hubsResult = filterGraphData(mockGraph, {
      viewFilter: "hubs",
    });

    const nodeIds = hubsResult.nodes.map((n) => n.id);
    expect(nodeIds).toContain("doc-root"); // inDegree 4 + outDegree 2 = 6 >= 3
    expect(nodeIds).toContain("doc-backend"); // inDegree 2 + outDegree 1 = 3 >= 3
    expect(nodeIds).not.toContain("doc-database"); // 1 < 3
    expect(nodeIds).not.toContain("doc-orphan"); // 0 < 3
  });

  it("filters orphan nodes (degree === 0)", () => {
    const orphansResult = filterGraphData(mockGraph, {
      viewFilter: "orphans",
    });

    const nodeIds = orphansResult.nodes.map((n) => n.id);
    expect(nodeIds).toContain("doc-orphan");
    expect(nodeIds).toContain("space-1");
    expect(nodeIds).not.toContain("doc-root");
    expect(nodeIds).not.toContain("doc-backend");
  });

  it("clusters nodes by folder and decorates with colors", () => {
    const clustered = filterGraphData(mockGraph, {
      clusterByFolder: true,
    });

    const backendNode = clustered.nodes.find((n) => n.id === "doc-backend");
    expect(backendNode?.folderGroup).toBe("backend");
    expect(backendNode?.clusterColor).toBeDefined();

    const rootNode = clustered.nodes.find((n) => n.id === "doc-root");
    expect(rootNode?.folderGroup).toBe("根目录");
    expect(rootNode?.clusterColor).toBe("#94a3b8");
  });
});
