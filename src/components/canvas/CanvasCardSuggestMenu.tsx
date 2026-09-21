import { useEffect, useRef } from "react";
import type { CanvasThemeColors } from "../../services/canvasTheme";

/** One row of the popup. The caller owns what a row means; this only draws it. */
export interface CanvasCardSuggestItem {
  /** Stable identity, for React's list key. */
  key: string;
  /** Leading glyph — a command's icon. Notes have none. */
  icon?: string;
  title: string;
  /** Right-aligned detail: a command's description, a note's path. */
  subtitle?: string;
}

export type CanvasCardSuggestMenuProps = {
  /** Omitted for the command list, which explains itself with its icons. */
  header?: string;
  items: CanvasCardSuggestItem[];
  selectedIndex: number;
  emptyText: string;
  /** Where to draw it, in screen pixels. */
  x: number;
  y: number;
  colors: CanvasThemeColors;
  isDark: boolean;
  isEink: boolean;
  onPick: (index: number) => void;
  onHover: (index: number) => void;
};

/**
 * The suggestion popup inside a canvas card's editor.
 *
 * Two things open it — `[[` for a note, `/` for a command — so it takes rows
 * rather than knowing about either one.
 *
 * It is drawn through a portal by the caller: a card lives inside the canvas's
 * transformed world, and a popup rendered there would be scaled and clipped with
 * it. For the same reason the colours come from the canvas theme rather than from
 * the stylesheet, which only knows about the app's theme. The metrics mirror the
 * document editor's completion popup (`styles.css` → `.cm-tooltip-autocomplete`),
 * because `/` is supposed to read the same in both editors.
 *
 * Being portalled is also why this popup has to stop the wheel itself. The canvas
 * pans on wheel and decides whose wheel it is by walking up from the event target
 * to the canvas root (`services/wheelScrollGuard.ts`) — but this popup's DOM chain
 * is `menu → body → html`, so that walk never reaches the canvas root and the
 * popup is invisible to it. The event still arrives at the canvas, because React
 * propagates through the component tree rather than the DOM tree. Every other
 * popup in this folder (`ExportModal`, `FilePickerModal`, `ExtractModal`,
 * `SpawnBranchModal`) stops the wheel the same way.
 */
export function CanvasCardSuggestMenu({
  header,
  items,
  selectedIndex,
  emptyText,
  x,
  y,
  colors,
  isDark,
  isEink,
  onPick,
  onHover,
}: CanvasCardSuggestMenuProps) {
  const accent = isEink ? "rgba(0,0,0,0.10)" : !isDark ? "rgba(245,158,11,0.15)" : "rgba(56,189,248,0.2)";
  const accentText = isEink ? "#000000" : !isDark ? "#b45309" : "#38bdf8";
  const menuRef = useRef<HTMLDivElement | null>(null);

  /**
   * Keep the highlighted row on screen.
   *
   * The list is capped at 260px, so arrowing past the bottom used to move the
   * highlight out of sight — the popup looked like it had stopped responding, and
   * the only way to find the selection again was to arrow back.
   *
   * `block: "nearest"` is the load-bearing part. It scrolls only as far as the row
   * needs and only when the row is not already visible, so a hover or a wheel that
   * leaves the row in view does not nudge the list under the reader. It also
   * cannot drag the page: `nearest` never scrolls an ancestor that does not need
   * to move.
   *
   * The row is looked up through the listbox roles instead of through a ref per
   * row because the rows are re-created whenever the query narrows the list; a ref
   * array would have to be rebuilt on every keystroke and would still be one
   * render behind the row that is actually selected.
   */
  useEffect(() => {
    const active = menuRef.current?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]'
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, items.length]);

  return (
    <div
      ref={menuRef}
      className="canvas-card-suggest-menu"
      role="listbox"
      style={{
        position: "fixed",
        left: x,
        top: y + 20,
        zIndex: 10001,
        backgroundColor: isEink ? "#f4f1ea" : !isDark ? "#ffffff" : "#1e293b",
        color: colors.cardText,
        border: `1px solid ${colors.cardBorder}`,
        boxShadow: !isDark ? "0 10px 32px rgba(0,0,0,0.16)" : "0 14px 40px rgba(0,0,0,0.55)",
        borderRadius: 10,
        padding: "4px 0",
        minWidth: 240,
        maxWidth: 320,
        maxHeight: 260,
        overflowY: "auto",
        fontSize: 13,
        userSelect: "none",
      }}
      // mousedown, not click: the textarea must not lose focus and close the
      // popup before the pick registers.
      onMouseDown={(e) => e.preventDefault()}
      // A wheel over the popup scrolls the list and nothing else. Without this it
      // scrolled the list *and* panned the whiteboard behind it, so the two moved
      // together. See the component comment for why the canvas's own ownership
      // check cannot cover a portalled popup. Stopping propagation does not stop
      // the browser's default scroll, so the list still scrolls normally.
      onWheel={(e) => e.stopPropagation()}
    >
      {header && (
        <div
          className="canvas-card-suggest-header"
          style={{
            padding: "4px 12px 6px",
            fontSize: 11,
            fontWeight: 600,
            color: colors.edgeColor,
            borderBottom: `1px solid ${colors.cardHeaderBorder}`,
          }}
        >
          {header}
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ padding: "8px 12px", opacity: 0.7 }}>{emptyText}</div>
      ) : (
        items.map((item, idx) => {
          const active = idx === selectedIndex;
          return (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={active}
              className={`canvas-card-suggest-item ${active ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick(idx);
              }}
              onMouseEnter={() => onHover(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 12px",
                background: active ? accent : "transparent",
                border: "none",
                color: active ? accentText : "inherit",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {item.icon && (
                <span style={{ flex: "0 0 auto", width: 16, textAlign: "center" }}>{item.icon}</span>
              )}
              <span
                style={{
                  flex: "0 1 auto",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.title}
              </span>
              {item.subtitle && (
                <span
                  style={{
                    flex: "0 1 auto",
                    marginLeft: "auto",
                    paddingLeft: 8,
                    fontSize: 11,
                    opacity: 0.65,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.subtitle}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
