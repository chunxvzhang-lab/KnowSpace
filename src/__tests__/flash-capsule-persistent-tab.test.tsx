import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FlashCapsule } from "../components/FlashCapsule";

/**
 * 「常驻模板」页在前台时，主进程的失焦隐藏必须让路 —— 判定在 main.cjs 的
 * blur 处理器，但状态的源头在渲染层的 activeTab。这里覆盖源头这一端：
 * 切到常驻页汇报 true、切回速记页汇报 false、挂载时先汇报初始值。
 *
 * （主进程那一端的条件读的是同一个通道，跨进程链路需要实机验证。）
 */
function installBridge(setFlashPersistentTab?: ReturnType<typeof vi.fn>) {
  (window as unknown as { knowSpaceDesktop: unknown }).knowSpaceDesktop = {
    capture: {
      getFlashPin: vi.fn().mockResolvedValue({ pinned: false }),
      setFlashPin: vi.fn().mockResolvedValue({ success: true, pinned: false }),
      ...(setFlashPersistentTab ? { setFlashPersistentTab } : {}),
      getPersistentNote: vi.fn().mockResolvedValue({ text: "" }),
      getFlashTargetPath: vi.fn().mockResolvedValue({ relativeDisplay: "Space" }),
      getFlashSpaceConfig: vi.fn().mockResolvedValue({
        currentDir: "",
        isCustom: false,
        defaultDir: "",
      }),
      getFlashShortcut: vi.fn().mockResolvedValue("Alt+Space"),
      onFlashFocus: vi.fn().mockReturnValue(() => {}),
      onFlashShortcutUpdated: vi.fn().mockReturnValue(() => {}),
      onFlashNoteSaved: vi.fn().mockReturnValue(() => {}),
    },
    system: {
      onThemeUpdated: vi.fn().mockReturnValue(() => {}),
      getAppSettings: vi.fn().mockResolvedValue({}),
      onAppSettingsUpdated: vi.fn().mockReturnValue(() => {}),
    },
  };
}

describe("FlashCapsule - 常驻模板页的失焦保持", () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { knowSpaceDesktop?: unknown }).knowSpaceDesktop;
  });

  /** Mount 期的多个 IPC promise 在 act 内冲刷，避免污染输出的 act 警告。 */
  async function renderCapsule() {
    await act(async () => {
      render(<FlashCapsule />);
    });
  }

  it("挂载时汇报初始页签（速记 = false）", async () => {
    const setFlashPersistentTab = vi.fn().mockResolvedValue({ success: true, active: false });
    installBridge(setFlashPersistentTab);

    await renderCapsule();

    expect(setFlashPersistentTab).toHaveBeenCalledWith(false);
  });

  it("切到「常驻模板」汇报 true，点旁边区域因此不会消失", async () => {
    const setFlashPersistentTab = vi.fn().mockResolvedValue({ success: true, active: true });
    installBridge(setFlashPersistentTab);

    await renderCapsule();
    fireEvent.click(screen.getByText("常驻模板"));

    expect(setFlashPersistentTab).toHaveBeenLastCalledWith(true);
  });

  it("切回「闪念速记」汇报 false，恢复失焦即隐藏的默认行为", async () => {
    const setFlashPersistentTab = vi.fn().mockResolvedValue({ success: true, active: false });
    installBridge(setFlashPersistentTab);

    await renderCapsule();
    fireEvent.click(screen.getByText("常驻模板"));
    fireEvent.click(screen.getByText("闪念速记"));

    expect(setFlashPersistentTab).toHaveBeenLastCalledWith(false);
  });

  it("桥缺少该通道时（旧版预加载）切页签不抛错", async () => {
    // 真实旧版 preload 的形状：域齐全，只是没有后来新增的方法。
    installBridge();

    await renderCapsule();
    expect(() => fireEvent.click(screen.getByText("常驻模板"))).not.toThrow();
  });
});
