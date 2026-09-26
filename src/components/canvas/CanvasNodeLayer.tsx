import type {
  ChangeEvent as ReactChangeEvent,
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from "react";
import type { CanvasFileNode, CanvasNode, CanvasNodeSide } from "../../types/canvasTypes";
import { getCanvasThemeColors } from "../../services/canvasTheme";
import { getNodePalette } from "./canvasPalette";
import type { ConnectingState } from "./useCanvasConnect";
import { CanvasGroupView } from "./CanvasGroupView";
import { CanvasCardView, type CanvasCardSuggestState } from "./CanvasCardView";

// ── Shared per-node chrome helpers ─────────────────────────────────────────
// These were module-level helpers in CanvasView and only the node layer ever
// used them, so they moved here with it (wave 3 of the CanvasView
// decomposition). CanvasGroupView and CanvasCardView import them from this one
// definition so the two views cannot drift apart.

export const SIDES: CanvasNodeSide[] = ["top", "right", "bottom", "left"];

export function hexToRgbString(hex: string): string | null {
  const cleanHex = hex.replace(/^#/, "").trim();
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return `${r}, ${g}, ${b}`;
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return `${r}, ${g}, ${b}`;
  }
  return null;
}

export const resizeHandleStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  bottom: 0,
  width: 14,
  height: 14,
  cursor: "nwse-resize",
  borderRight: "3px solid #f59e0b",
  borderBottom: "3px solid #f59e0b",
  borderBottomRightRadius: 8,
};

export function getAnchorDotStyle(
  side: CanvasNodeSide,
  colors: ReturnType<typeof getCanvasThemeColors>,
): CSSProperties {
  const base: CSSProperties = {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: "50%",
    backgroundColor: colors.anchorDotBg,
    border: "2px solid #ffffff",
    cursor: "crosshair",
    zIndex: 20,
    boxShadow: "0 0 6px rgba(0,0,0,0.35)",
    transition: "transform 0.15s ease",
  };

  switch (side) {
    case "top":
      return { ...base, top: -5.5, left: "50%", transform: "translateX(-50%)" };
    case "bottom":
      return { ...base, bottom: -5.5, left: "50%", transform: "translateX(-50%)" };
    case "left":
      return { ...base, left: -5.5, top: "50%", transform: "translateY(-50%)" };
    case "right":
    default:
      return { ...base, right: -5.5, top: "50%", transform: "translateY(-50%)" };
  }
}

// ── The node layer ─────────────────────────────────────────────────────────

/**
 * The MULTIMODAL CARDS LAYER of the canvas: one element per visible node, in
 * board coordinates (the world transform in CanvasView scales it).
 *
 * Extracted verbatim from CanvasView's node map (wave 3 of the CanvasView
 * decomposition). The branch dispatch stays here; the per-branch JSX lives in
 * `CanvasGroupView` and `CanvasCardView`. Neither view is memoised: the layer
 * re-renders on every pan/hover frame anyway, and inline arrow props would
 * silently defeat memo while still paying for the double render — that
 * decision belongs to a later wave.
 */
type CanvasNodeLayerProps = {
  nodes: CanvasNode[];
  editable: boolean;
  colors: ReturnType<typeof getCanvasThemeColors>;
  isDark: boolean;
  isEink: boolean;
  selectedNodeIds: Set<string>;
  hoveredNodeId: string | null;
  setHoveredNodeId: Dispatch<SetStateAction<string | null>>;
  editingNodeId: string | null;
  editingText: string;
  setEditingNodeId: Dispatch<SetStateAction<string | null>>;
  setEditingText: Dispatch<SetStateAction<string>>;
  connectingState: ConnectingState | null;
  isPresentationMode: boolean;
  presentationSequence: string[];
  currentSlideIndex: number;
  /** Slide/group lookups for the presentation context. */
  nodeMap: Map<string, CanvasNode>;
  /** Per-node outgoing edge info (the one-to-many source badge). */
  nodeOutgoingMap: Map<string, { count: number; color?: string; targets: string[] }>;
  currentMultiRootNode: CanvasNode | undefined;
  /** Source-aware display colour of each card (shared with the exporter). */
  sourceDisplayColorMap: Map<string, string>;
  /** Viewport culling gate — kept in CanvasView, which owns the frustum. */
  isNodeInViewport: (node: CanvasNode) => boolean;
  hasDraggedRef: RefObject<boolean>;
  cardSuggest: CanvasCardSuggestState | null;
  setCardSuggest: Dispatch<SetStateAction<CanvasCardSuggestState | null>>;
  cardEditorRef: RefObject<HTMLTextAreaElement | null>;
  currentFilePath: string | undefined;
  onOpenFile: ((filePath: string) => void) | undefined;
  setSelectedNodeId: (id: string | null) => void;
  setSelectedEdgeId: (id: string | null) => void;
  handleNodeDragStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleNodeResizeStart: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleAnchorMouseDown: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleAnchorMouseUp: (e: ReactMouseEvent, nodeId: string, side: CanvasNodeSide) => void;
  handleCardMouseUpForConnect: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleContextMenuNode: (e: ReactMouseEvent, node: CanvasNode) => void;
  handleJumpToSlide: (index: number) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDuplicateNode: (nodeId: string) => void;
  handleNodeColorChange: (nodeId: string, color: string) => void;
  handleSaveNodeEdit: () => void;
  handleSave: () => void;
  handleCardEditorChange: (e: ReactChangeEvent<HTMLTextAreaElement>) => void;
  moveCardSuggest: (delta: number) => void;
  pickCardSuggest: (index: number) => void;
  handleCardBodyActivate: (event: ReactMouseEvent<HTMLDivElement>) => void;
  openMediaPreview: (node: CanvasFileNode) => void;
};

