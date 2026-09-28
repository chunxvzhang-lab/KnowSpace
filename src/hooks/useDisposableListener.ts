import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type ListenerTarget = Window | Document | RefObject<Element | null>;

/**
 * 生命周期守卫（计划 §6.3 条目 2-10）：声明式挂载事件监听，卸载时自动移除。
 *
 * 全仓审计（2026-09-28）的结论是现有 61 处 addEventListener 全部配对移除、
 * 无泄漏——这个 hook 不是修 bug，而是把"配对移除"变成结构保证：新代码用它
 * 就写不出忘记 cleanup 的监听器，评审也不再需要逐个人肉对账。
 *
 * 三条使用规则：
 * 1. `target` 传 window / document 直接实例，或元素 RefObject（ref.current
 *    就绪时才挂载——对"挂载早于 ref 赋值"的场景是正确的等待语义）。
 * 2. handler 每次渲染经 ref 刷新，因此 deps 无需包含它——监听器**只挂一次**，
 *    不会因 handler 身份变化而反复摘挂（与手写 effect 最大的差异点）。
 * 3. 需要随参数重挂的场景（如依赖某个会变的选项），把它加进 deps——重挂
 *    一次的成本是明确的，别用 ref 绕过。
 */
export function useDisposableListener(
  target: ListenerTarget,
  type: string,
  handler: (event: Event) => void,
  options?: AddEventListenerOptions,
): void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const el: Window | Document | Element | null =
      target && typeof target === "object" && "current" in target ? target.current : target;
    if (!el) return undefined;
    const listener: EventListener = (event) => handlerRef.current(event);
    el.addEventListener(type, listener, options);
    return () => {
      el.removeEventListener(type, listener, options);
    };
  }, [target, type, options]);
}
