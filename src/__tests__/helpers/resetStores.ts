import { useUiStore } from "../../store/useUiStore";
import { useTabStore } from "../../store/useTabStore";
import { useVaultStore } from "../../store/useVaultStore";

/**
 * Resets every module-level store between tests.
 *
 * The stores are singletons created at import time, so whatever one test writes
 * is still there for the next: an open folder, a registered tab, a sidebar that
 * was toggled shut, a notice still on screen. That leaking is invisible until a
 * test fails for a reason unrelated to what it asserts — which is exactly what
 * happened when tab state moved into a store and an unrelated smoke test broke.
 *
 * Collected here rather than written into each suite so that adding a store
 * does not mean editing every file that renders the app.
 *
 * The `pristine` snapshot is taken at import time, before any test runs. Note
 * that it captures the store's actions as well as its state, and that passing
 * `true` replaces the object wholesale rather than merging — both matter,
 * because the actions are re-seated from the snapshot on every reset.
 */
const pristine = {
  ui: useUiStore.getState(),
  tab: useTabStore.getState(),
  vault: useVaultStore.getState(),
};

/** Call from `beforeEach`: fresh stores and empty storage. */
export function resetStores(): void {
  useUiStore.setState(pristine.ui, true);
  useTabStore.setState(pristine.tab, true);
  useVaultStore.setState(pristine.vault, true);
  localStorage.clear();
}

/** Call from `afterEach`: puts the stores back, leaving storage tools alone. */
export function restoreStores(): void {
  useUiStore.setState(pristine.ui, true);
  useTabStore.setState(pristine.tab, true);
  useVaultStore.setState(pristine.vault, true);
}