export function CanvasNodeLayer({
  nodes,
  editable,
  colors,
  isDark,
  isEink,
  selectedNodeIds,
  hoveredNodeId,
  setHoveredNodeId,
  editingNodeId,
  editingText,
  setEditingNodeId,
  setEditingText,
  connectingState,
  isPresentationMode,
  presentationSequence,
  currentSlideIndex,
  nodeMap,
  nodeOutgoingMap,
  currentMultiRootNode,
  sourceDisplayColorMap,
  isNodeInViewport,
  hasDraggedRef,
  cardSuggest,
  setCardSuggest,
  cardEditorRef,
  currentFilePath,
  onOpenFile,
  setSelectedNodeId,
  setSelectedEdgeId,
  handleNodeDragStart,
  handleNodeResizeStart,
  handleAnchorMouseDown,
  handleAnchorMouseUp,
  handleCardMouseUpForConnect,
  handleContextMenuNode,
  handleJumpToSlide,
  handleDeleteNode,
  handleDuplicateNode,
  handleNodeColorChange,
  handleSaveNodeEdit,
  handleSave,
  handleCardEditorChange,
  moveCardSuggest,
  pickCardSuggest,
  handleCardBodyActivate,
  openMediaPreview,
}: CanvasNodeLayerProps) {
  return (
    <>
      {nodes.map((node) => {
        if (!isNodeInViewport(node)) return null;
        const isSelected = selectedNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isEditing = editingNodeId === node.id;
        const palette = getNodePalette(node.color);

        // Render Group Container (z-index: 2)
        if (node.type === "group") {
          return (
            <CanvasGroupView
              key={node.id}
              node={node}
              isSelected={isSelected}
              isHovered={isHovered}
              isEditing={isEditing}
              palette={palette}
              editable={editable}
              colors={colors}
              isDark={isDark}
              isEink={isEink}
              isPresentationMode={isPresentationMode}
              presentationSequence={presentationSequence}
              currentSlideIndex={currentSlideIndex}
              nodeMap={nodeMap}
              nodeOutgoingMap={nodeOutgoingMap}
              selectedNodeIds={selectedNodeIds}
              currentMultiRootNode={currentMultiRootNode}
              connectingState={connectingState}
              editingText={editingText}
              setHoveredNodeId={setHoveredNodeId}
              setSelectedNodeId={setSelectedNodeId}
              setSelectedEdgeId={setSelectedEdgeId}
              setEditingNodeId={setEditingNodeId}
              setEditingText={setEditingText}
              hasDraggedRef={hasDraggedRef}
              handleNodeDragStart={handleNodeDragStart}
              handleNodeResizeStart={handleNodeResizeStart}
              handleAnchorMouseDown={handleAnchorMouseDown}
              handleAnchorMouseUp={handleAnchorMouseUp}
              handleCardMouseUpForConnect={handleCardMouseUpForConnect}
              handleContextMenuNode={handleContextMenuNode}
              handleJumpToSlide={handleJumpToSlide}
              handleDeleteNode={handleDeleteNode}
              handleSaveNodeEdit={handleSaveNodeEdit}
            />
          );
        }

        // Render Normal Cards (Text, File, Link) (z-index: 10)
        return (
          <CanvasCardView
            key={node.id}
            node={node}
            isSelected={isSelected}
            isHovered={isHovered}
            isEditing={isEditing}
            palette={palette}
            editable={editable}
            colors={colors}
            isDark={isDark}
            isEink={isEink}
            isPresentationMode={isPresentationMode}
            presentationSequence={presentationSequence}
            currentSlideIndex={currentSlideIndex}
            selectedNodeIds={selectedNodeIds}
            currentMultiRootNode={currentMultiRootNode}
            nodeOutgoingMap={nodeOutgoingMap}
            sourceDisplayColorMap={sourceDisplayColorMap}
            connectingState={connectingState}
            editingText={editingText}
            setEditingNodeId={setEditingNodeId}
            setEditingText={setEditingText}
            cardSuggest={cardSuggest}
            setCardSuggest={setCardSuggest}
            cardEditorRef={cardEditorRef}
            hasDraggedRef={hasDraggedRef}
            currentFilePath={currentFilePath}
            onOpenFile={onOpenFile}
            setHoveredNodeId={setHoveredNodeId}
            setSelectedNodeId={setSelectedNodeId}
            setSelectedEdgeId={setSelectedEdgeId}
            handleNodeDragStart={handleNodeDragStart}
            handleNodeResizeStart={handleNodeResizeStart}
            handleAnchorMouseDown={handleAnchorMouseDown}
            handleAnchorMouseUp={handleAnchorMouseUp}
            handleCardMouseUpForConnect={handleCardMouseUpForConnect}
            handleContextMenuNode={handleContextMenuNode}
            handleJumpToSlide={handleJumpToSlide}
            handleDeleteNode={handleDeleteNode}
            handleDuplicateNode={handleDuplicateNode}
            handleNodeColorChange={handleNodeColorChange}
            handleSaveNodeEdit={handleSaveNodeEdit}
            handleSave={handleSave}
            handleCardEditorChange={handleCardEditorChange}
            moveCardSuggest={moveCardSuggest}
            pickCardSuggest={pickCardSuggest}
            handleCardBodyActivate={handleCardBodyActivate}
            openMediaPreview={openMediaPreview}
          />
        );
      })}
    </>
  );
}
