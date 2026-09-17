import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpaceTimelinePanel } from "../components/SpaceTimelinePanel";

/**
 * The review tab asks the workspace to get out of the way.
 *
 * The full chain is: this panel → onReviewActiveChange → App's
 * handleReviewActiveChange → isReviewFocus in the UI store → the
 * `is-review-focus` class on .app-shell → CSS that hides .reader-frame and lets
 * .side-panel grow.
 *
 * Only the first two links are reachable from a test — the rest is a class name
 * on a div and a stylesheet. So this suite covers the emitting end, and
 * ui-store.test.ts covers the flag in the middle. A regression anywhere else in
 * the chain still needs the app to be run.
 */
describe("SpaceTimelinePanel - 复盘时让出空间", () => {
  afterEach(cleanup);

  it("挂载在时间轴上时报告「未在复盘」", () => {
    const onReviewActiveChange = vi.fn();
    render(<SpaceTimelinePanel onReviewActiveChange={onReviewActiveChange} />);

    // Reported on mount rather than only on change: a parent that starts out
    // collapsed must not stay that way when a panel appears beside it.
    expect(onReviewActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("进入复盘时报告「在复盘」", () => {
    const onReviewActiveChange = vi.fn();
    render(<SpaceTimelinePanel onReviewActiveChange={onReviewActiveChange} />);

    fireEvent.click(screen.getByText("复盘"));

    expect(onReviewActiveChange).toHaveBeenLastCalledWith(true);
  });

  it("切回时间轴时报告「未在复盘」，让阅读区回来", () => {
    const onReviewActiveChange = vi.fn();
    render(<SpaceTimelinePanel onReviewActiveChange={onReviewActiveChange} />);

    fireEvent.click(screen.getByText("复盘"));
    fireEvent.click(screen.getByText("时间轴"));

    expect(onReviewActiveChange).toHaveBeenLastCalledWith(false);
  });

  it("在复盘中卸载时复位，不把折叠状态留给下一个界面", () => {
    const onReviewActiveChange = vi.fn();
    const { unmount } = render(
      <SpaceTimelinePanel onReviewActiveChange={onReviewActiveChange} />
    );

    fireEvent.click(screen.getByText("复盘"));
    onReviewActiveChange.mockClear();

    unmount();

    // The cleanup path is the one that is easy to lose: without it, closing the
    // panel mid-review leaves the reader hidden until something else toggles it.
    expect(onReviewActiveChange).toHaveBeenCalledWith(false);
  });

  it("未传回调时也能正常渲染并进入复盘", () => {
    // The prop is optional, and the panel is rendered in places where nothing
    // needs to collapse. Optional chaining is what makes that safe, so it is
    // worth pinning.
    render(<SpaceTimelinePanel />);

    fireEvent.click(screen.getByText("复盘"));

    expect(screen.getByText("每日复盘")).toBeDefined();
  });
});
