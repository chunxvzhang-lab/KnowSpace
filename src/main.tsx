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
              backgroundColor: "var(--bg-primary, #1e1e1e)",
            }}
          />
        }
      >
        <LazyApp />
      </Suspense>
    )}
  </React.StrictMode>,
);
