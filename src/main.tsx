import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import { FlashCapsule } from "./components/FlashCapsule";
import "./styles.css";

const LazyApp = lazy(() => import("./App"));

const isFlashMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "flash";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isFlashMode ? (
      <FlashCapsule />
    ) : (
      <Suspense fallback={<div style={{ width: "100vw", height: "100vh", backgroundColor: "var(--bg-primary, #1e1e1e)" }} />}>
        <LazyApp />
      </Suspense>
    )}
  </React.StrictMode>,
);

