import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MediaLightbox, type LightboxMedia } from "../components/MediaLightbox";

describe("MediaLightbox Component Sub-function Tests", () => {
  it("renders null when media is null", () => {
    const { container } = render(
      <MediaLightbox media={null} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders image media with alt text and title", () => {
    const media: LightboxMedia = {
      type: "image",
      src: "data:image/png;base64,AAA",
      alt: "架构设计图",
      title: "系统架构图 v2",
    };

    const onClose = vi.fn();
    const { container } = render(
      <MediaLightbox media={media} onClose={onClose} />
    );

    const img = screen.getByAltText("架构设计图");
    expect(img).toBeDefined();
    expect(img.getAttribute("src")).toBe("data:image/png;base64,AAA");
    expect(screen.getByText("系统架构图 v2")).toBeDefined();

    // Click close button
    const closeBtn = screen.getByTitle("关闭 (Esc)");
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape key press", () => {
    const media: LightboxMedia = {
      type: "image",
      src: "test.png",
      alt: "测试图片",
    };

    const onClose = vi.fn();
    render(<MediaLightbox media={media} onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("handles zoom in, zoom out, and reset zoom controls", () => {
    const media: LightboxMedia = {
      type: "image",
      src: "test.png",
      alt: "放大缩小测试",
    };

    render(<MediaLightbox media={media} onClose={vi.fn()} />);

    // Initial zoom indicator is 100%
    const resetBtn = screen.getByTitle("重置自适应 (0)");
    expect(resetBtn.textContent).toContain("100%");

    // Click Zoom In button
    const zoomInBtn = screen.getByTitle("放大 (+)");
    fireEvent.click(zoomInBtn);
    expect(resetBtn.textContent).toContain("125%");

    // Click Zoom Out button
    const zoomOutBtn = screen.getByTitle("缩小 (-)");
    fireEvent.click(zoomOutBtn);
    expect(resetBtn.textContent).toContain("100%");

    // Click Reset button
    fireEvent.click(resetBtn);
    expect(resetBtn.textContent).toContain("100%");
  });

  it("triggers image download on download button click", () => {
    const media: LightboxMedia = {
      type: "image",
      src: "https://example.com/photo.png",
      alt: "photo.png",
    };

    render(<MediaLightbox media={media} onClose={vi.fn()} />);

    const downloadBtn = screen.getByTitle("下载图片");
    expect(downloadBtn).toBeDefined();
    // Fire download click without crash
    fireEvent.click(downloadBtn);
  });
});
