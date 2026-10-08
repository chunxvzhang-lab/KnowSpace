import type { ComponentProps } from "react";

import { SidebarPanel } from "./SidebarPanel";
import { useUiStore } from "../store/useUiStore";
import { useVaultStore } from "../store/useVaultStore";

/**
 * The side panel region (R1 batch B16).
 *
 * When the panel is up, and what it does with the two things a reader touches
 * in it - the search box and the "open global graph" button - belong to the
 * panel, not to App.tsx. This is the same move B7 made for the bookmark list
 * and the read-only search fields, taken one level up: the component that
 * renders a store field subscribes to it, so App stops re-rendering the whole
 * shell when only the panel's tab changes, and the visibility rule lives in one
 * place instead of being spelled out in a ternary at the call site.
 *
 * What still arrives as props is what the shell owns and cannot share any other
 * way: the editing session, the derived document views, the reading helpers, the
 * backlinks bundle, and the two column-resize handlers (their hook keeps one
 * window-level drag listener, so it is called once in the controller and not a
 * second time here - two listeners would both answer the same drag).
 *
 * `onOpenNoteFile` arrives as a plain callback (B19). It used to be handed over
 * as a ref for this region to read through, which made the panel reach into the
 * controller's imperative plumbing; the callback the controller exposes still
 * reads the latest guard-wrapped open path through that same ref, so nothing
 * about which version of the handler runs changed - only who gets to know the
 * ref exists.
 */
type SidebarPanelProps = ComponentProps<typeof SidebarPanel>;

type SidebarRegionProps = Omit<
  SidebarPanelProps,
  "onQueryChange" | "theme" | "onOpenGlobalGraph"
> & {
  /** The two shell states that hide the panel: split view and canvas fullscreen. */
  isDualSplitMode: boolean;
  isCanvasFullscreen: boolean;
  /** Emptying the query also drops the marks made in the document. */
  clearSearchHighlights: () => void;
};

export function SidebarRegion(props: SidebarRegionProps) {
  const { isDualSplitMode, isCanvasFullscreen, clearSearchHighlights, ...panelProps } = props;

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const theme = useUiStore((s) => s.preferences.theme);
  const setGraphPaneOpen = useUiStore((s) => s.setGraphPaneOpen);

  const manifest = useVaultStore((s) => s.manifest);
  const setSearchQuery = useVaultStore((s) => s.setSearchQuery);
  const setActiveSearchMatchId = useVaultStore((s) => s.setActiveSearchMatchId);

  // Split view takes the whole width and a fullscreen canvas takes everything,
  // so neither shows the panel; an empty vault shows it only in the space tab,
  // which has content to show without a folder.
  if (isDualSplitMode || isCanvasFullscreen || !sidebarOpen) return null;
  if (!manifest && sidebarTab !== "space") return null;

  return (
    <SidebarPanel
      {...panelProps}
      onQueryChange={(query) => {
        setSearchQuery(query);
        setActiveSearchMatchId(null);
        if (!query.trim()) {
          clearSearchHighlights();
        }
      }}
      theme={theme}
      onOpenGlobalGraph={() => setGraphPaneOpen(true)}
    />
  );
}

export default SidebarRegion;
