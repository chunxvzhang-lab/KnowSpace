import type { Dispatch, RefObject, SetStateAction } from "react";
import type {
  MindmapLineStyle,
  MindmapNode,
  MindmapNodeShape,
  MindmapTextAlign,
} from "../../core/types";
import type { MindmapTheme } from "../../core/mindmapThemes";
import { branchColorFor } from "../../core/mindmapThemes";
import type { MindmapLayoutNode } from "../../services/mindmapLayout";
import type { MindmapSidecar } from "../../services/mindmapSidecar";
import { iconFor, linkFor, markersFor, noteFor, tagsFor } from "../../services/mindmapSidecar";
import { parseMindmapLink } from "../../core/mindmapLinks";
import { NodeIcon, NodeLinkMark, NodeMarks, NodeNoteMark, NodeTags } from "../MindmapMarks";
import type { MindmapContextMenu } from "./useMindmapAnnotations";

/**
 * The NODE LAYER of the mind map: one `<g>` per laid-out node, drawn in canvas
 * coordinates — the viewport group that contains it carries the pan & zoom.
 *
 * Extracted verbatim from MindmapView's node map (batch 3, wave 3 of the
 * decomposition — the final wave). The map stays here, so the `key` each node
 * `<g>` carries stays on the elements the map renders, exactly as CanvasNodeLayer
 * did for the canvas cards; the DOM, the class names (`.mindmap-node-interactive`
 * and friends) and the event semantics are the contract the test suite reads.
 * Everything the map reads — selection, hover, editing, the drag-and-drop drop
 * targets, the search matches, the sidecar readers, the appearance flags —
 * arrives as explicit props from the view, which still owns the state and the
 * handlers. No memo, here or at the call site: the layer re-renders on every
 * hover frame anyway, and the inline arrow props would silently defeat memo
 * while still paying for the double render.
 *
 * `getContrastTextColor` and `collapseToggleAnchor` moved with it: both were
 * module-level helpers of MindmapView, and the node layer is their only reader.
 */

/**
 * Calculates optimal contrast text color (dark vs white) based on background luminance.
 */
function getContrastTextColor(hexColor?: string): string {
  if (!hexColor || hexColor === "transparent") return "";
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "#ffffff";
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#ffffff";
}

/**
 * Where the collapse toggle sits on a node: just outside the edge its children
 * are on.
 *
 * The answer comes from the layout — either the `side` field the connector pass
 * also uses, or, when the children are spread around the node rather than on one
 * edge, the offset the radial layout worked out. Only the layout knows which way
 * a branch grows; reading it here rather than re-deriving it from coordinates is
 * what keeps the toggle and the connectors agreeing after a layout switch.
 */
function collapseToggleAnchor(node: MindmapLayoutNode): string {
  if (node.toggleOffset) return `translate(${node.toggleOffset.x}, ${node.toggleOffset.y})`;
  if (node.side === "left") return `translate(-1, ${node.height / 2})`;
  if (node.side === "top") return `translate(${node.width / 2}, -1)`;
  if (node.side === "bottom") return `translate(${node.width / 2}, ${node.height + 1})`;
  return `translate(${node.width + 1}, ${node.height / 2})`;
}

