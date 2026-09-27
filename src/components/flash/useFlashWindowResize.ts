import type { MouseEvent as ReactMouseEvent } from "react";

/**
 * 窗口尺寸拖拽域：右缘 / 下缘 / 右下角三处把手共用的 mousedown 拖拽逻辑。
 *
 * 从 FlashCapsule 拆出。rAF 节流是承重行为：mousemove 里只更新 latest 尺寸，
 * 真正的 setFlashSize 调用被合并到每帧一次；mouseup 时取消未决的 rAF 并按
 * latest 尺寸做最终同步。逐字搬出，未动任何时序。
 */
export function useFlashWindowResize() {
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  const handleResizeMouseDown = (e: ReactMouseEvent, direction: "se" | "e" | "s") => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = window.innerWidth;
    const startHeight = window.innerHeight;

    let rafId: number | null = null;
    let latestWidth = startWidth;
    let latestHeight = startHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.screenX - startX;
      const deltaY = moveEvent.screenY - startY;

      if (direction === "se" || direction === "e") {
        latestWidth = Math.max(520, Math.min(1600, Math.round(startWidth + deltaX)));
      }
      if (direction === "se" || direction === "s") {
        latestHeight = Math.max(320, Math.min(1200, Math.round(startHeight + deltaY)));
      }

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          desktop?.capture.setFlashSize?.({ width: latestWidth, height: latestHeight });
          rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      desktop?.capture.setFlashSize?.({ width: latestWidth, height: latestHeight });
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return handleResizeMouseDown;
}
