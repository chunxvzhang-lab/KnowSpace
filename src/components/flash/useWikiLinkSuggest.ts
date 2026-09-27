import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
} from "react";

/** [[ 双链联想下拉的状态。 */
export interface WikiSuggestState {
  isOpen: boolean;
  query: string;
  startIndex: number;
  selectedIndex: number;
  filtered: string[];
}

/**
 * 速记输入的 [[ 双链联想域：可用目标列表（3 秒节流加载）、联想下拉状态、
 * 输入过滤、插入，以及 handleKeyDown 中属于联想的按键导航段。
 *
 * 从 FlashCapsule 拆出。原 handleKeyDown 把「联想导航」和「Ctrl+Enter 归档 /
 * Esc 关窗 / Tab 缩进」串在一个函数里；归档与关窗属于根上的域，所以这里把
 * 联想段拆成 handleSuggestKeyDown，**消费了按键才返回 true**，根上据此短路——
 * 与原版逐分支等价（包括「下拉开着但无选中项时 Enter/Tab 落回原行为」的分支）。
 */
export function useWikiLinkSuggest(params: {
  content: string;
  setContent: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { content, setContent, textareaRef } = params;
  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop : undefined;

  const [availableTargets, setAvailableTargets] = useState<string[]>([]);
  const [wikiSuggestState, setWikiSuggestState] = useState<WikiSuggestState>({
    isOpen: false,
    query: "",
    startIndex: -1,
    selectedIndex: 0,
    filtered: [],
  });

  // 节流时间戳在原版里是 effect 内的局部变量，靠 effect 只跑一次来跨调用存活；
  // 拆出后改用 ref 承载同样的存活期（挂载强制加载 + onFlashFocus 节流刷新共用）。
  const lastTargetsLoadTimeRef = useRef(0);

  const loadTargets = useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - lastTargetsLoadTimeRef.current < 3000) return;
      lastTargetsLoadTimeRef.current = now;
      try {
        if (desktop?.capture.getFlashNotesSummary) {
          const res = await desktop.capture.getFlashNotesSummary();
          if (res?.success && res.notes) {
            const titles = res.notes.map((n) => n.fileName.replace(/\.md$/i, ""));
            setAvailableTargets((prev) => Array.from(new Set([...prev, ...titles])));
          }
        }
      } catch {}
    },
    [desktop],
  );

  // Load historical flash notes and available targets for [[ suggestion
  useEffect(() => {
    loadTargets(true);
  }, [loadTargets]);

  const handleContentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);

    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/\[\[([^\]\n]*)$/);

    if (match) {
      const query = match[1].toLowerCase().trim();
      const startIndex = cursorPos - match[0].length;
      const filtered = availableTargets
        .filter((t) => !query || t.toLowerCase().includes(query))
        .slice(0, 8);

      setWikiSuggestState({
        isOpen: filtered.length > 0,
        query,
        startIndex,
        selectedIndex: 0,
        filtered,
      });
    } else {
      if (wikiSuggestState.isOpen) {
        setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));
      }
    }
  };

  const insertWikiSuggestion = (title: string) => {
    if (wikiSuggestState.startIndex < 0 || !textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? content.length;
    const before = content.slice(0, wikiSuggestState.startIndex);
    const after = content.slice(cursorPos);
    const inserted = `[[${title}]]`;
    const newContent = `${before}${inserted}${after}`;
    setContent(newContent);
    setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = before.length + inserted.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 20);
  };

  /**
   * handleKeyDown 的联想导航段。返回 true 表示按键已被联想下拉消费（根上据此
   * 直接 return，不再走归档 / 关窗 / 缩进分支）；返回 false 时按键交还原逻辑。
   */
  const handleSuggestKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (wikiSuggestState.isOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % prev.filtered.length,
        }));
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex - 1 + prev.filtered.length) % prev.filtered.length,
        }));
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const selected = wikiSuggestState.filtered[wikiSuggestState.selectedIndex];
        if (selected) {
          e.preventDefault();
          insertWikiSuggestion(selected);
          return true;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setWikiSuggestState((prev) => ({ ...prev, isOpen: false }));
        return true;
      }
    }
    return false;
  };

  return {
    availableTargets,
    loadTargets,
    wikiSuggestState,
    handleContentChange,
    insertWikiSuggestion,
    handleSuggestKeyDown,
  };
}
