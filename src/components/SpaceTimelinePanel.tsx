import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Zap, CheckSquare, Clock, Calendar, Search, RotateCw, FolderOpen, FileText, Copy, ArrowDownToLine, Trash2, Tag, Filter } from "lucide-react";
import { GraduationCap } from "lucide-react";
import type { FlashNoteSummaryItem, FlashNotesSummaryResult } from "../types/desktop";
import { DailyReviewPanel } from "./DailyReviewPanel";

type SpaceTimelinePanelProps = {
  onOpenNoteFile?: (filePath: string) => void;
  onMergeIntoDocument?: (content: string, fileName: string) => void;
  /**
   * Fired when the review tab becomes active, and again when it stops being.
   *
   * The workspace listens so it can get out of the way. The review needs the
   * width, and leaving the document tree and the reader open beside it left the
   * three surfaces fighting over the same space.
   */
  onReviewActiveChange?: (active: boolean) => void;
  /**
   * The document the workspace has open, passed through to the review.
   *
   * The panel's own sources are things it fetches; this one is state the workspace
   * already holds, so it travels down as a prop rather than being read again.
   */
  currentDocument?: { filePath: string; content: string; dirty: boolean } | null;
  /**
   * A request from outside to open the review tab — the command palette's "开始复习".
   *
   * A number rather than a boolean, and it is compared by value rather than by
   * truthiness: asking twice has to work twice, and a flag that is already true says
   * nothing the second time.
   */
  openReviewRequest?: number;
};

