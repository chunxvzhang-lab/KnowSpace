import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Network } from "lucide-react";

export type TabItem = {
  id: string;
  title: string;
  relativePath: string;
  absolutePath?: string;
  isDirty?: boolean;
};

type TabBarProps = {
  tabs: TabItem[];
  activeTabId: string;
  dualSplitTabId?: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOtherTabs: (tabId: string) => void;
  onCloseRightTabs: (tabId: string) => void;
  onOpenDualSplit?: (tabId: string) => void;
  onCloseDualSplit?: () => void;
  onDetachTab?: (tabId: string) => void;
  isGraphPaneOpen?: boolean;
  onToggleGraphPane?: () => void;
};

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  tabId: string;
} | null;

export const TabBar = memo(function TabBar({
  tabs,
  activeTabId,
  dualSplitTabId,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseRightTabs,
  onOpenDualSplit,
  onCloseDualSplit,
  onDetachTab,
  isGraphPaneOpen,
  onToggleGraphPane,
}: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  // Close context menu on outside click or scroll
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    window.addEventListener("scroll", handleClick, true);
    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleClick, true);
    };
  }, []);

  // Ensure active tab is scrolled into view
  useEffect(() => {
    if (!tabListRef.current) return;
    const activeEl = tabListRef.current.querySelector(`.tab-item.is-active`);
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeTabId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      if (e.button === 1) {
        // Middle click closes tab
        e.preventDefault();
        onCloseTab(tabId);
      }
    },
    [onCloseTab],
  );

  if (tabs.length === 0) return null;

  return (
    <div
      className={`tab-bar-container ${dualSplitTabId ? "has-dual-split" : ""}`}
      role="tablist"
      aria-label="文档标签页"
    >
      <div className="tab-bar-list" ref={tabListRef}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isSplitSecondary = tab.id === dualSplitTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`tab-item ${isActive ? "is-active" : ""} ${isSplitSecondary ? "is-split-secondary" : ""} ${tab.isDirty ? "is-dirty" : ""}`}
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              title={`${tab.title} (${tab.relativePath})${isSplitSecondary ? " • 当前在右侧分屏对比中" : ""}`}
            >
              <span className="tab-icon">📄</span>
              <span className="tab-title">{tab.title}</span>
              {isSplitSecondary ? (
                <span className="tab-split-badge" title="右侧分屏对比中">
                  分屏
                </span>
              ) : null}
              {tab.isDirty ? <span className="tab-dirty-indicator" title="未保存的修改" /> : null}
              <button
                type="button"
                className="tab-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                title="关闭标签页 (Ctrl+W)"
                aria-label={`关闭 ${tab.title}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="tab-bar-right-actions">
        {onToggleGraphPane && (
          <button
            type="button"
            className={`tab-graph-toggle-btn ${isGraphPaneOpen ? "is-active" : ""}`}
            onClick={onToggleGraphPane}
            title={
              isGraphPaneOpen ? "收起知识网络图谱分栏 (Ctrl+G)" : "在右侧打开知识网络图谱 (Ctrl+G)"
            }
          >
            <Network size={13} style={{ color: "#38bdf8" }} />
            <span>知识图谱</span>
          </button>
        )}
        {dualSplitTabId && onCloseDualSplit && (
          <button
            type="button"
            className="tab-exit-split-btn"
            onClick={onCloseDualSplit}
            title="退出双文档分屏对比 (Esc)"
          >
            ✕ 退出分屏
          </button>
        )}
      </div>

      {contextMenu?.visible ? (
        <div
          className="tab-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {onOpenDualSplit && contextMenu.tabId !== activeTabId && (
            <button
              type="button"
              className="menu-item menu-item-highlight"
              onClick={() => {
                onOpenDualSplit(contextMenu.tabId);
                setContextMenu(null);
              }}
            >
              📖 在右侧分屏对比查看
            </button>
          )}
          {onOpenDualSplit &&
            contextMenu.tabId === activeTabId &&
            tabs.length >= 2 &&
            !dualSplitTabId && (
              <button
                type="button"
                className="menu-item menu-item-highlight"
                onClick={() => {
                  const otherTab = tabs.find((t) => t.id !== activeTabId);
                  if (otherTab) {
                    onOpenDualSplit(otherTab.id);
                  }
                  setContextMenu(null);
                }}
              >
                📖 开启分屏对比查看
              </button>
            )}
          {dualSplitTabId && onCloseDualSplit && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onCloseDualSplit();
                setContextMenu(null);
              }}
            >
              ✕ 退出双文档分屏
            </button>
          )}
          {onDetachTab && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onDetachTab(contextMenu.tabId);
                setContextMenu(null);
              }}
              title="在新的独立窗口中打开并分离此标签页"
            >
              🗗 分离到独立新窗口
            </button>
          )}
          <div className="menu-divider" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onCloseTab(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            关闭当前标签页
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onCloseOtherTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            关闭其他标签页
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onCloseRightTabs(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            关闭右侧标签页
          </button>
        </div>
      ) : null}
    </div>
  );
});
