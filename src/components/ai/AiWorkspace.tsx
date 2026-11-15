import { useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  ArrowUp,
  BookOpen,
  History,
  PanelRightClose,
  Settings2,
  Sparkles,
  Square,
} from "lucide-react";
import type { DocumentSession, EditorViewMode, SearchResult } from "../../core/types";
import {
  captureAiTarget,
  inferAiCreationMode,
  isCreationMode,
  type AiCreationMode,
  type AiTarget,
} from "../../services/aiCreation";
import type { AiDesktopAPI, AiMode, AiPublicSettings, AiRecord, AiSource } from "../../types/ai";
import {
  applyAiSelection,
  buildAiContext,
  buildAiMessages,
  captureAiSelection,
  captureAiOutline,
  citationWarnings,
  extractAiOutline,
  exportAiRecord,
  outlineDraftWarnings,
  sourceStillMatches,
  type AiScope,
  type AiSelection,
} from "../../services/aiContext";
import { useUiStore } from "../../store/useUiStore";
import { useVaultStore } from "../../store/useVaultStore";
import type { DocumentTemplate } from "../../services/documentTemplates";
import { useAiCreation } from "./useAiCreation";
import { AiCreationControls, AiCreationDraft } from "./AiCreationControls";
import { AI_MODES as MODES } from "./aiModes";
import { AiResultActions } from "./AiResultActions";
import { assertAiEditorReady } from "../../hooks/useAiPendingEdits";

type Props = {
  session: DocumentSession | null;
  editorViewRef: { current: EditorView | null };
  onCreateFromTemplate: (template: DocumentTemplate) => void;
  onSearchJump: (result: SearchResult) => void;
  onEditDocument?: () => void;
  onUpdateSource?: (source: string) => void;
  onViewModeChange?: (mode: EditorViewMode) => void;
};

export function AiWorkspace(props: Props) {
  const open = useUiStore((s) => s.aiOpen);
  const manifest = useVaultStore((s) => s.manifest);
  if (!open) return null;
  const workspaceId = manifest?.id || props.session?.absolutePath || "empty-workspace";
  return (
    <AiPanel
      key={workspaceId}
      {...props}
      workspaceId={workspaceId}
      api={window.bookMDDesktop?.ai}
    />
  );
}

