import { useEffect, useMemo, useRef, useState } from "react";
import { X, Files } from "lucide-react";
import { documentTemplates, type DocumentTemplate } from "../services/documentTemplates";
import { renderCardMarkdown } from "../services/markdown";

type TemplateDialogProps = {
  onClose: () => void;
  onCreate: (template: DocumentTemplate) => void;
};

export function TemplateDialog({ onClose, onCreate }: TemplateDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState(documentTemplates[0]?.id ?? "");
  const categories = [...new Set(documentTemplates.map((template) => template.category))];
  const filtered = documentTemplates.filter(
    (template) =>
      (!category || template.category === category) &&
      `${template.title} ${template.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selected = filtered.find((template) => template.id === selectedId) ?? filtered[0];
  const html = useMemo(() => renderCardMarkdown(selected?.content ?? ""), [selected]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    previewRef.current?.scrollTo(0, 0);
  }, [selected?.id]);

  return (
    <dialog
      ref={dialogRef}
      className="template-dialog"
      aria-labelledby="template-dialog-title"
      aria-describedby="template-dialog-help"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="template-dialog-header">
        <div>
          <h2 id="template-dialog-title">
            <Files size={20} /> 从模板新建
          </h2>
          <p id="template-dialog-help">选择模板并预览，创建时可修改文件名和保存位置。</p>
        </div>
        <button type="button" className="icon-button" aria-label="关闭模板窗口" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <div className="template-dialog-body">
        <aside className="template-browser" aria-label="模板列表">
          <label htmlFor="template-search">搜索模板</label>
          <input
            id="template-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入名称或工作场景"
            autoFocus
          />
          <label htmlFor="template-category">模板分类</label>
          <select
            id="template-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <p className="template-count" role="status">
            {filtered.length} / {documentTemplates.length} 个模板
          </p>
          <div className="template-list">
            {filtered.map((template) => (
              <button
                type="button"
                key={template.id}
                aria-pressed={selected?.id === template.id}
                className="template-option"
                onClick={() => setSelectedId(template.id)}
              >
                <strong>{template.title}</strong>
                <span>{template.category}</span>
              </button>
            ))}
            {filtered.length === 0 && <p>未找到模板，请调整关键词或分类。</p>}
          </div>
        </aside>
        <section
          className="template-preview"
          ref={previewRef}
          aria-label="模板内容预览"
          tabIndex={0}
          onClick={(event) => event.preventDefault()}
        >
          {selected ? (
            <>
              <p className="template-preview-label">模板预览 · {selected.title}</p>
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
            </>
          ) : (
            <p>没有可预览的模板。</p>
          )}
        </section>
      </div>

      <div className="template-dialog-footer">
        <p>日期和【待填写】内容需手动填写；原模板会保留。</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected}
            onClick={() => {
              if (selected) onCreate(selected);
            }}
          >
            使用模板新建
          </button>
        </div>
      </div>
    </dialog>
  );
}
