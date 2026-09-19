import { useState } from "react";
import { MINDMAP_ICON_GROUPS } from "../core/mindmapIcons";
import { MINDMAP_PRIORITIES, MINDMAP_PROGRESS_STEPS, PROGRESS_MAX } from "../core/mindmapMarkers";
import { describeMindmapLink, type MindmapLink } from "../core/mindmapLinks";
import { parseTagInput, type NodeMarkers } from "../services/mindmapSidecar";
import { ProgressGlyph } from "./MindmapMarks";

/**
 * What a topic carries that the document cannot say: its icon, its marks, its
 * tags, its link, its note.
 *
 * One component because all five are the same thing to the reader — the map's own
 * annotations, none of which is written into the Markdown — and because a topic in
 * the outline and a topic floating beside it must be able to carry exactly the
 * same set. They are keyed by the topic's id in the companion file, and a floating
 * topic has an id like any other, so nothing below needs to know which kind it is
 * looking at.
 *
 * A fragment rather than a wrapper element, so it drops into a panel without
 * changing that panel's markup: the sections were part of the node style panel
 * before this, and they are still the same elements with the same class names.
 */
export interface MindmapAnnotationSectionsProps {
  /** The topic every control writes to. */
  nodeId: string;
  /** True when several topics are selected, which some labels reflect. */
  isBatchMode: boolean;
  icon: string;
  /** The note hanging off the topic, as the reader wrote it. */
  note: string;
  /** The topic's link, exactly as the reader typed it. */
  link: string;
  /** That text read as a link, or null when this build cannot follow it. */
  parsedLink: MindmapLink | null;
  /** False when this build has no channel for where the link points. */
  canOpenLink: boolean;
  /** The topic's tags, as written. */
  tags: string[];
  /** Every tag already used in this document, most used first. */
  knownTags: { tag: string; count: number }[];
  /** The topic's priority and progress, if either is set. */
  markers: NodeMarkers;
  /** True when the last write to the companion file did not land. */
  saveFailed: boolean;
  onIconChange: (nodeId: string, iconId: string) => void;
  onNoteChange: (nodeId: string, text: string) => void;
  onLinkChange: (nodeId: string, text: string) => void;
  /** Follows the topic's link. Only offered when `canOpenLink`. */
  onOpenLink: (nodeId: string) => void;
  /** The whole list at once: a tag list is edited as a list, not tag by tag. */
  onTagsChange: (nodeId: string, tags: string[]) => void;
  /** `null` clears the mark; the pickers only ever pass a table value or null. */
  onMarkChange: (nodeId: string, field: "priority" | "progress", value: number | null) => void;
}