export function AiPanel({
  session,
  editorViewRef,
  onCreateFromTemplate,
  onSearchJump,
  onEditDocument,
  onUpdateSource,
  onViewModeChange,
  workspaceId,
  api,
}: Props & {
  workspaceId: string;
  api?: AiDesktopAPI;
}) {
  const mode = useUiStore((s) => s.aiMode);
  const openAi = useUiStore((s) => s.openAi);
  const closeAi = useUiStore((s) => s.closeAi);
  const manifest = useVaultStore((s) => s.manifest);
  const index = useVaultStore((s) => s.vaultSearchIndex);
  const [settings, setSettings] = useState<AiPublicSettings | null>(null);
  const [tab, setTab] = useState<"chat" | "history">("chat");
  const openModelSettings = useUiStore((s) => s.openModelSettings);
  const [scope, setScope] = useState<AiScope>("current");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [noteFilter, setNoteFilter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [record, setRecord] = useState<AiRecord | null>(null);
  const [history, setHistory] = useState<AiRecord[]>([]);
  const [turns, setTurns] = useState<{ key: string; records: AiRecord[] }>({
    key: "",
    records: [],
  });
  const [stream, setStream] = useState("");
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<AiSelection | null>(null);
  const [sources, setSources] = useState<AiSource[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [coverage, setCoverage] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [creationTarget, setCreationTarget] = useState<"auto" | AiCreationMode>("auto");
  const [autoApply, setAutoApply] = useState(true);
  const [position, setPosition] = useState<"append" | "cursor">("append");
  const [target, setTarget] = useState<AiTarget | null>(null);
  const { writeCreation, saveCreation, undoCreation, undoWrite, appliedId } = useAiCreation({
    session,
    onUpdateSource,
    onViewModeChange,
    onCreateFromTemplate,
    position,
    submitted,
    setSubmitted,
    setMessage,
  });
  const active = useRef<{ id: string; cancelled: boolean; unsubscribe: () => void } | null>(null);
  const mounted = useRef(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const writing = mode === "rewrite" || mode === "outline";
  const creating = isCreationMode(mode);
  const inferred = inferAiCreationMode(prompt);
  const taskMode = creating
    ? inferred === "edit" && creationTarget !== "create"
      ? "edit"
      : creationTarget === "auto"
        ? prompt.trim()
          ? inferred
          : mode
        : creationTarget
    : mode;
  const outline =
    mode === "outline" && session && session.source.length <= 20000
      ? extractAiOutline(session.source)
      : [];
  const draftWarnings =
    record?.mode === "outline" ? outlineDraftWarnings(record.sources[0]?.text || "", draft) : [];

  useEffect(() => {
    mounted.current = true;
    if (api) {
      void api
        .getSettings()
        .then((result) => {
          if (!mounted.current) return;
          if (result.success) {
            setSettings(result.value);
          } else setMessage(result.message);
        })
        .catch(() => {
          if (mounted.current) setMessage("无法读取模型设置。");
        });
    }
    return () => {
      mounted.current = false;
      if (active.current) {
        active.current.cancelled = true;
        active.current.unsubscribe();
        void api?.cancel(active.current.id);
        active.current = null;
      }
    };
  }, [api]);

  useEffect(() => {
    if (tab !== "history" || !api) return;
    let current = true;
    void api
      .getHistory(workspaceId)
      .then((result) => {
        if (!current) return;
        if (result.success) setHistory(result.value);
        else setMessage(result.message);
      })
      .catch(() => {
        if (current) setMessage("无法读取本地记录。");
      });
    return () => {
      current = false;
    };
  }, [tab, api, workspaceId]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [stream, confirmApply]);

  useEffect(() => {
    const reload = () => {
      if (api)
        void api
          .getSettings()
          .then((result) => {
            if (mounted.current && result.success) setSettings(result.value);
          })
          .catch(() => {
            if (mounted.current) setMessage("无法读取模型设置。");
          });
    };
    window.addEventListener("knowspace-ai-settings-updated", reload);
    return () => window.removeEventListener("knowspace-ai-settings-updated", reload);
  }, [api]);

  async function run() {
    if (!api || active.current) return;
    setMessage("");
    try {
      if (creating) assertAiEditorReady(session);
      if (!settings?.model) {
        openModelSettings();
        throw new Error("请先配置并测试模型连接。");
      }
      const task =
        prompt.trim() ||
        (mode === "create"
          ? "根据当前文档补充清晰、实用的内容。"
          : MODES.find((m) => m.id === mode)!.prompt);
      const captured =
        isCreationMode(taskMode) && session?.writable
          ? captureAiTarget(session, editorViewRef.current)
          : null;
      const selected =
        mode === "outline"
          ? captureAiOutline(session)
          : mode === "rewrite"
            ? captureAiSelection(session, editorViewRef.current)
            : undefined;
      const context = buildAiContext({
        session,
        manifest,
        index,
        scope: writing ? "current" : scope,
        selectedIds,
        folder,
        mode: taskMode,
        prompt: task,
        selection: selected,
      });
      const key = `${scope}:${scope === "current" ? session?.chapterId : scope === "folder" ? folder : selectedIds.join(",")}`;
      const requestId = crypto.randomUUID();
      const request = { id: requestId, cancelled: false, unsubscribe: () => {} };
      active.current = request;
      setBusy(true);
      setStream("");
      setRecord(null);
      setDraft("");
      setSubmitted(false);
      setConfirmApply(false);
      setSelection(selected || null);
      setTarget(captured);
      setSources(context.sources);
      setWarnings(context.warnings);
      setCoverage(context.coverage);
      request.unsubscribe = api.onEvent((event) => {
        if (active.current === request && !request.cancelled && event.requestId === requestId)
          setStream((value) => value + event.text);
      });
      try {
        const response = await api.generate({
          requestId,
          workspaceId,
          mode: taskMode,
          prompt: task,
          sources: context.sources,
          messages: buildAiMessages(
            taskMode,
            task,
            context.sources,
            context.warnings,
            turns.key === key ? turns.records : [],
          ),
        });
        if (!mounted.current || active.current !== request || request.cancelled) return;
        if (!response.success) throw new Error(response.message);
        setRecord(response.value);
        setDraft(response.value.text);
        setPrompt("");
        setWarnings([
          ...context.warnings,
          ...(writing || isCreationMode(taskMode)
            ? []
            : citationWarnings(response.value.text, context.sources)),
        ]);
        setTurns({
          key,
          records: [...(turns.key === key ? turns.records : []), response.value].slice(-2),
        });
        if (isCreationMode(taskMode) && autoApply && captured) {
          try {
            writeCreation(response.value, response.value.text, captured);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "未写入，草稿已保留。");
          }
        }
      } finally {
        request.unsubscribe();
        if (active.current === request) active.current = null;
        if (mounted.current) setBusy(false);
      }
    } catch (error) {
      if (mounted.current)
        setMessage(error instanceof Error ? error.message : "生成失败，当前草稿已保留。");
    }
  }

  function stop() {
    const request = active.current;
    if (!request || !api) return;
    request.cancelled = true;
    request.unsubscribe();
    setMessage("已停止生成，已收到的文字保留为未完成草稿。");
    void api.cancel(request.id).catch(() => {
      if (mounted.current) setMessage("停止请求未送达，已丢弃后续结果；请检查连接。");
    });
  }

  function apply() {
    if (!selection || !record) return;
    try {
      if (record.mode === "outline") {
        const issues = outlineDraftWarnings(selection.source, draft);
        if (issues.length) throw new Error(issues[0]);
        if (!editorViewRef.current)
          throw new Error("请先进入实时预览编辑，再确认替换全文；当前草稿已保留。");
      }
      applyAiSelection(session, editorViewRef.current, selection, draft);
      setSelection(null);
      setConfirmApply(false);
      setMessage(
        record.mode === "outline"
          ? "全文已应用，可在编辑器中一次撤销。保存方式跟随自动保存设置。"
          : "改写已应用，可在编辑器中撤销。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法应用改写。");
    }
  }

  function openSource(source: AiSource) {
    if (
      !manifest?.chapters.some((c) => c.id === source.chapterId) &&
      session?.chapterId !== source.chapterId
    ) {
      setMessage("来源已不在当前知识库中，原始摘录仍可查看。");
      return;
    }
    if (!sourceStillMatches(source, session, index))
      setMessage("来源内容已变化，以下跳转位置可能过期，请核对原文。");
    onSearchJump({
      index: 0,
      title: source.title,
      excerpt: source.text,
      chapterId: source.chapterId,
      lineNumber: source.startLine,
      lineEndNumber: source.endLine,
      query: "",
      matchedText: source.text,
    });
  }

  function saveDraft() {
    if (!record || submitted) return;
    if (isCreationMode(record.mode)) {
      try {
        saveCreation(record, draft);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "无法保存生成结果。");
      }
      return;
    }
    setSubmitted(true);
    onCreateFromTemplate({
      id: `ai-${record.id}`,
      title: `AI-${record.mode === "outline" ? "全文草稿" : record.mode === "summary" ? "资料汇总" : "知识笔记"}-${record.id.slice(0, 8)}`,
      category: "AI 成果",
      content: exportAiRecord({ ...record, text: draft }),
    });
    setMessage("已打开新笔记保存流程；取消保存后可点击“重新保存”。");
  }

  function preview() {
    try {
      const selected =
        mode === "outline"
          ? captureAiOutline(session)
          : mode === "rewrite"
            ? captureAiSelection(session, editorViewRef.current)
            : undefined;
      const context = buildAiContext({
        session,
        manifest,
        index,
        scope: writing ? "current" : scope,
        selectedIds,
        folder,
        mode: taskMode,
        prompt: prompt.trim() || MODES.find((item) => item.id === mode)!.prompt,
        selection: selected,
      });
      setRecord(null);
      setStream("");
      setSources(context.sources);
      setWarnings(context.warnings);
      setCoverage(context.coverage);
      setSelection(null);
      setConfirmApply(false);
      setMessage("这是待发送的来源预览，尚未调用模型。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法预览来源。");
    }
  }

  const choices = (manifest?.chapters || []).filter(
    (c) => !c.hidden && /\.(md|markdown)$/i.test(c.src),
  );
  const folders = [
    ...new Set(
      choices.flatMap((chapter) => {
        const parts = chapter.src.replace(/\\/g, "/").split("/").slice(0, -1);
        return parts.map((_part, i) => parts.slice(0, i + 1).join("/"));
      }),
    ),
  ].sort();
  const filteredChoices = choices.filter((chapter) =>
    `${chapter.title} ${chapter.src}`.toLowerCase().includes(noteFilter.toLowerCase()),
  );
  const displayedSources = record?.sources || sources;
  const serviceHost =
    settings?.baseUrl && URL.canParse(settings.baseUrl) ? new URL(settings.baseUrl).hostname : "";
  return (
    <aside id="ai-workspace" className="ai-workspace" aria-label="AI 工作台">
      <header className="ai-header">
        <div className="ai-brand">
          <div className="ai-brand-mark">
            <Sparkles size={19} />
          </div>
          <div>
            <h2>AI 助理</h2>
            <span>{settings?.model || "与你一起创作"}</span>
          </div>
        </div>
        <button
          type="button"
          className="ai-icon-button"
          aria-label="关闭 AI 工作台"
          title="收起AI 助理"
          onClick={() => {
            stop();
            closeAi();
          }}
        >
          <PanelRightClose size={18} />
        </button>
      </header>
      <nav className="ai-tabs" aria-label="AI 工作台页签">
        <button
          type="button"
          aria-current={tab === "chat" ? "page" : undefined}
          onClick={() => setTab("chat")}
        >
          <BookOpen size={14} />
          工作台
        </button>
        <button
          type="button"
          aria-current={tab === "history" ? "page" : undefined}
          disabled={busy}
          onClick={() => setTab("history")}
        >
          <History size={14} />
          记录
        </button>
        <button type="button" disabled={busy} onClick={openModelSettings}>
          <Settings2 size={14} />
          <span>模型接口</span>
        </button>
      </nav>
      {!api ? (
        <div className="ai-empty">
          <Sparkles size={30} />
          <h3>请在桌面版中连接模型</h3>
          <p>AI 请求与凭证通过桌面主进程处理。更新并启动桌面版后，可在这里配置本地或云端模型。</p>
        </div>
      ) : tab === "history" ? (
        <section className="ai-history" aria-label="本地 AI 记录">
          <div className="ai-section-title">
            <div>
              <h3>本地记录</h3>
              <p>
                {settings?.saveHistory
                  ? "当前库最近 20 条，包含所用来源。"
                  : "当前未开启记录保存。"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void api
                  .clearHistory(workspaceId)
                  .then((result) => {
                    if (!mounted.current) return;
                    if (result.success) {
                      setHistory([]);
                      setTurns({ key: "", records: [] });
                      setRecord(null);
                      setStream("");
                      setSources([]);
                      setDraft("");
                      setSelection(null);
                      setMessage("当前库记录已清空。");
                    } else setMessage(result.message);
                  })
                  .catch(() => setMessage("清空记录失败。"));
              }}
            >
              清空记录
            </button>
          </div>
          {history.length ? (
            history.map((item) => (
              <button
                type="button"
                className="ai-history-item"
                key={item.id}
                onClick={() => {
                  setRecord(item);
                  setDraft(item.text);
                  setSelection(null);
                  setConfirmApply(false);
                  setWarnings(
                    item.mode === "rewrite" || item.mode === "outline" || isCreationMode(item.mode)
                      ? []
                      : citationWarnings(item.text, item.sources),
                  );
                  setSubmitted(false);
                  setTarget(
                    session?.writable ? captureAiTarget(session, editorViewRef.current) : null,
                  );
                  setMessage("");
                  setTab("chat");
                }}
              >
                <strong>{item.prompt}</strong>
                <span>
                  {item.model} · {new Date(item.createdAt).toLocaleString()}
                </span>
              </button>
            ))
          ) : (
            <p className="ai-caption">还没有保存的对话。可在模型连接中选择是否保留。</p>
          )}
        </section>
      ) : (
        <>
          <div className="ai-chat-body" ref={outputRef}>
            <div className="ai-mode-switch" aria-label="AI 任务类型">
              {MODES.filter(
                (item) => !["outline", "edit", "mindmap", "canvas"].includes(item.id),
              ).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={
                    mode === item.id ||
                    (item.id === "rewrite" && mode === "outline") ||
                    (item.id === "create" && creating)
                  }
                  disabled={busy}
                  onClick={() => openAi(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
            <details className="ai-context" aria-label="资料范围">
              <summary>
                上下文与写入选项 <span>{session?.fileName || "未打开文档"}</span>
              </summary>
              {creating ? (
                <AiCreationControls
                  busy={busy}
                  target={creationTarget}
                  onTarget={setCreationTarget}
                  position={position}
                  onPosition={setPosition}
                  autoApply={autoApply}
                  onAutoApply={setAutoApply}
                />
              ) : writing ? (
                <>
                  <label className="ai-scope-label">
                    写作方式
                    <select
                      value={mode}
                      disabled={busy}
                      onChange={(e) => {
                        openAi(e.target.value as AiMode);
                        setConfirmApply(false);
                      }}
                    >
                      <option value="rewrite">改写当前选区</option>
                      <option value="outline">按大纲写全文</option>
                    </select>
                  </label>
                  {mode === "outline" ? (
                    <>
                      <p className="ai-caption">
                        读取当前文档的完整大纲和已有要点，先生成草稿，确认后替换全文，可一次撤销。
                      </p>
                      <details className="ai-outline" open>
                        <summary>当前大纲 · {outline.length} 个标题</summary>
                        {outline.length ? (
                          <ol>
                            {outline.map((heading) => (
                              <li
                                key={heading.line}
                                style={{ paddingLeft: (heading.level - 1) * 10 }}
                              >
                                {"#".repeat(heading.level)} {heading.title}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="ai-caption">
                            请在 Markdown 文档中写入 # 标题、## 章节或 ### 小节。
                          </p>
                        )}
                      </details>
                      <p className="ai-caption">
                        单次输出上限 {settings?.maxOutputTokens || 0}{" "}
                        Token；较长文章可在模型连接中提高上限。截断结果保留为未完成草稿。
                      </p>
                    </>
                  ) : (
                    <p className="ai-caption">
                      使用当前编辑器选区。生成后对照原文采纳，可一次撤销。
                    </p>
                  )}
                  {onEditDocument && (
                    <button type="button" disabled={busy} onClick={onEditDocument}>
                      进入实时预览编辑
                    </button>
                  )}
                </>
              ) : (
                <label className="ai-scope-label">
                  范围
                  <select
                    value={scope}
                    disabled={busy}
                    onChange={(e) => setScope(e.target.value as AiScope)}
                  >
                    <option value="current">当前文档（含未保存内容）</option>
                    <option value="selected">选择笔记（最多 8 篇）</option>
                    <option value="folder">指定目录</option>
                    <option value="vault">当前知识库</option>
                  </select>
                </label>
              )}
              {!writing && !creating && scope === "folder" && (
                <label className="ai-scope-label">
                  目录
                  <select
                    value={folder}
                    disabled={busy}
                    onChange={(e) => setFolder(e.target.value)}
                  >
                    <option value="">当前库根目录</option>
                    {folders.map((path) => (
                      <option key={path} value={path}>
                        {path}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!writing && !creating && scope === "selected" && (
                <div className="ai-note-picker">
                  <input
                    aria-label="查找笔记"
                    placeholder="按标题或路径查找笔记"
                    value={noteFilter}
                    disabled={busy}
                    onChange={(e) => setNoteFilter(e.target.value)}
                  />
                  <p className="ai-caption">
                    {selectedIds.length}/8 · {filteredChoices.length}{" "}
                    {"· 最多显示 100 条，请输入关键词缩小范围。"}
                  </p>
                  {filteredChoices.slice(0, 100).map((chapter) => (
                    <label className="ai-check" key={chapter.id}>
                      <input
                        type="checkbox"
                        disabled={
                          busy || (!selectedIds.includes(chapter.id) && selectedIds.length >= 8)
                        }
                        checked={selectedIds.includes(chapter.id)}
                        onChange={(e) =>
                          setSelectedIds((ids) =>
                            e.target.checked
                              ? [...ids, chapter.id]
                              : ids.filter((id) => id !== chapter.id),
                          )
                        }
                      />
                      {chapter.title}
                    </label>
                  ))}
                </div>
              )}
              <p className="ai-caption">
                {["localhost", "127.0.0.1", "[::1]"].includes(serviceHost)
                  ? "发往配置的本机服务"
                  : "发往配置的模型服务"}{" "}
                {creating
                  ? "· 发送当前文档内容与最近两轮对话"
                  : mode === "outline"
                    ? "· 发送当前文档的完整大纲与正文"
                    : "· 发送问题与来源片段，追问含最近两轮简短对话"}
                {settings?.saveHistory ? " · 本机保留记录" : " · 不保存对话记录"}
              </p>
              <div className="ai-button-row">
                <button type="button" disabled={busy} onClick={preview}>
                  预览发送内容
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setTurns({ key: "", records: [] });
                    setRecord(null);
                    setStream("");
                    setDraft("");
                    setSources([]);
                    setSelection(null);
                    setTarget(null);
                    setConfirmApply(false);
                    setWarnings([]);
                    setCoverage("");
                    setMessage("");
                  }}
                >
                  新对话
                </button>
              </div>
            </details>
            {!settings?.model && (
              <button type="button" className="ai-connect-hint" onClick={openModelSettings}>
                连接模型，开始对话 <Settings2 size={14} />
              </button>
            )}
            <div className="ai-output" aria-label="AI 生成结果" aria-busy={busy}>
              {!record && !stream && !busy && !sources.length ? (
                <div className="ai-empty">
                  <div className="ai-empty-mark">
                    <Sparkles size={28} />
                  </div>
                  <h3>
                    {creating
                      ? "想改哪里，直接告诉我"
                      : mode === "summary"
                        ? "把资料整理成一份成果"
                        : mode === "outline"
                          ? "把大纲写成完整文章"
                          : mode === "rewrite"
                            ? "让这段文字更清晰"
                            : "从你的知识中找到答案"}
                  </h3>
                  <p>{MODES.find((m) => m.id === mode)?.prompt}</p>
                  <span>
                    {creating ? "修改原文 · 续写内容 · 脑图与白板" : "回答可追溯，草稿由你采纳。"}
                  </span>
                  {creating && (
                    <div className="ai-starters">
                      {[
                        ["修改标题", "把一级标题改为项目计划"],
                        ["整理脑图", "根据当前文档生成思维导图"],
                        ["生成卡片", "根据当前文档生成 5 张白板卡片"],
                      ].map(([label, text]) => (
                        <button key={label} type="button" onClick={() => setPrompt(text)}>
                          {label}
                          <ArrowUp size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="ai-result-heading">
                    <span>
                      {busy ? "正在生成" : record ? "生成完成" : stream ? "未完成草稿" : "来源预览"}
                    </span>
                    {record && <span>{(record.elapsedMs / 1000).toFixed(1)} 秒</span>}
                  </div>
                  {record && <p className="ai-question">{record.prompt}</p>}
                  {record && isCreationMode(record.mode) ? (
                    <details className="ai-draft-details" open={appliedId.current !== record.id}>
                      <summary>
                        {record.mode === "edit" ? "查看修改内容" : "查看与编辑生成内容"}
                      </summary>
                      <AiCreationDraft mode={record.mode} draft={draft} onChange={setDraft} />
                    </details>
                  ) : record?.mode === "rewrite" || record?.mode === "outline" ? (
                    <div className="ai-proposal">
                      {selection && (
                        <details>
                          <summary>
                            {record.mode === "outline" ? "查看原大纲与正文" : "查看原选区"}
                          </summary>
                          <pre>{selection.text}</pre>
                        </details>
                      )}
                      <label>
                        {record.mode === "outline" ? "全文草稿" : "改写草稿"}
                        <textarea
                          aria-label={record.mode === "outline" ? "全文草稿" : "改写草稿"}
                          value={draft}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            setConfirmApply(false);
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <pre className="ai-answer">
                      {record?.text ||
                        stream ||
                        (busy ? "正在等待模型响应…" : "生成时将使用以下来源。")}
                    </pre>
                  )}
                  {record && (
                    <p className="ai-caption">
                      {record.usage.inputTokens !== null && record.usage.outputTokens !== null
                        ? `输入 ${record.usage.inputTokens} / 输出 ${record.usage.outputTokens} Token`
                        : `服务未报告用量 · 本次预算计入 ${record.usage.budgetTokens} Token（保守估算）`}
                    </p>
                  )}
                  {warnings.map((warning) => (
                    <p className="ai-warning" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {draftWarnings.map((warning) => (
                    <p className="ai-warning" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {displayedSources.length > 0 && (
                    <details className="ai-sources">
                      <summary>来源 · {coverage || `${displayedSources.length} 个片段`}</summary>
                      {displayedSources.map((source) => (
                        <article key={source.id}>
                          <button type="button" onClick={() => openSource(source)}>
                            [{source.id}] {source.title}
                            <span>
                              第 {source.startLine}–{source.endLine} 行
                            </span>
                          </button>
                          <p>{source.text}</p>
                        </article>
                      ))}
                    </details>
                  )}
                  <AiResultActions
                    record={record}
                    target={target}
                    applied={appliedId.current === record?.id}
                    submitted={submitted}
                    draft={draft}
                    hasSelection={!!selection}
                    hasDraftWarnings={draftWarnings.length > 0}
                    canUndo={!!undoWrite}
                    busy={busy}
                    confirmApply={confirmApply}
                    setConfirmApply={setConfirmApply}
                    onSave={saveDraft}
                    onUndo={undoCreation}
                    apply={apply}
                    setSubmitted={setSubmitted}
                    onWrite={() => {
                      if (!record || !target) return;
                      try {
                        writeCreation(record, draft, target);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "未写入，草稿已保留。");
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label className="ai-sr-only" htmlFor="ai-prompt">
              向 AI 助理发送消息
            </label>
            <textarea
              id="ai-prompt"
              maxLength={4000}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void run();
                }
              }}
              placeholder={MODES.find((m) => m.id === mode)?.prompt}
            />
            <div>
              <span>
                {creating
                  ? "Enter 换行 · Ctrl + Enter 发送"
                  : mode === "question" && turns.records.length
                    ? "可继续追问 · 最多携带最近两轮"
                    : mode === "summary"
                      ? "检索 → 阅读 → 汇总草稿"
                      : mode === "outline"
                        ? "完整大纲 → 全文草稿 → 确认采纳"
                        : "检查来源后采纳"}
              </span>
              {busy ? (
                <button type="button" className="ai-primary" onClick={stop}>
                  <Square size={13} />
                  停止
                </button>
              ) : (
                <button type="submit" className="ai-primary">
                  <ArrowUp size={16} />
                  {mode === "summary" ? "开始汇总" : mode === "outline" ? "生成全文" : "生成"}
                </button>
              )}
            </div>
          </form>
        </>
      )}
      {message && (
        <p className="ai-feedback" role="status">
          {message}
        </p>
      )}
    </aside>
  );
}
