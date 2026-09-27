import { useEffect, useMemo, useState, type RefObject } from "react";
import { getCanvasThemeColors } from "../../services/canvasTheme";
import type { ThemeMode } from "../../core/types";

/**
 * The canvas's theme-derived appearance: the shared colour token object (the
 * single source for screen and export, services/canvasTheme), the dark/eink
 * flags read by the layers and chrome, and the `isNarrow` responsive flag that
 * the container's own ResizeObserver owns.
 *
 * Final trim wave: this cluster had no writer outside CanvasView's root, so it
 * moved whole. The observer callback is the sole writer of `isNarrow`.
 */
export function useCanvasAppearance({
  theme,
  containerRef,
}: {
  theme: ThemeMode;
  containerRef: RefObject<HTMLDivElement | null>;
}) {
  const colors = useMemo(() => getCanvasThemeColors(theme), [theme]);

  const isDark = useMemo(() => {
    return (
      theme === "twitter" ||
      (theme === "system" &&
        typeof window !== "undefined" &&
        Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches))
    );
  }, [theme]);
  const isEink = colors.isEink;

  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsNarrow(entry.contentRect.width < 860);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  return { colors, isDark, isEink, isNarrow };
}