export function MindmapAnnotationSections({
  nodeId,
  isBatchMode,
  icon,
  note,
  link,
  parsedLink,
  canOpenLink,
  tags,
  knownTags,
  markers,
  saveFailed,
  onIconChange,
  onNoteChange,
  onLinkChange,
  onOpenLink,
  onTagsChange,
  onMarkChange,
}: MindmapAnnotationSectionsProps) {
  /**
   * The tag field's text while it is being typed, and the topic it belongs to.
   *
   * The one piece of state here, and it is here because the field's value is not
   * what is stored — it is a *parse* of it. A field controlled from the parse
   * would eat the separator the moment it was typed: "api " would come back as
   * "api" and the next word would join it. So the text lives here until it is
   * committed, and the topic id is remembered alongside it, so switching topics
   * cannot carry one topic's half-typed tags onto another.
   */
  const [tagDraft, setTagDraft] = useState<{ nodeId: string; text: string } | null>(null);

  const editingTags = tagDraft?.nodeId === nodeId;
  const tagText = editingTags && tagDraft ? tagDraft.text : tags.join(" ");

  const commitTags = () => {
    if (!editingTags || !tagDraft) return;
    // Dropped first so the field falls back to what was actually stored,
    // including a tag the rules turned down.
    setTagDraft(null);
    onTagsChange(nodeId, parseTagInput(tagDraft.text));
  };

  return (
    <>
      {/* One place for the one failure that can come from any control below:
          none of these is written to the document, and a write that did not land
          is worth saying once rather than once per section. */}
      {saveFailed ? (
        <div className="mindmap-annotation-notice" title="下一次改动会再试一次">
          未能保存
        </div>
      ) : null}

      {/* Node Icon — a marker the document has no syntax for, so like the note
          below it lives in the mind map's companion file. Clicking the active
          one takes it off again, which is where the clear button would be. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">节点图标</span>
          {icon ? (
            <button
              type="button"
              className="mindmap-icon-clear"
              onClick={() => onIconChange(nodeId, "")}
            >
              清除
            </button>
          ) : null}
        </div>
        {MINDMAP_ICON_GROUPS.map((group) => (
          <div className="mindmap-icon-group" key={group.group}>
            <span className="mindmap-icon-group-label">{group.group}</span>
            <div className="mindmap-icon-grid">
              {group.icons.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`mindmap-icon-btn ${icon === entry.id ? "is-active" : ""}`}
                  onClick={() => onIconChange(nodeId, icon === entry.id ? "" : entry.id)}
                  title={entry.label}
                  aria-label={entry.label}
                >
                  <entry.Icon size={14} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Priority and progress — the two marks a number says better than any
          picture, and the two the icon table deliberately leaves alone. Clicking
          the mark a node already has takes it off, like the icons above. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">优先级</span>
          <span className="mindmap-ctx-hint">
            {markers.priority ? `P${markers.priority}` : "未设"}
          </span>
        </div>
        <div className="mindmap-mark-row">
          {MINDMAP_PRIORITIES.map((mark) => (
            <button
              key={mark.value}
              type="button"
              className={`mindmap-priority-btn ${markers.priority === mark.value ? "is-active" : ""}`}
              style={{ background: mark.color }}
              onClick={() =>
                onMarkChange(
                  nodeId,
                  "priority",
                  markers.priority === mark.value ? null : mark.value
                )
              }
              title={`优先级 ${mark.label}`}
              aria-label={`优先级 ${mark.label}`}
            >
              {mark.label}
            </button>
          ))}
        </div>

        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">进度</span>
          <span className="mindmap-ctx-hint">
            {markers.progress ? `${markers.progress}/${PROGRESS_MAX}` : "未设"}
          </span>
        </div>
        <div className="mindmap-mark-row">
          {MINDMAP_PROGRESS_STEPS.map((mark) => (
            <button
              key={mark.value}
              type="button"
              className={`mindmap-progress-btn ${markers.progress === mark.value ? "is-active" : ""}`}
              onClick={() =>
                onMarkChange(
                  nodeId,
                  "progress",
                  markers.progress === mark.value ? null : mark.value
                )
              }
              title={mark.label}
              aria-label={`进度 ${mark.label}`}
            >
              <ProgressGlyph value={mark.value} size={16} />
            </button>
          ))}
        </div>
      </div>

      {/* Tags — free text, several per node, and the only annotation whose
          spelling the reader owns. What the document already uses is offered as
          chips, which is what keeps two names for one thing from growing up side
          by side across a long map. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">标签</span>
          <span className="mindmap-ctx-hint">{tags.length > 0 ? `${tags.length} 枚` : "未加"}</span>
        </div>
        <input
          className="mindmap-tag-input"
          value={tagText}
          placeholder="空格或逗号分隔，# 可省"
          onChange={(e) => setTagDraft({ nodeId, text: e.target.value })}
          onBlur={commitTags}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTags();
            }
          }}
        />
        {knownTags.length > 0 ? (
          <div className="mindmap-tag-suggestions">
            {knownTags.map(({ tag, count }) => {
              const active = tags.some((own) => own.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  className={`mindmap-tag-suggestion ${active ? "is-active" : ""}`}
                  onClick={() =>
                    onTagsChange(
                      nodeId,
                      active
                        ? tags.filter((own) => own.toLowerCase() !== tag.toLowerCase())
                        : [...tags, tag]
                    )
                  }
                  title={active ? `从本节点去掉 ${tag}` : `加到本节点：${tag}`}
                >
                  #{tag}
                  <span className="mindmap-tag-count">{count}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Link — one per node, kept as typed. The field says when what is typed
          is not something this build can follow, rather than accepting it in
          silence and then doing nothing when someone asks it to go there. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">链接</span>
          {link ? (
            <button
              type="button"
              className="mindmap-link-clear"
              onClick={() => onLinkChange(nodeId, "")}
            >
              清除
            </button>
          ) : null}
        </div>
        <input
          className="mindmap-link-input"
          value={link}
          placeholder="https://… 或 [[笔记]] 或 #标题"
          onChange={(e) => onLinkChange(nodeId, e.target.value)}
        />
        {link ? (
          parsedLink ? (
            <div className="mindmap-link-actions">
              <span className="mindmap-ctx-hint">{describeMindmapLink(parsedLink)}</span>
              <button
                type="button"
                className="mindmap-link-open"
                onClick={() => onOpenLink(nodeId)}
                disabled={!canOpenLink}
                title={canOpenLink ? "打开" : "这一侧没有能打开它的通道"}
              >
                打开
              </button>
            </div>
          ) : (
            <div className="mindmap-link-actions">
              <span className="mindmap-note-error">不是可识别的链接</span>
              <span className="mindmap-ctx-hint">用 https:// 、[[笔记]] 或 #标题</span>
            </div>
          )
        ) : null}
      </div>

      {/* Node Note — the other thing on this panel that is not in the document.
          It lives in the mind map's companion file, so it is offered here and
          nowhere in the editor: this panel is the map's own surface. */}
      <div className="mindmap-ctx-section">
        <div className="mindmap-ctx-label-row">
          <span className="mindmap-ctx-label">节点备注</span>
        </div>
        <textarea
          className="mindmap-note-input"
          value={note}
          rows={3}
          placeholder={isBatchMode ? "批量选择时只编辑一个节点的备注" : "写点什么，只留在导图里"}
          title="备注保存在文档旁边的伴生文件里，不改动文档本身"
          onChange={(e) => onNoteChange(nodeId, e.target.value)}
        />
      </div>
    </>
  );
}