export const SpaceTimelinePanel: React.FC<SpaceTimelinePanelProps> = ({
  onOpenNoteFile,
  onMergeIntoDocument,
  onReviewActiveChange,
  currentDocument = null,
  openReviewRequest = 0,
}) => {
  const [notes, setNotes] = useState<FlashNoteSummaryItem[]>([]);
  const [spaceDir, setSpaceDir] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"timeline" | "todos" | "review">("timeline");
  const isReviewActive = activeTab === "review";

  // Tell the parent whenever the review view comes and goes, including on
  // unmount, so a collapsed workspace is never left behind.
  useEffect(() => {
    onReviewActiveChange?.(isReviewActive);
    return () => {
      if (isReviewActive) onReviewActiveChange?.(false);
    };
  }, [isReviewActive, onReviewActiveChange]);

  // Opened from outside — the command palette, which should be able to start a review
  // without the reader first finding the Space panel and then the tab inside it.
  useEffect(() => {
    if (openReviewRequest > 0) setActiveTab("review");
  }, [openReviewRequest]);
  const [todoFilter, setTodoFilter] = useState<"all" | "pending" | "done">("pending");
  const [feedback, setFeedback] = useState<string>("");

  const desktop = typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;

  const loadSummary = useCallback(async () => {
    if (!desktop?.getFlashNotesSummary) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res: FlashNotesSummaryResult = await desktop.getFlashNotesSummary();
      if (res && res.success) {
        setNotes(res.notes || []);
        setSpaceDir(res.spaceDir || "");
      }
    } catch (err) {
      console.error("Failed to load flash notes summary:", err);
    } finally {
      setLoading(false);
    }
  }, [desktop]);

  useEffect(() => {
    loadSummary();

    let cleanupSaved: (() => void) | undefined;
    if (desktop?.onFlashNoteSaved) {
      cleanupSaved = desktop.onFlashNoteSaved(() => {
        loadSummary();
      });
    }

    return () => {
      cleanupSaved?.();
    };
  }, [desktop, loadSummary]);

  const showToast = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 1800);
  };

  const handleToggleTodo = async (filePath: string, lineIndex: number, currentCompleted: boolean) => {
    if (!desktop?.toggleFlashTodo) return;
    const nextCompleted = !currentCompleted;

    // Optimistic UI update
    setNotes((prevNotes) =>
      prevNotes.map((note) => {
        if (note.filePath !== filePath) return note;
        return {
          ...note,
          todos: note.todos.map((todo) => {
            if (todo.lineIndex !== lineIndex) return todo;
            return { ...todo, completed: nextCompleted };
          }),
        };
      })
    );

    try {
      const res = await desktop.toggleFlashTodo({
        filePath,
        lineIndex,
        completed: nextCompleted,
      });
      if (!res.success) {
        // Rollback on failure
        loadSummary();
      }
    } catch {
      loadSummary();
    }
  };

  const handleDeleteNote = async (filePath: string, fileName: string) => {
    if (!window.confirm(`确定要删除闪念记录 [ ${fileName} ] 吗？此操作无法撤销。`)) {
      return;
    }
    if (desktop?.deleteFlashNote) {
      const res = await desktop.deleteFlashNote({ filePath });
      if (res.success) {
        setNotes((prev) => prev.filter((n) => n.filePath !== filePath));
        showToast("✓ 已删除闪念文件");
      } else {
        alert(res.error || "删除失败");
      }
    }
  };

  const handleCopyNote = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      showToast("✓ 已复制内容至剪贴板");
    });
  };

  const handleMerge = (note: FlashNoteSummaryItem) => {
    if (onMergeIntoDocument) {
      onMergeIntoDocument(note.content, note.fileName);
      showToast(`✓ 已将 [ ${note.fileName} ] 并入正文`);
    }
  };

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase().trim();
    return notes.filter((n) => {
      const matchesContent = n.content.toLowerCase().includes(q);
      const matchesName = n.fileName.toLowerCase().includes(q);
      const matchesTag = n.tags.some((t) => t.toLowerCase().includes(q));
      const matchesTodo = n.todos.some((td) => td.text.toLowerCase().includes(q));
      return matchesContent || matchesName || matchesTag || matchesTodo;
    });
  }, [notes, searchQuery]);

  // Aggregate all todos
  const allTodos = useMemo(() => {
    const list: Array<{
      todoId: string;
      filePath: string;
      fileName: string;
      dateStr: string;
      timeDisplay: string;
      lineIndex: number;
      text: string;
      completed: boolean;
    }> = [];

    notes.forEach((note) => {
      note.todos.forEach((todo) => {
        list.push({
          todoId: `${note.fileName}:${todo.lineIndex}`,
          filePath: note.filePath,
          fileName: note.fileName,
          dateStr: note.dateStr,
          timeDisplay: note.timeDisplay,
          lineIndex: todo.lineIndex,
          text: todo.text,
          completed: todo.completed,
        });
      });
    });

    if (todoFilter === "pending") return list.filter((t) => !t.completed);
    if (todoFilter === "done") return list.filter((t) => t.completed);
    return list;
  }, [notes, todoFilter]);

  const totalTodoCount = useMemo(() => {
    return notes.reduce((acc, curr) => acc + curr.todos.length, 0);
  }, [notes]);

  const completedTodoCount = useMemo(() => {
    return notes.reduce(
      (acc, curr) => acc + curr.todos.filter((t) => t.completed).length,
      0
    );
  }, [notes]);

  // Group notes by relative date
  const groupedTimeline = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const groups: { [key: string]: FlashNoteSummaryItem[] } = {
      今天: [],
      昨天: [],
      更早之前: [],
    };

    filteredNotes.forEach((note) => {
      if (note.dateStr === today) {
        groups["今天"].push(note);
      } else if (note.dateStr === yesterday) {
        groups["昨天"].push(note);
      } else {
        groups["更早之前"].push(note);
      }
    });

    return groups;
  }, [filteredNotes]);

  // Shared between all three views: the review panel renders it through a slot
  // so the user can always switch back out.
  const tabSwitcher = (
    <div className="space-tab-switcher">
      <button
        type="button"
        className={`space-tab-btn ${activeTab === "timeline" ? "active" : ""}`}
        onClick={() => setActiveTab("timeline")}
      >
        <Clock size={12} />
        <span>时间轴</span>
      </button>
      <button
        type="button"
        className={`space-tab-btn ${activeTab === "todos" ? "active" : ""}`}
        onClick={() => setActiveTab("todos")}
      >
        <CheckSquare size={12} />
        <span>待办 ({completedTodoCount}/{totalTodoCount})</span>
      </button>
      <button
        type="button"
        className={`space-tab-btn ${activeTab === "review" ? "active" : ""}`}
        onClick={() => setActiveTab("review")}
      >
        <GraduationCap size={12} />
        <span>复盘</span>
      </button>
    </div>
  );

  // The review view brings its own header (progress bar instead of search), so
  // it takes over the panel rather than nesting inside the timeline body.
  if (activeTab === "review") {
    return (
      <DailyReviewPanel
        notes={notes}
        currentDocument={currentDocument}
        loading={loading}
        onOpenNoteFile={onOpenNoteFile}
        onProgressSaved={loadSummary}
        tabsSlot={tabSwitcher}
        />
    );
  }

  return (
    <div className="space-timeline-container">
      {/* Panel Top Header */}
      <div className="space-panel-header">
        <div className="space-panel-title-row">
          <div className="space-panel-title">
            <Zap size={16} className="text-orange" />
            <span>闪念时间线</span>
            <span className="space-count-badge">{notes.length} 篇</span>
          </div>
          <div className="space-header-actions">
            <button
              type="button"
              className="space-icon-btn"
              onClick={loadSummary}
              title="刷新列表"
            >
              <RotateCw size={13} className={loading ? "spin" : ""} />
            </button>
            <button
              type="button"
              className="space-icon-btn"
              onClick={() => {
                desktop?.openFlashCapsule?.();
              }}
              title="呼出闪念胶囊 (Alt+Space)"
            >
              <Zap size={13} className="text-orange" />
            </button>
          </div>
        </div>

        {/* Segmented View Switcher */}
        {tabSwitcher}

        {/* Search & Filter Bar */}
        <div className="space-search-wrapper">
          <Search size={13} className="space-search-icon" />
          <input
            type="text"
            className="space-search-input"
            placeholder={activeTab === "timeline" ? "搜索闪念内容、标签、时间..." : "筛选待办清单..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="space-clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {feedback && <div className="space-feedback-toast">{feedback}</div>}
      </div>

      {/* Panel Body Content */}
      <div className="space-panel-body">
        {loading && notes.length === 0 ? (
          <div className="space-empty-state">
            <RotateCw size={24} className="spin text-muted" />
            <p>正在载入 Space 闪念库...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="space-empty-state">
            <Zap size={32} className="text-orange opacity-60" />
            <h3>暂无闪念记录</h3>
            <p>按下全局热键或点击下方按钮，随时捕捉灵感与待办，自动归档至 Space。</p>
            <button
              type="button"
              className="space-btn-primary"
              onClick={() => desktop?.openFlashCapsule?.()}
            >
              <Zap size={14} /> 呼出闪念胶囊
            </button>
          </div>
        ) : activeTab === "timeline" ? (
          /* Timeline View */
          <div className="space-timeline-list">
            {(["今天", "昨天", "更早之前"] as const).map((groupKey) => {
              const groupNotes = groupedTimeline[groupKey];
              if (!groupNotes || groupNotes.length === 0) return null;
              return (
                <div key={groupKey} className="space-timeline-group">
                  <div className="space-group-header">
                    <Calendar size={12} />
                    <span>{groupKey}</span>
                    <span className="space-group-badge">{groupNotes.length}</span>
                  </div>

                  <div className="space-group-cards">
                    {groupNotes.map((note) => (
                      <div key={note.filePath} className="space-note-card">
                        <div className="space-card-top">
                          <span className="space-card-time" title={note.fileName}>
                            <Clock size={11} />
                            <strong>{note.timeDisplay}</strong>
                            <span className="space-file-tag">{note.fileName.replace(/\.md$/, "")}</span>
                          </span>

                          <div className="space-card-actions">
                            <button
                              type="button"
                              className="space-card-btn"
                              onClick={() => onOpenNoteFile?.(note.filePath)}
                              title="在编辑器标签页中打开"
                            >
                              <FileText size={12} />
                            </button>
                            {onMergeIntoDocument && (
                              <button
                                type="button"
                                className="space-card-btn"
                                onClick={() => handleMerge(note)}
                                title="一键并入当前正在编辑的文档"
                              >
                                <ArrowDownToLine size={12} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="space-card-btn"
                              onClick={() => handleCopyNote(note.content)}
                              title="复制全文"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              type="button"
                              className="space-card-btn danger"
                              onClick={() => handleDeleteNote(note.filePath, note.fileName)}
                              title="删除此条闪念"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Interactive Todos within note */}
                        {note.todos.length > 0 && (
                          <div className="space-card-todos">
                            {note.todos.map((todo) => (
                              <label
                                key={todo.id}
                                className={`space-card-todo-item ${todo.completed ? "completed" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={todo.completed}
                                  onChange={() =>
                                    handleToggleTodo(note.filePath, todo.lineIndex, todo.completed)
                                  }
                                />
                                <span>{todo.text}</span>
                              </label>
                            ))}
                          </div>
                        )}

                        {/* Clean Content Snippet */}
                        <div className="space-card-content">
                          {note.content
                            .replace(/^#+.*$/gm, "")
                            .replace(/^[-*]\s*\[[ xX]\].*$/gm, "")
                            .replace(/---/g, "")
                            .trim()}
                        </div>

                        {/* Tag Pills */}
                        {note.tags.length > 0 && (
                          <div className="space-card-tags">
                            {note.tags.map((tag) => (
                              <span key={tag} className="space-tag-pill">
                                <Tag size={10} />
                                <span>{tag}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Todos Hub View */
          <div className="space-todos-container">
            {/* Filter Radio Tabs */}
            <div className="space-todo-filters">
              <button
                type="button"
                className={`space-filter-btn ${todoFilter === "pending" ? "active" : ""}`}
                onClick={() => setTodoFilter("pending")}
              >
                待处理 ({totalTodoCount - completedTodoCount})
              </button>
              <button
                type="button"
                className={`space-filter-btn ${todoFilter === "done" ? "active" : ""}`}
                onClick={() => setTodoFilter("done")}
              >
                已完成 ({completedTodoCount})
              </button>
              <button
                type="button"
                className={`space-filter-btn ${todoFilter === "all" ? "active" : ""}`}
                onClick={() => setTodoFilter("all")}
              >
                全部 ({totalTodoCount})
              </button>
            </div>

            {/* Todo List */}
            {allTodos.length === 0 ? (
              <div className="space-empty-todos">
                <CheckSquare size={24} className="text-muted" />
                <p>{todoFilter === "pending" ? "全部待办已完成！太棒了！" : "暂无匹配的待办事项"}</p>
              </div>
            ) : (
              <div className="space-todos-list">
                {allTodos.map((item) => (
                  <div
                    key={item.todoId}
                    className={`space-todo-item-card ${item.completed ? "completed" : ""}`}
                  >
                    <label className="space-todo-item-label">
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() =>
                          handleToggleTodo(item.filePath, item.lineIndex, item.completed)
                        }
                      />
                      <span className="space-todo-item-text">{item.text}</span>
                    </label>
                    <div className="space-todo-item-meta">
                      <button
                        type="button"
                        className="space-todo-file-link"
                        onClick={() => onOpenNoteFile?.(item.filePath)}
                        title="打开所属闪念文件"
                      >
                        <Clock size={10} />
                        <span>{item.dateStr} {item.timeDisplay}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel Bottom Bar */}
      <div className="space-panel-footer">
        <span className="space-path-display" title={`存储目录: ${spaceDir}`}>
          <FolderOpen size={12} />
          <span>{spaceDir ? spaceDir.slice(-32) : "Space 知识库"}</span>
        </span>
      </div>
    </div>
  );
};
