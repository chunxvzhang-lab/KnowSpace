import { parseAiCards, parseAiEdits, type AiCreationMode } from "../../services/aiCreation";

export function AiCreationDraft({
  mode,
  draft,
  onChange,
}: {
  mode: AiCreationMode;
  draft: string;
  onChange: (value: string) => void;
}) {
  if (mode === "edit") {
    let edits;
    try {
      edits = parseAiEdits(draft);
    } catch {
      return <p className="ai-warning">未获得可执行的修改，原文未变。请重新生成。</p>;
    }
    return (
      <div className="ai-edit-drafts" aria-label="文档修改预览">
        {edits.map((edit, i) => (
          <section key={i}>
            <span className="ai-caption">
              修改 {i + 1}
              {edit.nodeId ? ` · ${edit.nodeId}` : ""}
            </span>
            <pre className="ai-edit-before">{edit.before}</pre>
            <label>
              替换为
              <textarea
                aria-label={`替换内容 ${i + 1}`}
                value={edit.after}
                onChange={(e) =>
                  onChange(
                    JSON.stringify({
                      edits: edits.map((item, index) =>
                        index === i ? { ...item, after: e.target.value } : item,
                      ),
                    }),
                  )
                }
              />
            </label>
          </section>
        ))}
      </div>
    );
  }
  if (mode === "canvas") {
    let cards;
    try {
      cards = parseAiCards(draft, true);
    } catch {
      return <p className="ai-warning">白板草稿格式不完整，请重新生成。</p>;
    }
    return (
      <div className="ai-card-drafts" aria-label="白板卡片草稿">
        {cards.map((card, i) => (
          <fieldset key={i}>
            <legend>卡片 {i + 1}</legend>
            <label>
              卡片标题
              <input
                value={card.title}
                maxLength={120}
                onChange={(e) =>
                  onChange(
                    JSON.stringify({
                      cards: cards.map((item, index) =>
                        index === i ? { ...item, title: e.target.value } : item,
                      ),
                    }),
                  )
                }
              />
            </label>
            <label>
              卡片内容
              <textarea
                value={card.content}
                maxLength={4000}
                onChange={(e) =>
                  onChange(
                    JSON.stringify({
                      cards: cards.map((item, index) =>
                        index === i ? { ...item, content: e.target.value } : item,
                      ),
                    }),
                  )
                }
              />
            </label>
          </fieldset>
        ))}
      </div>
    );
  }
  return (
    <label className="ai-creation-draft">
      {mode === "mindmap" ? "脑图草稿" : "创作草稿"}
      <textarea aria-label="创作草稿" value={draft} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function AiCreationControls({
  busy,
  target,
  onTarget,
  position,
  onPosition,
  autoApply,
  onAutoApply,
}: {
  busy: boolean;
  target: "auto" | AiCreationMode;
  onTarget: (value: "auto" | AiCreationMode) => void;
  position: "append" | "cursor";
  onPosition: (value: "append" | "cursor") => void;
  autoApply: boolean;
  onAutoApply: (value: boolean) => void;
}) {
  return (
    <div className="ai-creation-controls">
      <label className="ai-scope-label">
        生成内容
        <select
          aria-label="生成内容"
          value={target}
          disabled={busy}
          onChange={(e) => onTarget(e.target.value as "auto" | AiCreationMode)}
        >
          <option value="auto">按对话自动识别</option>
          <option value="create">文档正文</option>
          <option value="edit">修改当前文档</option>
          <option value="mindmap">思维导图</option>
          <option value="canvas">白板卡片</option>
        </select>
      </label>
      <label className="ai-scope-label">
        写入位置
        <select
          aria-label="写入位置"
          value={position}
          disabled={busy}
          onChange={(e) => onPosition(e.target.value as "append" | "cursor")}
        >
          <option value="append">当前文档末尾</option>
          <option value="cursor">生成时的光标位置</option>
        </select>
      </label>
      <label className="ai-check">
        <input
          type="checkbox"
          checked={autoApply}
          disabled={busy}
          onChange={(e) => onAutoApply(e.target.checked)}
        />
        生成完成后直接写入
      </label>
      <p className="ai-caption">修改指令直接替换对应原文；新内容追加到文末。写入后可撤销。</p>
    </div>
  );
}
