import { ExternalLink, X } from "lucide-react";
import type { RefObject } from "react";
import type { GraphSelectedNode } from "./useCytoscapeGraph";

type GraphNodeInspectorProps = {
  /** The node the Cytoscape tap handlers selected; the pane guards the null case. */
  selectedNode: GraphSelectedNode;
  /**
   * The onSelectNode mirror, kept a ref on purpose: the jump button reads
   * `.current` at click time, so it always calls the latest callback even
   * between renders — the original late-binding contract.
   */
  onSelectNodeRef: RefObject<(docId: string) => void>;
  /** Clears the selection (the pane's `setSelectedNode(null)`). */
  onClose: () => void;
};

/**
 * The selected-node details card of the graph view: type/folder/current badges,
 * title, optional path, the in/out/cross-folder metric grid and the open button.
 *
 * Extracted verbatim from GraphViewPane's inspector JSX (decomposition of the
 * pane); the pane keeps the `selectedNode &&` conditional. The DOM, class names
 * and metrics are the contract. No memo, here or at the call site.
 */
export function GraphNodeInspector({
  selectedNode,
  onSelectNodeRef,
  onClose,
}: GraphNodeInspectorProps) {
  return (
    <div className="graph-pane-inspector">
      {/* Top row: Badges on left, Close button on right */}
      <div className="inspector-meta-row">
        <div className="inspector-badges">
          <span className={`node-type-badge type-${selectedNode.type}`}>
            {selectedNode.type === "space" ? "⚡ 闪念" : "📄 文档"}
          </span>
          {selectedNode.folderGroup && (
            <span className="node-folder-badge" title={`所属文件夹: ${selectedNode.folderGroup}`}>
              📁 {selectedNode.folderGroup}
            </span>
          )}
          {selectedNode.isCurrent && <span className="node-current-badge">当前</span>}
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          onClick={onClose}
          title="关闭详情卡片"
          aria-label="关闭详情卡片"
        >
          <X size={13} />
        </button>
      </div>

      {/* Dedicated Title Row */}
      <h4 className="inspector-card-title" title={selectedNode.label}>
        {selectedNode.label}
      </h4>

      {/* Optional Path Subtitle */}
      {selectedNode.path && (
        <div className="inspector-card-path" title={selectedNode.path}>
          {selectedNode.path}
        </div>
      )}

      {/* 3-Column Metrics Grid */}
      <div className="inspector-metrics-grid">
        <div className="inspector-stat-cell" title="反向双链引用数 (入度)">
          <span className="stat-num">{selectedNode.inDegree}</span>
          <span className="stat-label">被引用</span>
        </div>
        <div className="inspector-stat-cell" title="正向引出双链数 (出度)">
          <span className="stat-num">{selectedNode.outDegree}</span>
          <span className="stat-label">引出</span>
        </div>
        <div className="inspector-stat-cell" title="跨越不同文件夹的双链连线数">
          <span className="stat-num highlight-cyan">{selectedNode.crossFolderCount ?? 0}</span>
          <span className="stat-label">跨目录</span>
        </div>
      </div>

      {/* Open Document Action */}
      <button
        type="button"
        className="inspector-jump-btn"
        onClick={() => onSelectNodeRef.current(selectedNode.id)}
      >
        <ExternalLink size={13} />
        <span>在左侧打开文档</span>
      </button>
    </div>
  );
}
