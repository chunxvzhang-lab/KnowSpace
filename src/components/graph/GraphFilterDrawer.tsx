import { Search, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";

type GraphFilterDrawerProps = {
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  hopDepth: "all" | 1 | 2;
  setHopDepth: Dispatch<SetStateAction<"all" | 1 | 2>>;
  viewFilter: "all" | "hubs" | "orphans";
  setViewFilter: Dispatch<SetStateAction<"all" | "hubs" | "orphans">>;
  typeFilter: "all" | "chapter" | "space";
  setTypeFilter: Dispatch<SetStateAction<"all" | "chapter" | "space">>;
  clusterByFolder: boolean;
  setClusterByFolder: Dispatch<SetStateAction<boolean>>;
  crossFolderOnly: boolean;
  setCrossFolderOnly: Dispatch<SetStateAction<boolean>>;
  hideIsolates: boolean;
  setHideIsolates: Dispatch<SetStateAction<boolean>>;
};

/**
 * The collapsible filter bar of the graph view: search box, hop-depth pills,
 * view pills, type pills and the toggle row (folder clustering, cross-folder
 * only, hide isolates).
 *
 * Extracted verbatim from GraphViewPane's filter drawer JSX (decomposition of
 * the pane); the pane keeps the `showFilterDrawer` conditional. The DOM, class
 * names and pill semantics are the contract. No memo, here or at the call
 * site.
 */
export function GraphFilterDrawer({
  searchQuery,
  setSearchQuery,
  hopDepth,
  setHopDepth,
  viewFilter,
  setViewFilter,
  typeFilter,
  setTypeFilter,
  clusterByFolder,
  setClusterByFolder,
  crossFolderOnly,
  setCrossFolderOnly,
  hideIsolates,
  setHideIsolates,
}: GraphFilterDrawerProps) {
  return (
    <div className="graph-filter-drawer">
      <div className="graph-filter-search">
        <Search size={13} className="text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索图谱节点..."
          className="graph-search-input"
        />
        {searchQuery && (
          <button type="button" className="graph-search-clear" onClick={() => setSearchQuery("")}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className="graph-filter-options">
        <div className="graph-filter-group">
          <span className="graph-filter-label">视野:</span>
          <button
            type="button"
            className={`graph-filter-pill ${hopDepth === "all" ? "is-active" : ""}`}
            onClick={() => setHopDepth("all")}
            title="显示全局关系网络"
          >
            全局
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${hopDepth === 1 ? "is-active" : ""}`}
            onClick={() => setHopDepth(1)}
            title="仅聚焦当前文档直接引用的 1-Hop 节点"
          >
            1-Hop 邻近
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${hopDepth === 2 ? "is-active" : ""}`}
            onClick={() => setHopDepth(2)}
            title="聚焦当前文档 2-Hop 关联网络"
          >
            2-Hop 扩展
          </button>
        </div>

        <div className="graph-filter-group">
          <span className="graph-filter-label">视图:</span>
          <button
            type="button"
            className={`graph-filter-pill ${viewFilter === "all" ? "is-active" : ""}`}
            onClick={() => setViewFilter("all")}
          >
            全部节点
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${viewFilter === "hubs" ? "is-active" : ""}`}
            onClick={() => setViewFilter(viewFilter === "hubs" ? "all" : "hubs")}
            title="高连接度核心枢纽节点 (连接数 >= 3)"
          >
            核心枢纽 (MOC)
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${viewFilter === "orphans" ? "is-active" : ""}`}
            onClick={() => setViewFilter(viewFilter === "orphans" ? "all" : "orphans")}
            title="查找尚未建立双链的孤岛笔记 (连接数 = 0)"
          >
            未链接孤岛
          </button>
        </div>

        <div className="graph-filter-group">
          <span className="graph-filter-label">分类:</span>
          <button
            type="button"
            className={`graph-filter-pill ${typeFilter === "all" ? "is-active" : ""}`}
            onClick={() => setTypeFilter("all")}
          >
            全部
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${typeFilter === "chapter" ? "is-active" : ""}`}
            onClick={() => setTypeFilter("chapter")}
          >
            文档
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${typeFilter === "space" ? "is-active" : ""}`}
            onClick={() => setTypeFilter("space")}
          >
            闪念
          </button>
        </div>

        <div className="graph-filter-group">
          <button
            type="button"
            className={`graph-filter-pill ${clusterByFolder ? "is-active" : ""}`}
            onClick={() => setClusterByFolder(!clusterByFolder)}
            title="按笔记所在文件夹进行色彩聚类染色"
          >
            🎨 目录聚类
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${crossFolderOnly ? "is-active" : ""}`}
            onClick={() => setCrossFolderOnly(!crossFolderOnly)}
            title="仅显示连接不同文件夹的跨目录双链连线"
          >
            🌐 跨文件夹关系
          </button>
          <button
            type="button"
            className={`graph-filter-pill ${hideIsolates && viewFilter !== "orphans" ? "is-active" : ""}`}
            onClick={() => setHideIsolates(!hideIsolates)}
            disabled={viewFilter === "orphans"}
            title="隐藏没有双链关系的独立孤岛节点"
          >
            隐藏孤岛
          </button>
        </div>
      </div>
    </div>
  );
}