type MindmapNodeLayerProps = {
  /** The laid-out nodes, in draw order — `layout.nodes` from useMindmapTreeOps. */
  nodes: MindmapLayoutNode[];
  /** Where the branch colours and the root's appearance come from. */
  mindmapTheme: MindmapTheme;
  /** The companion file; the annotations and the note badge read it per node. */
  sidecar: MindmapSidecar | null;
  editable: boolean;
  hoveredNodeId: string | null;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  selectedNodeIds: Set<string>;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  /** Measured when the context menu opens: it reports in container coordinates. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Opened by a right-click on a node, dismissed by a plain click on one. */
  setContextMenu: Dispatch<SetStateAction<MindmapContextMenu | null>>;
  /** The drag-and-drop landing indicator, from useMindmapViewport. */
  dropTargetId: string | null;
  dropPosition: "before" | "after" | "child";
  /** The in-canvas search matches, and which of them is current. */
  searchMatchIds: string[];
  currentSearchIndex: number;
  /** The tree; the link badge opens against it so a heading link can be found. */
  tree: MindmapNode;
  onJumpToHeading?: (headingId: string, line?: number) => void;
  startEditing: (nodeId?: string) => void;
  handleOpenLink: (root: MindmapNode, nodeId: string) => void;
  /** The outline numbering by node id; null while numbering is off. */
  numbering: Record<string, string> | null;
  handleToggleCollapse: (nodeId: string, e: React.MouseEvent) => void;
  /** Written by the resize handle, streamed on by the container's move handler. */
  setResizingNode: Dispatch<
    SetStateAction<{
      nodeId: string;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    } | null>
  >;
  /** The style writer; a double-click on the resize handle clears the custom size. */
  handleUpdateStyle: (
    nodeId: string,
    styles: {
      color?: string;
      shape?: MindmapNodeShape;
      lineColor?: string;
      lineStyle?: MindmapLineStyle;
      fontSize?: number;
      fontWeight?: "normal" | "bold";
      textColor?: string;
      borderColor?: string;
      textAlign?: MindmapTextAlign;
      customWidth?: number;
      customHeight?: number;
    },
  ) => void;
  /** The drag press state the container's move handler consumes. */
  nodeDragStartRef: RefObject<{
    nodeId: string;
    startX: number;
    startY: number;
    hasMoved: boolean;
  } | null>;
};

