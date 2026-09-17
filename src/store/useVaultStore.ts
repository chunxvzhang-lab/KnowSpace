import { create } from "zustand";
import type { BookManifest, Bookmark } from "../core/types";
import { createBacklinkIndex, type BacklinkIndexData } from "../services/backlinkIndex";
import { buildVaultSearchIndex, type VaultSearchIndex } from "../services/searchIndexService";
import { saveBookmarks } from "../services/storage";

/**
 * Vault-wide state: which folder is open, its bookmarks, and the two indexes
 * built from its documents.
 *
 * Third slice of the App.tsx migration (R1 batch B2). The domain is defined by
 * what it is *about* rather than by where the code sits: the manifest describes
 * the open folder, bookmarks belong to it, and both indexes are derived from
 * its documents. The search fields are here because a vault-scoped search is a
 * vault feature — `searchScope` can widen from the current chapter to the whole
 * folder, which only makes sense with a folder open.
 *
 * Two things stayed in App.tsx on purpose:
 *
 * - `manifestRef` and the file-opening callbacks. Loading a folder, opening a
 *   file, creating a document — that is orchestration across the vault, the tab
 *   list and the editing session at once, and it needs `await` rather than a
 *   state transition.
 * - `activeHeadingId`, which tracks where the reader has scrolled to. That is a
 *   property of the rendered document, not of the vault.
 */

type VaultState = {
  /** The open folder, or null before one is opened. */
  manifest: BookManifest | null;
  bookmarks: Bookmark[];
  /**
   * Backlinks between documents, and the search index over their text.
   *
   * Both are maintained incrementally: `updateDocumentInIndex` and
   * `updateVaultSearchIndexForDocument` write into the existing structure and
   * the caller then hands the store a new outer object. That is why setters
   * below accept a value rather than only an updater — the mutation has already
   * happened by the time it is called.
   */
  backlinkIndex: BacklinkIndexData;
  vaultSearchIndex: VaultSearchIndex;

  searchQuery: string;
  searchScope: "current" | "vault";
  /** The search hit currently highlighted in the reader, if any. */
  activeSearchMatchId: string | null;
};

type VaultActions = {
  setManifest: (manifest: BookManifest | null) => void;
  setBookmarks: (bookmarks: Bookmark[]) => void;
  /**
   * Replaces the bookmarks and writes them to storage.
   *
   * Kept as one action because doing them separately is how a bookmark ends up
   * visible but not saved: the write needs the manifest's id, so it has to read
   * the same state the replacement does.
   */
  persistBookmarks: (bookmarks: Bookmark[]) => void;
  setBacklinkIndex: (index: BacklinkIndexData) => void;
  setVaultSearchIndex: (
    index: VaultSearchIndex | ((prev: VaultSearchIndex) => VaultSearchIndex)
  ) => void;
  setSearchQuery: (query: string) => void;
  setSearchScope: (scope: "current" | "vault") => void;
  setActiveSearchMatchId: (id: string | null) => void;
};

export type VaultStore = VaultState & VaultActions;

export const useVaultStore = create<VaultStore>()((set, get) => ({
  manifest: null,
  bookmarks: [],
  backlinkIndex: createBacklinkIndex([]),
  vaultSearchIndex: buildVaultSearchIndex([]),

  searchQuery: "",
  searchScope: "current",
  activeSearchMatchId: null,

  setManifest: (manifest) => set({ manifest }),

  setBookmarks: (bookmarks) => set({ bookmarks }),

  persistBookmarks: (bookmarks) => {
    const { manifest } = get();
    // Without a vault there is nothing to file them under, and the previous
    // version left the state alone in that case too.
    if (!manifest) return;
    set({ bookmarks });
    try {
      saveBookmarks(manifest.id, bookmarks);
    } catch {
      // A full or unavailable store should not lose the in-session bookmarks.
    }
  },

  setBacklinkIndex: (index) => set({ backlinkIndex: index }),

  setVaultSearchIndex: (index) =>
    set((state) => ({
      vaultSearchIndex:
        typeof index === "function" ? index(state.vaultSearchIndex) : index,
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchScope: (scope) => set({ searchScope: scope }),
  setActiveSearchMatchId: (id) => set({ activeSearchMatchId: id }),
}));
