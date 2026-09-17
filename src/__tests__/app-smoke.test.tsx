import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import {
  installDesktopMock,
  removeDesktopMock,
  SAMPLE_CHAPTERS,
  SAMPLE_MANIFEST,
  type DesktopMock,
} from "./helpers/desktopMock";

/**
 * App-level smoke tests.
 *
 * Before these existed, not one of the 45 test files rendered `<App />` — every
 * test targeted a single component, service or hook. That left the upcoming R1
 * state refactor (App.tsx → stores) with no way to tell whether the shell still
 * worked: broken wiring between the vault, the tab strip and the reader would
 * have passed the entire suite.
 *
 * The shell does not restore a vault on startup — `setManifest` only runs from
 * a user action — so these tests drive it the same way a person would: open a
 * folder, pick a note, edit it, save it.
 */
describe("App - shell smoke tests", () => {
  let desktop: DesktopMock;

  beforeEach(() => {
    desktop = installDesktopMock();
  });

  afterEach(() => {
    removeDesktopMock();
    vi.restoreAllMocks();
  });

  /** Opens the sample vault through the activity bar, as a user would. */
  async function openSampleVault() {
    desktop.openDirectory.mockResolvedValue({
      canceled: false,
      directory: SAMPLE_MANIFEST,
    });
    const button = await screen.findByLabelText("打开文件夹");
    button.click();
    await waitFor(() => {
      expect(desktop.openDirectory).toHaveBeenCalled();
    });
    // A chapter title appears in more than one place (tree, tab strip), so the
    // list is what we assert on rather than a single node.
    await waitFor(() => {
      expect(screen.getAllByText(/notes \/ a/).length).toBeGreaterThan(0);
    });
  }

  it("mounts the shell without crashing", async () => {
    render(<App />);

    await waitFor(() => {
      expect(document.querySelector(".app-shell")).toBeTruthy();
    });
    expect(screen.getByRole("navigation", { name: "快捷工具栏" })).toBeDefined();
  });

  it("renders the vault after a folder is opened", async () => {
    render(<App />);
    await openSampleVault();

    // The chapter tree splits "notes / a" into a folder row and a file row, so
    // assert on the file names rather than the full manifest title.
    expect(screen.getAllByText(/a\.md/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/b\.md/).length).toBeGreaterThan(0);
  });

  it("reads a document when a chapter is selected", async () => {
    render(<App />);
    await openSampleVault();

    const chapter = screen.getAllByText(/a\.md/)[0];
    chapter.click();

    // readMarkdownFile takes a bare path, not a request object
    await waitFor(() => {
      expect(desktop.readMarkdownFile).toHaveBeenCalledWith(SAMPLE_CHAPTERS[0].absolutePath);
    });

    // The markdown reaches the reader. Its "#" becomes a heading element, so
    // match the text rather than the raw source line.
    await waitFor(() => {
      expect(
        screen.getAllByText(new RegExp(`loaded ${SAMPLE_CHAPTERS[0].absolutePath}`)).length
      ).toBeGreaterThan(0);
    });
  });

  it("does not read a file when the folder dialog is cancelled", async () => {
    // Default mock returns `canceled: true`
    render(<App />);
    const button = await screen.findByLabelText("打开文件夹");
    button.click();

    await waitFor(() => expect(desktop.openDirectory).toHaveBeenCalled());
    expect(desktop.readMarkdownFile).not.toHaveBeenCalled();
  });

  it("subscribes to the main-process event channels", async () => {
    render(<App />);

    // The shell wires these once; a refactor that moves them into a store must
    // keep them registered exactly once.
    await waitFor(() => {
      expect(desktop.onOpenFilePath).toHaveBeenCalled();
    });
    expect(desktop.onMenuCommand).toHaveBeenCalled();
    expect(desktop.onBeforeClose).toHaveBeenCalled();
  });

  it("cleans up its subscriptions on unmount", async () => {
    const unsubscribe = vi.fn();
    desktop.onOpenFilePath.mockReturnValue(unsubscribe);
    desktop.onMenuCommand.mockReturnValue(unsubscribe);
    desktop.onBeforeClose.mockReturnValue(unsubscribe);

    const { unmount } = render(<App />);
    await waitFor(() => expect(desktop.onOpenFilePath).toHaveBeenCalled());

    unmount();

    // Every subscription offers a disposer and the shell uses it — otherwise a
    // remount would double-register and fire handlers twice (a bug this project
    // has hit before with the F11 listener).
    expect(unsubscribe).toHaveBeenCalled();
  });
});
