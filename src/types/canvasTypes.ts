/**
 * JSON Canvas 1.0 Specification Type Definitions
 * Compatible with the open source JSON Canvas standard (https://jsoncanvas.org/)
 */

export type CanvasColorId = "1" | "2" | "3" | "4" | "5" | "6" | string;

export type CanvasNodeSide = "top" | "right" | "bottom" | "left";

export type CanvasEdgeEnd = "none" | "arrow";

export type CanvasEdgeLineStyle = "bezier" | "step" | "straight";

export type CanvasEdgeLabelShape = "pill" | "rect" | "diamond";

export interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColorId;
}

export interface CanvasTextNode extends CanvasNodeBase {
  type: "text";
  text: string;
}

export interface CanvasFileNode extends CanvasNodeBase {
  type: "file";
  file: string; // Relative path or filename of markdown note
  subpath?: string; // Optional heading or block reference
}

export interface CanvasLinkNode extends CanvasNodeBase {
  type: "link";
  url: string;
}

export interface CanvasGroupNode extends CanvasNodeBase {
  type: "group";
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

export type CanvasEdgeStrokePattern = "solid" | "dashed" | "dotted";

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasNodeSide;
  fromEnd?: CanvasEdgeEnd;
  toNode: string;
  toSide?: CanvasNodeSide;
  toEnd?: CanvasEdgeEnd;
  color?: CanvasColorId;
  label?: string;
  style?: CanvasEdgeLineStyle;
  labelShape?: CanvasEdgeLabelShape;
  strokePattern?: CanvasEdgeStrokePattern;
  stepOffset?: number;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasHistoryState {
  past: CanvasData[];
  present: CanvasData;
  future: CanvasData[];
}