export function MindmapNodeLayer({
  nodes,
  mindmapTheme,
  sidecar,
  editable,
  hoveredNodeId,
  setHoveredNodeId,
  selectedNodeIds,
  setSelectedNodeIds,
  containerRef,
  setContextMenu,
  dropTargetId,
  dropPosition,
  searchMatchIds,
  currentSearchIndex,
  tree,
  onJumpToHeading,
  startEditing,
  handleOpenLink,
  numbering,
  handleToggleCollapse,
  setResizingNode,
  handleUpdateStyle,
  nodeDragStartRef,
}: MindmapNodeLayerProps) {
  return (
    // Render Mindmap Nodes
    <g className="mindmap-nodes-group">
      {nodes.map((node) => {
        const defaultBranchColor =
          node.level === 0
            ? (mindmapTheme.root.fill ?? mindmapTheme.node.fill)
            : branchColorFor(mindmapTheme, node.colorIndex);
        const customBg = node.color || "";
        const isCustomTransparent = customBg === "transparent";
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNodeIds.has(node.id);
        const isRoot = node.level === 0;

        // Border stroke calculation
        let strokeColor = defaultBranchColor;
        let strokeWidth = isSelected ? 2.2 : isHovered ? 1.8 : isRoot ? 1.6 : 1.2;

        if (node.borderColor === "transparent") {
          strokeColor = "transparent";
          strokeWidth = 0;
        } else if (node.borderColor) {
          strokeColor = node.borderColor;
        } else if (customBg && !isCustomTransparent) {
          strokeColor = isSelected
            ? "var(--accent-info)"
            : isHovered
              ? "rgba(255, 255, 255, 0.75)"
              : "rgba(0, 0, 0, 0.18)";
        }

        // Automatic high-contrast text color when custom background is set
        const autoContrastTextColor =
          customBg && !isCustomTransparent ? getContrastTextColor(customBg) : "";
        const resolvedTextColor =
          node.textColor || autoContrastTextColor || (isRoot ? "var(--accent-info)" : undefined);

        return (
          <g
            key={node.id}
            className={`mindmap-node-interactive ${isRoot ? "is-root" : ""} ${
              isSelected ? "is-selected" : ""
            } ${isHovered ? "is-hovered" : ""} ${dropTargetId === node.id ? "is-drop-target" : ""} ${
              searchMatchIds.includes(node.id) ? "is-search-match" : ""
            }`}
            transform={`translate(${node.x}, ${node.y})`}
            onMouseEnter={() => setHoveredNodeId(node.id)}
            onMouseLeave={() => setHoveredNodeId(null)}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              if (!isRoot && editable) {
                nodeDragStartRef.current = {
                  nodeId: node.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  hasMoved: false,
                };
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.shiftKey || e.ctrlKey) {
                setSelectedNodeIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              } else {
                setSelectedNodeIds(new Set([node.id]));
              }
              setContextMenu(null);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (editable) {
                startEditing(node.id);
              } else if (!isRoot && onJumpToHeading) {
                onJumpToHeading(node.id, node.line);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!selectedNodeIds.has(node.id)) {
                setSelectedNodeIds(new Set([node.id]));
              }
              const containerRect = containerRef.current?.getBoundingClientRect();
              const cX = containerRect ? e.clientX - containerRect.left : e.clientX;
              const cY = containerRect ? e.clientY - containerRect.top : e.clientY;
              setContextMenu({ x: cX, y: cY, nodeId: node.id });
            }}
          >
            <title>
              {isRoot
                ? "中心主题 (右键设置样式，按 Tab 添加子主题)"
                : `${node.text} (可按住拖拽至其他主题移为子分支，双击编辑，右键设置样式)`}
            </title>

            {/* Drop Target Adsorption Glowing Ring */}
            {dropTargetId === node.id && (
              <g className="mindmap-drop-target-indicator">
                <rect
                  x={-7}
                  y={-7}
                  width={node.width + 14}
                  height={node.height + 14}
                  rx={12}
                  ry={12}
                  fill="rgba(var(--accent-info-rgb), 0.22)"
                  stroke="var(--accent-info)"
                  strokeWidth={2.5}
                  strokeDasharray="5 3"
                />
                <text
                  x={node.width / 2}
                  y={-10}
                  textAnchor="middle"
                  fill="var(--accent-info)"
                  fontSize={11}
                  fontWeight="bold"
                >
                  {dropPosition === "before"
                    ? "↑ 插入到此主题之前"
                    : dropPosition === "after"
                      ? "↓ 插入到此主题之后"
                      : "+ 移为子主题"}
                </text>
              </g>
            )}

            {/* Where exactly the dragged node would land. The ring above
                says which node is the target; this says whether the drop
                reorders among its siblings or reparents under it. */}
            {dropTargetId === node.id && dropPosition !== "child" && (
              <line
                className="mindmap-drop-insert-line"
                x1={-6}
                x2={node.width + 6}
                y1={dropPosition === "before" ? -8 : node.height + 8}
                y2={dropPosition === "before" ? -8 : node.height + 8}
                stroke="var(--accent-info)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            )}

            {/* In-Canvas Search Match Ring */}
            {searchMatchIds.includes(node.id) && (
              <rect
                x={-5}
                y={-5}
                width={node.width + 10}
                height={node.height + 10}
                rx={10}
                ry={10}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={searchMatchIds[currentSearchIndex] === node.id ? 3 : 1.8}
                strokeDasharray={searchMatchIds[currentSearchIndex] === node.id ? "none" : "4 2"}
              />
            )}

            {/* Selection Glow Outline */}
            {isSelected && (
              <rect
                x={-3}
                y={-3}
                width={node.width + 6}
                height={node.height + 6}
                rx={
                  node.shape === "capsule"
                    ? (node.height + 6) / 2
                    : node.shape === "rect"
                      ? 0
                      : node.shape === "underline"
                        ? 4
                        : isRoot
                          ? 11
                          : 9
                }
                ry={
                  node.shape === "capsule"
                    ? (node.height + 6) / 2
                    : node.shape === "rect"
                      ? 0
                      : node.shape === "underline"
                        ? 4
                        : isRoot
                          ? 11
                          : 9
                }
                className="mindmap-node-selection-ring"
                stroke="var(--accent-info)"
                strokeWidth={2}
                fill="none"
                strokeDasharray="4 2"
              />
            )}

            {/* Node Capsule / Rounded / Rect / Underline Background */}
            {node.shape === "underline" ? (
              <>
                <rect
                  width={node.width}
                  height={node.height}
                  fill="transparent"
                  className="mindmap-node-rect-underline"
                />
                <line
                  x1={0}
                  y1={node.height - 2}
                  x2={node.width}
                  y2={node.height - 2}
                  stroke={
                    node.borderColor ||
                    (customBg && !isCustomTransparent ? customBg : defaultBranchColor)
                  }
                  strokeWidth={isSelected ? 2.8 : isHovered ? 2.2 : 1.8}
                />
              </>
            ) : (
              <rect
                width={node.width}
                height={node.height}
                rx={
                  node.shape === "capsule"
                    ? node.height / 2
                    : node.shape === "rect"
                      ? 0
                      : node.shape === "rounded"
                        ? 6
                        : isRoot
                          ? 8
                          : 6
                }
                ry={
                  node.shape === "capsule"
                    ? node.height / 2
                    : node.shape === "rect"
                      ? 0
                      : node.shape === "rounded"
                        ? 6
                        : isRoot
                          ? 8
                          : 6
                }
                className="mindmap-node-rect"
                data-custom-color={!!customBg}
                data-transparent={isCustomTransparent}
                style={{
                  fill: isCustomTransparent ? "transparent" : customBg || undefined,
                  stroke: strokeColor,
                  strokeWidth: strokeWidth,
                }}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                filter={isSelected || isHovered ? "url(#node-glow)" : undefined}
              />
            )}

            {/* Node Label Text - Rendered via <tspan> for multi-line and text alignments */}
            {(() => {
              const lines = node.lines && node.lines.length > 0 ? node.lines : [node.text];
              const align = node.textAlign || "center";
              const effectiveFontSize = node.fontSize || (isRoot ? 15 : 13);
              const lineHeight = Math.round(effectiveFontSize * 1.38);
              const padX = isRoot ? 18 : 12;
              const innerWidth = Math.max(20, node.width - padX * 2);

              // Vertical centering: each line is placed at the center of its
              // line box and rendered with dominant-baseline: central.
              const totalTextHeight = lines.length * lineHeight;
              const firstLineCenterY = (node.height - totalTextHeight) / 2 + lineHeight / 2;

              let textAnchor: "middle" | "start" | "end" = "middle";
              let xPos = node.width / 2;

              if (align === "left") {
                textAnchor = "start";
                xPos = padX;
              } else if (align === "right") {
                textAnchor = "end";
                xPos = node.width - padX;
              } else if (align === "justify") {
                textAnchor = "start";
                xPos = padX;
              }

              return (
                <text
                  className={`mindmap-node-title-text ${isRoot ? "root-title" : ""}`}
                  style={{
                    fontSize: `${effectiveFontSize}px`,
                    fontWeight: node.fontWeight
                      ? node.fontWeight === "bold"
                        ? 700
                        : 400
                      : isRoot
                        ? 700
                        : 500,
                    fill: resolvedTextColor || undefined,
                    // Inline styles beat author CSS, guaranteeing the chosen
                    // alignment actually takes effect on the SVG text.
                    textAnchor,
                    dominantBaseline: "central",
                  }}
                >
                  {lines.map((line, idx) => {
                    const isNotLast = idx < lines.length - 1;
                    const isJustified = align === "justify" && isNotLast && line.trim().length > 1;

                    return (
                      <tspan
                        key={idx}
                        x={xPos}
                        y={firstLineCenterY + idx * lineHeight}
                        textLength={isJustified ? innerWidth : undefined}
                        lengthAdjust={isJustified ? "spacing" : undefined}
                      >
                        {line}
                      </tspan>
                    );
                  })}
                </text>
              );
            })()}

            {/* What the node carries but the document cannot say: an icon
                on its leading edge, a note badge and the marks on its corners.
                The same drawings a floating topic wears — see
                MindmapFloatingTopics, which is handed the same decorations. */}
            <NodeIcon iconId={iconFor(sidecar, node.id)} />
            <NodeMarks width={node.width} markers={markersFor(sidecar, node.id)} />
            <NodeTags height={node.height} tags={tagsFor(sidecar, node.id)} />
            {/* Only for a link this build recognises: the badge says "this
                goes somewhere", and a mark that promised a trip for text
                that leads nowhere would be the one lie on the map. Text
                that is not a link still shows in the panel, with the hint. */}
            {parseMindmapLink(linkFor(sidecar, node.id)) ? (
              // Clickable: the badge is where a reader sees "this goes somewhere",
              // so it should be where they can go. The panel keeps its own 打开
              // button for the same journey with the destination written out first.
              <NodeLinkMark
                height={node.height}
                onOpen={() => handleOpenLink(tree, node.id)}
                label={linkFor(sidecar, node.id)}
              />
            ) : null}

            {/* Outline numbering, drawn above the node's left corner.
                Beside the text and not inside it: the text is what gets
                written back to the document, and a number in it would be
                a number the reader never typed. The corner is the one
                place nothing else claims — the note badge sits on it, the
                marks are opposite, and the icon is further left. */}
            {numbering?.[node.id] ? (
              <text className="mindmap-node-number" x={4} y={-5}>
                {numbering[node.id]}
              </text>
            ) : null}

            {/* A note is the one thing about a node the document cannot
                show, so the map says where one is: a badge on the node's
                leading corner, drawn for the eye rather than the cursor. */}
            {noteFor(sidecar, node.id) ? <NodeNoteMark /> : null}

            {/* Children Collapse/Expand Toggle Button (+ / - geometrically centered via SVG vector lines).
                Hung off the edge the children are actually on: the default layout grows
                everything right, so nothing moves there, while a branch on the left of a
                bidirectional map and every parent in the vertical layout would otherwise
                end up with the toggle in the middle of the row below it. */}
            {node.hasChildren && (
              <g
                className="mindmap-collapse-btn"
                transform={collapseToggleAnchor(node)}
                onClick={(e) => handleToggleCollapse(node.id, e)}
              >
                <circle
                  r={7}
                  className="mindmap-collapse-circle"
                  stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                  strokeWidth={1.2}
                />
                {/* Horizontal bar of minus / plus - guaranteed centered at y=0 */}
                <line
                  x1={-3.2}
                  y1={0}
                  x2={3.2}
                  y2={0}
                  stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                {/* Vertical bar of plus when collapsed - guaranteed centered at x=0 */}
                {node.collapsed && (
                  <line
                    x1={0}
                    y1={-3.2}
                    x2={0}
                    y2={3.2}
                    stroke={strokeColor !== "transparent" ? strokeColor : defaultBranchColor}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                )}
                <title>{node.collapsed ? "展开子分支" : "折叠子分支"}</title>
              </g>
            )}

            {/* Manual Resize Handle at bottom-right corner */}
            {editable && (isHovered || isSelected) && (
              <g
                className="mindmap-node-resize-handle"
                transform={`translate(${node.width - 9}, ${node.height - 9})`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setResizingNode({
                    nodeId: node.id,
                    startX: e.clientX,
                    startY: e.clientY,
                    startWidth: node.width,
                    startHeight: node.height,
                  });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleUpdateStyle(node.id, {
                    customWidth: undefined,
                    customHeight: undefined,
                  });
                }}
              >
                <rect
                  x={0}
                  y={0}
                  width={9}
                  height={9}
                  fill="transparent"
                  className="mindmap-resize-hitarea"
                />
                {/* Diagonal grip marks */}
                <line
                  x1={7}
                  y1={2}
                  x2={2}
                  y2={7}
                  stroke="var(--accent-info)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                <line
                  x1={7}
                  y1={5}
                  x2={5}
                  y2={7}
                  stroke="var(--accent-info)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                />
                <title>拖动调整节点大小（双击恢复自动自适应）</title>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
