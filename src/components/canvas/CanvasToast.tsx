import { Check } from "lucide-react";
import { memo } from "react";

/**
 * Floating confirmation toast shown over the canvas.
 *
 * Extracted from CanvasView (R2 batch B2).
 * Presentational only: it owns no state and reacts to nothing.
 */
type CanvasToastProps = {
  message: string | null;
  /** Raised above the edge batch toolbar when that toolbar is visible. */
  lifted?: boolean;
  isDark: boolean;
};

export const CanvasToast = memo(function CanvasToast({
  message,
  lifted = false,
  isDark,
}: CanvasToastProps) {
  if (!message) return null;

  return (
    <div
      className="canvas-toast-msg"
      style={{
        position: "absolute",
        bottom: lifted ? 76 : 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: isDark ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.9)",
        color: "#ffffff",
        padding: "7px 16px",
        borderRadius: 20,
        fontSize: 12.5,
        fontWeight: 500,
        zIndex: 1100,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 6,
        backdropFilter: "blur(8px)",
      }}
    >
      <Check size={13} color="#10b981" />
      <span>{message}</span>
    </div>
  );
});
