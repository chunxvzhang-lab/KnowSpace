import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import { FlashCapsule } from "./components/FlashCapsule";
// Styles are split by domain (phase B). This import order MUST stay in the same
// order as the original physical order inside styles.css — the light/eink theme
// overrides rely on "same specificity, later wins", so swapping imports is a
// visual regression, not a refactor. New slices move out only as contiguous
// prefixes of what remains in styles.css (see scripts/split-styles-css.cjs).
import "./styles/tokens.css";
import "./styles/shell.css";
import "./styles/sidebar.css";
import "./styles/workspace.css";
import "./styles/reader.css";
import "./styles/code.css";
import "./styles/statusbar.css";
import "./styles/dialogs.css";
import "./styles/search-nav.css";
import "./styles/gutter.css";
import "./styles/about.css";
import "./styles/tabbar.css";
import "./styles/copy-header.css";
import "./styles/lightbox.css";
import "./styles/fullscreen.css";
import "./styles/dual-split.css";
import "./styles/capsule.css";
import "./styles/capsule-panel.css";
import "./styles/space-timeline.css";
import "./styles/review-panel.css";
import "./styles/backlinks-panel.css";
import "./styles/graph.css";
import "./styles/graph-workspace.css";
import "./styles/mindmap.css";
import "./styles/blocklink.css";
import "./styles/editor-context-menu.css";
import "./styles/mindmap-search.css";
import "./styles/print.css";
import "./styles/command-palette.css";
import "./styles/mindmap-export.css";
import "./styles/graph-filters.css";
import "./styles.css";

const LazyApp = lazy(() => import("./App"));

const isFlashMode =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("mode") === "flash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isFlashMode ? (
      <FlashCapsule />
    ) : (
      <Suspense
        fallback={
          <div
            style={{
              width: "100vw",
              height: "100vh",
              // 读 `--bg`——`.app-shell` 与 `body` 用的都是它，所以占位与首帧同色。
              // 这里原先引用的是 `--bg-primary`（**从未被定义**）并兜底 `#1e1e1e`：
              // 带兜底的悬空引用不报错，只是永远拿不到主题值，于是深色占位恒定生效、
              // 浅色用户每次启动白闪一下。让占位能取到正确主题的，是 `index.html` 里
              // 「挂载前落 data-theme」的引导脚本（键名/别名由 boot-theme.test.ts 绑定）。
              backgroundColor: "var(--bg)",
            }}
          />
        }
      >
        <LazyApp />
      </Suspense>
    )}
  </React.StrictMode>,
);
