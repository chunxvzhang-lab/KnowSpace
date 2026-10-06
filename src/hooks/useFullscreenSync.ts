import { useEffect } from "react";
import { useUiStore } from "../store/useUiStore";
import { useDisposableListener } from "./useDisposableListener";

/**
 * 全屏状态，由两个方向共同维护。
 *
 * store 里那一个字段是唯一真相：壳层容器的 `is-fullscreen`、画布全屏
 * (`isCanvasFullscreen = isCanvasActive && isFullscreen`) 都只读它。写它的有两个来源：
 *
 *  - 文档自身的 `fullscreenchange`——走生命周期守卫（计划 §6.3 条目 2-10），摘除是结构性
 *    的，不靠人记得 cleanup；
 *  - 桌面桥：先做一次 `isFullScreen()` 初值读取，因为渲染层挂载时窗口**可能已经**在全屏
 *    里，不读就会带着 false 渲染一帧；之后跟 `onFullScreenChanged` 走。取消订阅写在
 *    effect 的 cleanup 里。
 *
 * 桌面那个 effect 的依赖只有 `setFullscreen`：它是 store action、稳定标识，所以 effect
 * 依旧只挂载一次，不会反复摘挂监听器。**这里不能像原来那样留空数组**——`src/App.tsx` 在
 * `eslint.config.mjs` 的 exhaustive-deps 遗留白名单里（配置注释写得很清楚：每次下沉都要
 * 为新模块重新打开这条规则），搬出 App 就等于搬进有守的地方，豁免不跟着代码走。
 *
 * R1 批次 B8 从 `App.tsx` 整段搬出。行为不变的根据（不是"我看着没变"）：两个 effect 的
 * 注册时机挪到本 hook 被调用处，晚于原来的位置；它们与先前那批 effect 不共享任何 ref、
 * 也不写除 `setFullscreen` 以外的 store 字段，而 `setFullscreen` 是 store action（稳定标
 * 识，不会因渲染换身份）。
 */
export function useFullscreenSync() {
  const setFullscreen = useUiStore((s) => s.setFullscreen);

  useDisposableListener(document, "fullscreenchange", () => {
    setFullscreen(Boolean(document.fullscreenElement));
  });

  useEffect(() => {
    if (window.bookMDDesktop?.system.isFullScreen) {
      window.bookMDDesktop.system.isFullScreen().then((full) => {
        setFullscreen(Boolean(full));
      });
    }
    const unsubDesktop = window.bookMDDesktop?.system.onFullScreenChanged?.((full) => {
      setFullscreen(Boolean(full));
    });
    return () => {
      unsubDesktop?.();
    };
  }, [setFullscreen]);
}
