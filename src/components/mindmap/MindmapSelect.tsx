import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

export type MindmapSelectOption = {
  id: string;
  label: string;
  /** 悬停时的完整说明——原生 select 的 option.title 语义在这里保留。 */
  description?: string;
};

type MindmapSelectProps = {
  value: string;
  options: MindmapSelectOption[];
  onChange: (id: string) => void;
  ariaLabel: string;
  /** 关闭态触发钮里显示的文字；缺省用当前项的 label。 */
  displayLabel?: string;
};

/**
 * 思维导图工具栏的下拉选择器。
 *
 * 为什么不是原生 `<select>`：弹出列表由操作系统绘制，不随应用主题重绘，
 * 而 Windows 的 Chromium/Edge 对 option 的样式化支持是黑盒——`color`、
 * `background` 与 CSS 自定义属性在弹层里是否生效无法依赖，深色主题下
 * 菜单项实测掉到 1.22:1（几乎不可见），换字面量、换令牌、重打包都无法
 * 修复。手写弹层让颜色回到普通 DOM，全局主题令牌完全生效。
 *
 * 可访问性照原生 select 的契约实现：触发钮是 combobox（aria-expanded +
 * aria-haspopup="listbox" + aria-activedescendant），弹层是 listbox，
 * ↑↓ 循环、Home/End、Enter/Space 提交、Esc 关闭、Tab 关闭不选择、
 * 点击外部关闭、打开时当前项滚动到可见。
 *
 * 弹层 portal 到 body 并按触发钮定位（guide 规则 3：浮层不留在任何可能
 * 的 transform/裁剪上下文里）；打开期间页面滚动即关闭——跟随定位的成本
 * 高于"滚走就收起"的用户预期。
 */
export function MindmapSelect({
  value,
  options,
  onChange,
  ariaLabel,
  displayLabel,
}: MindmapSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [popStyle, setPopStyle] = useState<{ left: number; top: number; minWidth: number } | null>(
    null,
  );
  const listboxId = useId();

  // value 不在列表里时（历史文件读回的旧 id）显示原始 id——错了要说出来，
  // 而不是悄悄顶替成第一项。
  const current = options.find((o) => o.id === value);
  const display = displayLabel ?? current?.label ?? value;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPopStyle({ left: rect.left, top: rect.bottom + 4, minWidth: rect.width });
  }, []);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openAndFocus = useCallback(() => {
    place();
    setOpen(true);
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((o) => o.id === value),
      ),
    );
  }, [place, options, value]);

  // 打开时定位一次；窗口 resize 跟随重算。滚动即关闭（在弹层的 capture
  // 监听里做，页面任何容器的滚动都算）。
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    const onResize = () => place();
    const onScrollClose = () => close(false);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScrollClose, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScrollClose, { capture: true });
    };
  }, [open, place, close]);

  // 打开期间：点击弹层与触发钮之外的任何地方都关闭。mousedown 阶段拦截，
  // 因为选择行的 click 之前外部容器的 mousedown 会先到。
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("mousedown", onPointerDown, { capture: true });
    return () => document.removeEventListener("mousedown", onPointerDown, { capture: true });
  }, [open, close]);

  // 活动项滚动到可见。jsdom 没有 scrollIntoView——特性检测。
  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = popRef.current?.querySelector<HTMLElement>('[role="option"].is-active');
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (id: string) => {
    onChange(id);
    close();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAndFocus();
      }
      return;
    }
    const move = (delta: number) => {
      e.preventDefault();
      setActiveIndex((prev) => {
        if (options.length === 0) return -1;
        const next = prev + delta;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
    };
    switch (e.key) {
      case "ArrowDown":
        move(1);
        break;
      case "ArrowUp":
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (options[activeIndex]) commit(options[activeIndex].id);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  };

  const activeOptionId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="mindmap-select-trigger"
        onClick={() => (open ? close() : openAndFocus())}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-label={ariaLabel}
        title={current?.description}
      >
        {display}
        <span className="mindmap-select-chevron" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="mindmap-select-pop"
            style={
              popStyle
                ? { left: popStyle.left, top: popStyle.top, minWidth: popStyle.minWidth }
                : undefined
            }
          >
            {options.map((option, index) => {
              const selected = option.id === value;
              const active = index === activeIndex;
              return (
                <div
                  key={option.id}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={selected}
                  title={option.description}
                  className={`mindmap-select-option${active ? " is-active" : ""}${selected ? " is-current" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit(option.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span>{option.label}</span>
                  {selected && (
                    <Check size={13} className="mindmap-select-check" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
