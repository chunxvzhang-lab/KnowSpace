import React, { useState } from 'react';
import { Sparkles, Move, FileText, SplitSquareVertical, Search } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const InteractiveStage: React.FC = () => {
  const { t, lang } = useLanguage();
  const [activeSandbox, setActiveSandbox] = useState<'canvas' | 'diff' | 'search'>('canvas');

  // Sandbox 1: Micro Canvas State
  const [nodeA, setNodeA] = useState({ x: 60, y: 50 });
  const [nodeB, setNodeB] = useState({ x: 380, y: 160 });
  const [extractedArticle, setExtractedArticle] = useState<string | null>(null);

  // Sandbox 3: Search Playground State
  const defaultQuery = lang === 'en' ? 'tag:#architecture link:[[consensus]]' : 'tag:#架构 link:[[分布式协议]]';
  const [searchQuery, setSearchQuery] = useState<string>(defaultQuery);

  const chips = lang === 'en' ? [
    { label: 'tag:#architecture', value: 'tag:#architecture' },
    { label: 'link:[[consensus]]', value: 'link:[[consensus]]' },
    { label: '"raft consensus"', value: '"raft consensus"' },
    { label: '-deprecated', value: '-deprecated' }
  ] : [
    { label: 'tag:#架构', value: 'tag:#架构' },
    { label: 'link:[[分布式协议]]', value: 'link:[[分布式协议]]' },
    { label: '"raft consensus"', value: '"raft consensus"' },
    { label: '-废弃', value: '-废弃' }
  ];

  // Canvas Drag Handling
  const handleDragA = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = nodeA.x;
    const initY = nodeA.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setNodeA({ x: Math.max(20, Math.min(300, initX + dx)), y: Math.max(20, Math.min(220, initY + dy)) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleDragB = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = nodeB.x;
    const initY = nodeB.y;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      setNodeB({ x: Math.max(260, Math.min(560, initX + dx)), y: Math.max(40, Math.min(240, initY + dy)) });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <section id="interactive" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <Sparkles size={14} />
          <span>{t.interactive.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.interactive.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          {t.interactive.desc}
        </p>
      </div>

      {/* Sandbox Selector Tabs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveSandbox('canvas')}
          className="btn-secondary"
          style={{
            borderColor: activeSandbox === 'canvas' ? 'var(--accent-cyan)' : 'var(--border-subtle)',
            background: activeSandbox === 'canvas' ? 'var(--bg-elevated)' : 'var(--bg-card)',
            color: activeSandbox === 'canvas' ? 'var(--accent-cyan)' : 'var(--text-primary)',
            fontWeight: activeSandbox === 'canvas' ? 700 : 500
          }}
        >
          <Move size={16} style={{ flexShrink: 0 }} />
          <span>{t.interactive.tabCanvas}</span>
        </button>
        <button
          onClick={() => setActiveSandbox('diff')}
          className="btn-secondary"
          style={{
            borderColor: activeSandbox === 'diff' ? 'var(--accent-emerald)' : 'var(--border-subtle)',
            background: activeSandbox === 'diff' ? 'var(--bg-elevated)' : 'var(--bg-card)',
            color: activeSandbox === 'diff' ? 'var(--accent-emerald)' : 'var(--text-primary)',
            fontWeight: activeSandbox === 'diff' ? 700 : 500
          }}
        >
          <SplitSquareVertical size={16} style={{ flexShrink: 0 }} />
          <span>{t.interactive.tabDiff}</span>
        </button>
        <button
          onClick={() => setActiveSandbox('search')}
          className="btn-secondary"
          style={{
            borderColor: activeSandbox === 'search' ? 'var(--accent-indigo)' : 'var(--border-subtle)',
            background: activeSandbox === 'search' ? 'var(--bg-elevated)' : 'var(--bg-card)',
            color: activeSandbox === 'search' ? 'var(--accent-indigo)' : 'var(--text-primary)',
            fontWeight: activeSandbox === 'search' ? 700 : 500
          }}
        >
          <Search size={16} style={{ flexShrink: 0 }} />
          <span>{t.interactive.tabSearch}</span>
        </button>
      </div>

      {/* Sandbox Body Container */}
      <div className="glass-panel" style={{ padding: '36px', minHeight: 460, position: 'relative' }}>
        {/* Sandbox 1: Canvas */}
        {activeSandbox === 'canvas' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.interactive.canvasTitle}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {t.interactive.canvasDesc}
                </p>
              </div>

              <button
                onClick={() => setExtractedArticle(lang === 'en' ? `
# Architecture & Local Persistence Specification

## 1. Core Definitions
Generated by KnowSpace Reverse Topology Engine from Canvas nodes.
- Hierarchy: Alpha Hub Card (X:${nodeA.x}, Y:${nodeA.y})
- Core Flow: Definition ➔ Transaction ➔ Disk Flush

## 2. Transactional Atomic Flush
- Target Receiver: Beta Storage Container (X:${nodeB.x}, Y:${nodeB.y})
- Zero 0-byte truncation guaranteed.
                `.trim() : `
# 知识架构与本地持久化方案

## 1. 核心业务与概念定义
本文档由 KnowSpace 逆向拓扑引擎基于白板节点拓扑排序自动生成。
- 坐标层级：Alpha 枢纽卡片 (X:${nodeA.x}, Y:${nodeA.y})
- 核心流向：定义 ➔ 事务执行 ➔ 物理落盘

## 2. 事务落盘与原子替换
- 目标受体：Beta 存储容器 (X:${nodeB.x}, Y:${nodeB.y})
- 保证无任何 0 字节文件截断损坏。
                `.trim())}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <FileText size={16} />
                <span>{t.interactive.canvasExportBtn}</span>
              </button>
            </div>

            {/* Micro Canvas Area */}
            <div style={{
              height: 320,
              borderRadius: 12,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Grid Background Pattern */}
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(var(--border-subtle) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                pointerEvents: 'none'
              }} />

              {/* Dynamic Bezier SVG Connection */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-cyan)" />
                  </marker>
                </defs>
                <path
                  d={`M ${nodeA.x + 180} ${nodeA.y + 40} C ${nodeA.x + 240} ${nodeA.y + 40}, ${nodeB.x - 60} ${nodeB.y + 40}, ${nodeB.x} ${nodeB.y + 40}`}
                  fill="none"
                  stroke="var(--accent-cyan)"
                  strokeWidth="2.5"
                  markerEnd="url(#arrow)"
                  strokeDasharray="4 2"
                />
              </svg>

              {/* Card Node A */}
              <div
                onMouseDown={handleDragA}
                style={{
                  position: 'absolute',
                  left: nodeA.x,
                  top: nodeA.y,
                  width: 180,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--accent-cyan)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                  cursor: 'grab',
                  userSelect: 'none'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: 4 }}>
                  {t.interactive.canvasNodeATitle}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.interactive.canvasNodeAName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t.interactive.canvasNodeADrag}
                </div>
              </div>

              {/* Card Node B */}
              <div
                onMouseDown={handleDragB}
                style={{
                  position: 'absolute',
                  left: nodeB.x,
                  top: nodeB.y,
                  width: 200,
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--accent-emerald)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                  cursor: 'grab',
                  userSelect: 'none'
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: 4 }}>
                  {t.interactive.canvasNodeBTitle}
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.interactive.canvasNodeBName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t.interactive.canvasNodeBDrag}
                </div>
              </div>
            </div>

            {/* Extracted Markdown Preview Modal */}
            {extractedArticle && (
              <div style={{ marginTop: 20, padding: 18, borderRadius: 10, background: 'var(--code-bg)', border: '1px solid var(--border-subtle)', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                    {t.interactive.canvasExtractedSuccess}
                  </span>
                  <button onClick={() => setExtractedArticle(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    {t.interactive.canvasClosePreview}
                  </button>
                </div>
                <pre style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                  {extractedArticle}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Sandbox 2: Diff Slider */}
        {activeSandbox === 'diff' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t.interactive.diffTitle}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {t.interactive.diffDesc}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="badge-pill" style={{ color: '#10b981', borderColor: 'currentColor' }}>
                  {t.interactive.diffAdd}
                </span>
                <span className="badge-pill" style={{ color: '#ef4444', borderColor: 'currentColor' }}>
                  {t.interactive.diffDel}
                </span>
              </div>
            </div>

            {/* Diff Comparison Stage */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: 'var(--code-bg)', padding: 20, borderRadius: 12, border: '1px solid var(--border-strong)', fontSize: '0.88rem', fontFamily: 'monospace' }}>
              {/* Left Column: Historical Snapshot */}
              <div>
                <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {t.interactive.diffSnapshotTime}
                </div>
                {t.interactive.diffLinesLeft.map((line, idx) => (
                  <div
                    key={idx}
                    className={line.includes('- ') ? 'diff-del' : ''}
                    style={{ padding: '3px 6px', borderRadius: 4, color: line.includes('- ') ? undefined : 'var(--text-secondary)' }}
                  >
                    {line}
                  </div>
                ))}
              </div>

              {/* Right Column: Current Version */}
              <div>
                <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid var(--border-subtle)', color: 'var(--accent-emerald)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{t.interactive.diffCurrentVersion}</span>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(16,185,129,0.18)', color: 'var(--accent-emerald)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                    {t.interactive.diffRestoreBadge}
                  </span>
                </div>
                {t.interactive.diffLinesRight.map((line, idx) => (
                  <div
                    key={idx}
                    className={line.includes('+ ') ? 'diff-ins' : ''}
                    style={{ padding: '3px 6px', borderRadius: 4, color: line.includes('+ ') ? undefined : 'var(--text-secondary)' }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sandbox 3: Search Playground */}
        {activeSandbox === 'search' && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t.interactive.searchTitle}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {t.interactive.searchDesc}
              </p>
            </div>

            {/* Input and Chips */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 10,
                padding: '10px 16px',
                marginBottom: 12
              }}>
                <Search size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                  placeholder={t.interactive.searchPlaceholder}
                />
                <span style={{ fontSize: '0.78rem', color: 'var(--accent-emerald)', fontWeight: 700, flexShrink: 0 }}>
                  {t.interactive.searchSpeed}
                </span>
              </div>

              {/* Syntax Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{t.interactive.searchChipsLabel}</span>
                {chips.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSearchQuery(c.value)}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--accent-cyan)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      lineHeight: 1
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mock Search Results */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className="badge-pill primary" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      {lang === 'en' ? '01-distributed-architecture.md' : '01-分布式系统架构.md'}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'L45-48 · # Consensus & State Machine' : 'L45-48 · # 共识机制与状态机'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {lang === 'en' ? (
                      <>Ensuring strict quorum adjudication via <mark style={{ background: 'rgba(56,189,248,0.25)', color: 'var(--accent-cyan)', padding: '0 4px', borderRadius: 3 }}>[[consensus]]</mark> under partition scenarios...</>
                    ) : (
                      <>在节点故障与网络分区下，确保通过 <mark style={{ background: 'rgba(56,189,248,0.25)', color: 'var(--accent-cyan)', padding: '0 4px', borderRadius: 3 }}>[[分布式协议]]</mark> 达成严格法定人数裁决...</>
                    )}
                  </div>
                </div>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', flexShrink: 0 }}>
                  {t.interactive.searchNavBtn}
                </button>
              </div>

              <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className="badge-pill primary" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      {lang === 'en' ? '03-infinite-canvas.canvas' : '03-无限空间白板.canvas'}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {lang === 'en' ? 'Card #4 · #Architecture' : 'Card #4 · #架构规范'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {lang === 'en' ? (
                      <>Tagged core data bus with <mark style={{ background: 'rgba(56,189,248,0.25)', color: 'var(--accent-cyan)', padding: '0 4px', borderRadius: 3 }}>#architecture</mark>, establishing multi-path connections...</>
                    ) : (
                      <>核心数据总线打上 <mark style={{ background: 'rgba(56,189,248,0.25)', color: 'var(--accent-cyan)', padding: '0 4px', borderRadius: 3 }}>#架构</mark> 标签，建立多路流向连线...</>
                    )}
                  </div>
                </div>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.78rem', flexShrink: 0 }}>
                  {t.interactive.searchNavBtn}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
