import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import { Table } from "lucide-react";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface TablePickerPanelProps {
  onInsert: (rows: number, cols: number) => void;
  anchorPos: { left: number; top: number };
  containerRef: RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * The custom-table dimension picker: 8×6 hover matrix, numeric steppers and
 * preset pills, inserting via `generateMarkdownTable` in the caller.
 *
 * Moved verbatim from EditorContextMenu (decomposition of the context menu):
 * it was already a self-contained, props-only internal component there — the
 * hover/stepper state and the mount-time viewport clamp below are the
 * originals, so the panel stays inert until hovered and never reports a
 * position outside the viewport.
 */
export function TablePickerPanel({
  onInsert,
  anchorPos,
  containerRef,
  onMouseEnter,
  onMouseLeave,
}: TablePickerPanelProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const [pos, setPos] = useState(anchorPos);

  useIsomorphicLayoutEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    let nextTop = anchorPos.top;
    let nextLeft = anchorPos.left;

    if (rect.bottom > vh - 12) {
      const overflow = rect.bottom - (vh - 12);
      nextTop = Math.max(12, anchorPos.top - overflow);
    }
    if (rect.right > vw - 12) {
      const overflow = rect.right - (vw - 12);
      nextLeft = Math.max(12, anchorPos.left - overflow);
    }
    if (nextTop !== pos.top || nextLeft !== pos.left) {
      setPos({ left: nextLeft, top: nextTop });
    }
  }, [anchorPos.top, anchorPos.left, containerRef]);

  const effectiveRows = hoveredRow !== null ? hoveredRow : rows;
  const effectiveCols = hoveredCol !== null ? hoveredCol : cols;

  const handleCellClick = (r: number, c: number) => {
    onInsert(r, c);
  };

  const handleApply = () => {
    onInsert(rows, cols);
  };

  const presets = [
    { label: "2×2", r: 2, c: 2 },
    { label: "3×3", r: 3, c: 3 },
    { label: "4×5", r: 4, c: 5 },
    { label: "5×5", r: 5, c: 5 },
    { label: "8×4", r: 4, c: 8 },
  ];

  return (
    <div
      ref={containerRef}
      className="editor-context-menu portal-submenu table-picker-panel"
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      aria-label="自定义表格行列选择器"
    >
      <div className="table-picker-header">
        <div className="table-picker-title">
          <Table size={15} style={{ color: "var(--accent-info)" }} />
          <span>自定义表格</span>
        </div>
        <span className="table-picker-badge">
          {effectiveRows} 行 × {effectiveCols} 列
        </span>
      </div>

      <div className="table-picker-desc">
        {effectiveRows > 1 ? `1 行表头 + ${effectiveRows - 1} 行数据` : "1 行表头"}
      </div>

      {/* 8 cols x 6 rows visual matrix */}
      <div
        className="table-grid-matrix"
        onMouseLeave={() => {
          setHoveredRow(null);
          setHoveredCol(null);
        }}
      >
        {Array.from({ length: 6 }, (_, rIndex) => {
          const r = rIndex + 1;
          return Array.from({ length: 8 }, (_, cIndex) => {
            const c = cIndex + 1;
            const isHighlighted = r <= effectiveRows && c <= effectiveCols;
            return (
              <div
                key={`${r}-${c}`}
                className={`table-grid-cell ${isHighlighted ? "highlighted" : ""}`}
                onMouseEnter={() => {
                  setHoveredRow(r);
                  setHoveredCol(c);
                }}
                onClick={() => handleCellClick(r, c)}
                title={`${r} 行 × ${c} 列 表格 (点击插入)`}
              />
            );
          });
        })}
      </div>

      {/* Steppers for rows and columns */}
      <div className="table-picker-controls">
        <div className="table-dimension-stepper">
          <span className="table-dim-label">行数:</span>
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setRows((prev) => Math.max(1, prev - 1))}
            title="减少行数"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            max={50}
            className="table-num-input"
            value={rows}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) setRows(Math.max(1, Math.min(50, val)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
          />
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setRows((prev) => Math.min(50, prev + 1))}
            title="增加行数"
          >
            +
          </button>
        </div>

        <div className="table-dimension-stepper">
          <span className="table-dim-label">列数:</span>
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setCols((prev) => Math.max(1, prev - 1))}
            title="减少列数"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            max={20}
            className="table-num-input"
            value={cols}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) setCols(Math.max(1, Math.min(20, val)));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApply();
            }}
          />
          <button
            type="button"
            className="table-step-btn"
            onClick={() => setCols((prev) => Math.min(20, prev + 1))}
            title="增加列数"
          >
            +
          </button>
        </div>
      </div>

      {/* Preset pills */}
      <div className="table-presets-row">
        <span style={{ fontSize: "11px", opacity: 0.65 }}>常用:</span>
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            className="table-preset-chip"
            onClick={() => {
              setRows(p.r);
              setCols(p.c);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Primary Confirm Button */}
      <button type="button" className="table-insert-btn" onClick={handleApply}>
        <Table size={13} />
        <span>确认插入表格 (Enter)</span>
      </button>
    </div>
  );
}
