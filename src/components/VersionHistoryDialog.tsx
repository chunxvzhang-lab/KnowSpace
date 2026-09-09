import { memo, useEffect, useMemo, useState, useCallback } from "react";
import {
  Clock,
  RotateCcw,
  Copy,
  Check,
  X,
  Columns,
  ListFilter,
  Plus,
  ArrowLeft,
  AlertTriangle,
  History,
  FileText,
} from "lucide-react";
import type { ThemeMode } from "../core/types";
import type { SnapshotItem, SnapshotDetail } from "../types/desktop";
import {
  computeLineDiff,
  computeSideBySideDiff,
  computeDiffSummary,
  type SideBySideRow,
  type DiffLine,
} from "../services/diffService";
import {
  listWebSnapshots,
  readWebSnapshot,
  recordWebSnapshot,
} from "../services/webSnapshotService";

export interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileName?: string;
  filePath?: string;
  rootPath?: string;
  currentContent: string;
  theme: ThemeMode;
  onRevertToContent: (revertedContent: string) => Promise<boolean> | boolean;
}

export const VersionHistoryDialog = memo(function VersionHistoryDialog({
  isOpen,
  onClose,
  fileName = "当前文档",
  filePath,
  rootPath,
  currentContent,
  theme,
  onRevertToContent,
}: VersionHistoryDialogProps) {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"side-by-side" | "unified">("side-by-side");
  const [copied, setCopied] = useState(false);
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);

  // Load snapshots list
  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      if (window.bookMDDesktop?.listSnapshots && filePath) {
        const list = await window.bookMDDesktop.listSnapshots({ filePath, rootPath });
        setSnapshots(list);
        setSelectedSnapshotId((prev) => (prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id || null)));
      } else {
        const list = listWebSnapshots(filePath || fileName);
        setSnapshots(list);
        setSelectedSnapshotId((prev) => (prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id || null)));
      }
    } finally {
      setLoading(false);
    }
  }, [filePath, rootPath, fileName]);

  useEffect(() => {
    if (isOpen) {
      loadSnapshots();
    } else {
      setSelectedSnapshotId(null);
      setSelectedDetail(null);
      setConfirmRevertOpen(false);
    }
  }, [isOpen, loadSnapshots]);

  // Load selected snapshot details
  useEffect(() => {
    if (!selectedSnapshotId) {
      setSelectedDetail(null);
      return;
    }

    let cancelled = false;
    async function fetchDetail() {
      if (window.bookMDDesktop?.readSnapshot && filePath) {
        const detail = await window.bookMDDesktop.readSnapshot({
          filePath,
          rootPath,
          snapshotId: selectedSnapshotId!,
        });
        if (!cancelled && detail) {
          setSelectedDetail(detail);
        }
      } else {
        const detail = readWebSnapshot(filePath || fileName, selectedSnapshotId!);
        if (!cancelled && detail) {
          setSelectedDetail(detail);
        }
      }
    }

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSnapshotId, filePath, rootPath, fileName]);

  // Compute diffs
  const snapshotContent = selectedDetail?.content ?? "";
  const sideBySideRows: SideBySideRow[] = useMemo(() => {
    return computeSideBySideDiff(snapshotContent, currentContent);
  }, [snapshotContent, currentContent]);

  const unifiedLines: DiffLine[] = useMemo(() => {
    return computeLineDiff(snapshotContent, currentContent);
  }, [snapshotContent, currentContent]);

  const diffSummary = useMemo(() => {
    return computeDiffSummary(snapshotContent, currentContent);
  }, [snapshotContent, currentContent]);

  // Actions
  const handleCopySnapshot = useCallback(() => {
    if (!selectedDetail?.content) return;
    navigator.clipboard?.writeText(selectedDetail.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedDetail?.content]);

  const handleCreateManual = useCallback(async () => {
    setCreatingManual(true);
    try {
      if (window.bookMDDesktop?.createManualSnapshot && filePath) {
        await window.bookMDDesktop.createManualSnapshot({
          filePath,
          rootPath,
          content: currentContent,
        });
      } else {
        recordWebSnapshot(filePath || fileName, currentContent, "manual");
      }
      await loadSnapshots();
    } finally {
      setCreatingManual(false);
    }
  }, [filePath, rootPath, fileName, currentContent, loadSnapshots]);

  const handleRevertConfirm = useCallback(async () => {
    if (!selectedDetail) return;
    const ok = await onRevertToContent(selectedDetail.content);
    if (ok) {
      setConfirmRevertOpen(false);
      onClose();
    }
  }, [selectedDetail, onRevertToContent, onClose]);

  if (!isOpen) return null;

  const isDark = theme === "twitter";
  const isEink = theme === "eink";

  const modalBg = isEink ? "#f4f1ea" : isDark ? "#0f172a" : "#ffffff";
  const modalColor = isEink ? "#1a1a1a" : isDark ? "#f1f5f9" : "#1e293b";
  const borderColor = isEink ? "#1a1a1a" : isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0";
  const sidebarBg = isEink ? "#ebe6dc" : isDark ? "#141e33" : "#f8fafc";
  const itemActiveBg = isEink ? "#ddd7cb" : isDark ? "rgba(56, 189, 248, 0.15)" : "#e0f2fe";

  return (
    <div
      className="version-history-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="version-history-container"
        style={{
          width: "94vw",
          maxWidth: 1320,
          height: "88vh",
          backgroundColor: modalBg,
          color: modalColor,
          borderRadius: 14,
          border: `1px solid ${borderColor}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: `1px solid ${borderColor}`,
            backgroundColor: sidebarBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: isDark ? "rgba(56, 189, 248, 0.15)" : "#e0f2fe",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <History size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>
                时间旅行与本地快照历史 (Version History)
              </h2>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {fileName} · 共 {snapshots.length} 个历史版本
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* View Mode Switcher */}
            <div
              style={{
                display: "flex",
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                borderRadius: 6,
                padding: 2,
              }}
            >
              <button
                onClick={() => setViewMode("side-by-side")}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  border: "none",
                  borderRadius: 4,
                  backgroundColor: viewMode === "side-by-side" ? (isDark ? "#38bdf8" : "#0284c7") : "transparent",
                  color: viewMode === "side-by-side" ? "#ffffff" : "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontWeight: 500,
                }}
              >
                <Columns size={13} /> 双栏对比
              </button>
              <button
                onClick={() => setViewMode("unified")}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  border: "none",
                  borderRadius: 4,
                  backgroundColor: viewMode === "unified" ? (isDark ? "#38bdf8" : "#0284c7") : "transparent",
                  color: viewMode === "unified" ? "#ffffff" : "inherit",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontWeight: 500,
                }}
              >
                <ListFilter size={13} /> 统一对比
              </button>
            </div>

            {/* Create manual snapshot */}
            <button
              onClick={handleCreateManual}
              disabled={creatingManual}
              title="立即对当前文档生成一份保存快照"
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                backgroundColor: "transparent",
                color: "inherit",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontWeight: 500,
              }}
            >
              <Plus size={14} /> 保存手动快照
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                opacity: 0.7,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* Main Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left Timeline Sidebar */}
          <aside
            style={{
              width: 310,
              flex: "0 0 310px",
              borderRight: `1px solid ${borderColor}`,
              backgroundColor: sidebarBg,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                opacity: 0.6,
                textTransform: "uppercase",
                borderBottom: `1px solid ${borderColor}`,
              }}
            >
              历史版本时间轴
            </div>

            {loading && snapshots.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
                加载快照记录中...
              </div>
            ) : snapshots.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", opacity: 0.6, fontSize: 13 }}>
                暂无历史快照记录。保存修改后将自动创建。
              </div>
            ) : (
              <div style={{ padding: 8 }}>
                {snapshots.map((snap, index) => {
                  const isSelected = snap.id === selectedSnapshotId;
                  const date = new Date(snap.timestamp);
                  const isLatest = index === 0;

                  return (
                    <div
                      key={snap.id}
                      onClick={() => setSelectedSnapshotId(snap.id)}
                      style={{
                        padding: "10px 12px",
                        marginBottom: 6,
                        borderRadius: 8,
                        cursor: "pointer",
                        backgroundColor: isSelected ? itemActiveBg : "transparent",
                        border: isSelected
                          ? `1px solid ${isDark ? "#38bdf8" : "#0284c7"}`
                          : "1px solid transparent",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600 }}>
                            {formatRelativeTime(date)}
                          </span>
                          {isLatest && (
                            <span
                              style={{
                                fontSize: 10,
                                backgroundColor: isDark ? "rgba(16, 185, 129, 0.2)" : "#d1fae5",
                                color: "#10b981",
                                padding: "1px 5px",
                                borderRadius: 4,
                                fontWeight: 600,
                              }}
                            >
                              最新
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, opacity: 0.5 }}>
                          {formatClockTime(date)}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 11,
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        <span>{snap.charCount.toLocaleString()} 字符</span>
                        <span>·</span>
                        <span>{snap.lineCount} 行</span>
                        {snap.diffAdded > 0 && (
                          <span style={{ color: "#10b981", fontWeight: 600 }}>+{snap.diffAdded}</span>
                        )}
                        {snap.diffRemoved > 0 && (
                          <span style={{ color: "#ef4444", fontWeight: 600 }}>-{snap.diffRemoved}</span>
                        )}
                      </div>

                      {snap.reason && snap.reason !== "save" && (
                        <div style={{ marginTop: 4 }}>
                          <span
                            style={{
                              fontSize: 10,
                              padding: "1px 6px",
                              borderRadius: 4,
                              backgroundColor: "rgba(255,255,255,0.08)",
                              opacity: 0.8,
                            }}
                          >
                            🏷️ {snap.reason}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </aside>

          {/* Right Diff Workspace */}
          <main
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Diff Summary Action Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 16px",
                borderBottom: `1px solid ${borderColor}`,
                backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>
                  对比快照:{" "}
                  {selectedDetail?.timestamp
                    ? new Date(selectedDetail.timestamp).toLocaleString("zh-CN")
                    : "请选择快照"}
                </span>
                <span style={{ color: "#10b981", fontWeight: 600 }}>+{diffSummary.addedLines} 行新增</span>
                <span style={{ color: "#ef4444", fontWeight: 600 }}>-{diffSummary.removedLines} 行删除</span>
                <span style={{ opacity: 0.5 }}>{diffSummary.totalNewLines} 行 (当前)</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={handleCopySnapshot}
                  disabled={!selectedDetail}
                  title="复制当前所选历史快照的全部源码"
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: "transparent",
                    color: "inherit",
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  {copied ? "已复制！" : "复制快照内容"}
                </button>

                <button
                  onClick={() => setConfirmRevertOpen(true)}
                  disabled={!selectedDetail}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    boxShadow: "0 2px 8px rgba(239, 68, 68, 0.3)",
                  }}
                >
                  <RotateCcw size={13} /> 还原至此版本
                </button>
              </div>
            </div>

            {/* Diff Viewer Body */}
            <div style={{ flex: 1, overflowY: "auto", fontFamily: "monospace", fontSize: 13 }}>
              {viewMode === "side-by-side" ? (
                <div style={{ display: "flex", minWidth: "100%" }}>
                  {/* Left Column (Snapshot) */}
                  <div style={{ flex: 1, borderRight: `1px solid ${borderColor}` }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        backgroundColor: sidebarBg,
                        borderBottom: `1px solid ${borderColor}`,
                        opacity: 0.6,
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      历史快照版本
                    </div>
                    {sideBySideRows.map((row) => (
                      <div
                        key={`left-${row.rowId}`}
                        style={{
                          display: "flex",
                          minHeight: 22,
                          backgroundColor:
                            row.left?.type === "delete"
                              ? isDark
                                ? "rgba(239, 68, 68, 0.18)"
                                : "#fee2e2"
                              : "transparent",
                        }}
                      >
                        <span
                          style={{
                            width: 44,
                            padding: "2px 8px",
                            textAlign: "right",
                            opacity: 0.4,
                            userSelect: "none",
                            fontSize: 11,
                            borderRight: `1px solid ${borderColor}`,
                          }}
                        >
                          {row.left?.lineNumber ?? ""}
                        </span>
                        <div style={{ padding: "2px 8px", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {row.left?.inlineDiffs ? (
                            row.left.inlineDiffs.map((part, pIdx) => (
                              <span
                                key={pIdx}
                                style={{
                                  backgroundColor:
                                    part.type === "delete"
                                      ? (isDark ? "rgba(239, 68, 68, 0.45)" : "#fca5a5")
                                      : "transparent",
                                }}
                              >
                                {part.text}
                              </span>
                            ))
                          ) : (
                            row.left?.text ?? ""
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right Column (Current) */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        fontWeight: 700,
                        backgroundColor: sidebarBg,
                        borderBottom: `1px solid ${borderColor}`,
                        opacity: 0.6,
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      当前工作区最新版本
                    </div>
                    {sideBySideRows.map((row) => (
                      <div
                        key={`right-${row.rowId}`}
                        style={{
                          display: "flex",
                          minHeight: 22,
                          backgroundColor:
                            row.right?.type === "insert"
                              ? isDark
                                ? "rgba(16, 185, 129, 0.18)"
                                : "#d1fae5"
                              : "transparent",
                        }}
                      >
                        <span
                          style={{
                            width: 44,
                            padding: "2px 8px",
                            textAlign: "right",
                            opacity: 0.4,
                            userSelect: "none",
                            fontSize: 11,
                            borderRight: `1px solid ${borderColor}`,
                          }}
                        >
                          {row.right?.lineNumber ?? ""}
                        </span>
                        <div style={{ padding: "2px 8px", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {row.right?.inlineDiffs ? (
                            row.right.inlineDiffs.map((part, pIdx) => (
                              <span
                                key={pIdx}
                                style={{
                                  backgroundColor:
                                    part.type === "insert"
                                      ? (isDark ? "rgba(16, 185, 129, 0.45)" : "#86efac")
                                      : "transparent",
                                }}
                              >
                                {part.text}
                              </span>
                            ))
                          ) : (
                            row.right?.text ?? ""
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Unified Diff Mode */
                <div>
                  {unifiedLines.map((line, idx) => {
                    const isInsert = line.type === "insert";
                    const isDelete = line.type === "delete";
                    const bg = isInsert
                      ? isDark
                        ? "rgba(16, 185, 129, 0.18)"
                        : "#d1fae5"
                      : isDelete
                      ? isDark
                        ? "rgba(239, 68, 68, 0.18)"
                        : "#fee2e2"
                      : "transparent";

                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          minHeight: 22,
                          backgroundColor: bg,
                        }}
                      >
                        <span
                          style={{
                            width: 40,
                            padding: "2px 6px",
                            textAlign: "right",
                            opacity: 0.4,
                            userSelect: "none",
                            fontSize: 11,
                          }}
                        >
                          {line.oldLineNumber ?? ""}
                        </span>
                        <span
                          style={{
                            width: 40,
                            padding: "2px 6px",
                            textAlign: "right",
                            opacity: 0.4,
                            userSelect: "none",
                            fontSize: 11,
                            borderRight: `1px solid ${borderColor}`,
                          }}
                        >
                          {line.newLineNumber ?? ""}
                        </span>
                        <span
                          style={{
                            width: 20,
                            textAlign: "center",
                            fontWeight: 700,
                            userSelect: "none",
                            color: isInsert ? "#10b981" : isDelete ? "#ef4444" : "inherit",
                          }}
                        >
                          {isInsert ? "+" : isDelete ? "-" : " "}
                        </span>
                        <div style={{ padding: "2px 8px", flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                          {line.inlineDiffs ? (
                            line.inlineDiffs.map((part, pIdx) => (
                              <span
                                key={pIdx}
                                style={{
                                  backgroundColor:
                                    part.type === "insert"
                                      ? "rgba(16, 185, 129, 0.4)"
                                      : part.type === "delete"
                                      ? "rgba(239, 68, 68, 0.4)"
                                      : "transparent",
                                }}
                              >
                                {part.text}
                              </span>
                            ))
                          ) : (
                            line.text
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Revert Confirmation Modal */}
        {confirmRevertOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.75)",
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 440,
                backgroundColor: modalBg,
                color: modalColor,
                borderRadius: 12,
                border: `1px solid ${borderColor}`,
                padding: 24,
                boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#f59e0b", marginBottom: 14 }}>
                <AlertTriangle size={24} />
                <h3 style={{ margin: 0, fontSize: 16 }}>确认还原至历史快照？</h3>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85, margin: "0 0 18px 0" }}>
                此操作将当前文档内容完全替换为选中的历史快照（
                <strong>
                  {selectedDetail?.timestamp
                    ? new Date(selectedDetail.timestamp).toLocaleString("zh-CN")
                    : ""}
                </strong>
                ）。系统会在还原前自动为当前内容创建安全快照，确保数据无损。
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={() => setConfirmRevertOpen(false)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 6,
                    border: `1px solid ${borderColor}`,
                    backgroundColor: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleRevertConfirm}
                  style={{
                    padding: "7px 18px",
                    borderRadius: 6,
                    border: "none",
                    backgroundColor: "#ef4444",
                    color: "#ffffff",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  确认还原
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

// Time Helpers
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 30) return "刚刚";
  if (diffSec < 60) return `${diffSec} 秒前`;
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays === 1) return "昨天";
  if (diffDays < 30) return `${diffDays} 天前`;

  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}月${d}日`;
}

function formatClockTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}
