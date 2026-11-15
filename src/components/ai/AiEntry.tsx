import { lazy, Suspense } from "react";
import { useUiStore } from "../../store/useUiStore";
import type { ComponentProps } from "react";
import type { AiWorkspace } from "./AiWorkspace";

const LazyWorkspace = lazy(() =>
  import("./AiWorkspace").then((module) => ({ default: module.AiWorkspace })),
);

export function AiEntry(props: ComponentProps<typeof AiWorkspace>) {
  const open = useUiStore((s) => s.aiOpen);
  if (!open) return null;
  return (
    <Suspense
      fallback={
        <aside id="ai-workspace" className="ai-workspace" aria-label="AI 工作台">
          <p className="ai-feedback">正在打开AI 助理…</p>
        </aside>
      }
    >
      <LazyWorkspace {...props} />
    </Suspense>
  );
}
