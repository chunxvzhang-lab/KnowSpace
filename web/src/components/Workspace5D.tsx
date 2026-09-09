import React, { useState } from 'react';
import { WORKSPACE_MODES } from '../data/features';
import { BookOpen, Columns2, Code2, GitBranch, Palette, ArrowRight } from 'lucide-react';

export const Workspace5D: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('canvas');

  const currentMode = WORKSPACE_MODES.find(m => m.id === activeTab) || WORKSPACE_MODES[4];

  const getIcon = (id: string) => {
    switch (id) {
      case 'read': return <BookOpen size={18} />;
      case 'split': return <Columns2 size={18} />;
      case 'source': return <Code2 size={18} />;
      case 'mindmap': return <GitBranch size={18} />;
      case 'canvas': return <Palette size={18} />;
      default: return <BookOpen size={18} />;
    }
  };

  return (
    <section id="workspace" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <span>五维立体工作区</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          从一维线性文本，到五维空间认知跃迁
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 720, margin: '0 auto' }}>
          思考在不同的阶段需要不同的空间容器。KnowSpace 在一套引擎下无缝承载五种工作形态，随时随需按心流切换。
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 36
      }}>
        {WORKSPACE_MODES.map((mode) => {
          const isActive = mode.id === activeTab;
          return (
            <button
              key={mode.id}
              onClick={() => setActiveTab(mode.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 12,
                border: isActive ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                background: isActive ? 'var(--bg-card)' : 'var(--bg-surface)',
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? '0 4px 16px var(--glow-color)' : 'none'
              }}
            >
              {getIcon(mode.id)}
              <span>{mode.name}</span>
            </button>
          );
        })}
      </div>

      {/* Mode Showcase Stage */}
      <div className="glass-panel cyber-bracket-container" style={{ padding: '36px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 36, alignItems: 'center' }}>
          {/* Mode Description & Highlights */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className="badge-pill" style={{ color: 'var(--accent-cyan)', borderColor: 'currentColor' }}>
                DIMENSION_0{WORKSPACE_MODES.findIndex(m => m.id === activeTab) + 1}
              </span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                // MODE_FLOW_ACTIVE
              </span>
            </div>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 14, color: 'var(--text-primary)' }}>
              {currentMode.title}
            </h3>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
              {currentMode.desc}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeTab === 'canvas' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                    <span><strong>JSON Canvas 1.0</strong> 国际开放标准，与全球生态无损互通</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                    <span><strong>拓扑排序算法</strong>：零散白板卡片一键逆向萃取为万字专著</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-amber)' }} />
                    <span><strong>Minimap 鹰眼雷达</strong>：全局视口实时穿透跳跃</span>
                  </div>
                </>
              )}
              {activeTab === 'split' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                    <span><strong>AST 块级映射</strong>：解决长篇 Markdown 错位滚动的业界难题</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                    <span><strong>实时双向同步</strong>：编辑器与渲染视窗毫秒级对齐</span>
                  </div>
                </>
              )}
              {activeTab === 'mindmap' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                    <span><strong>Ctrl+M 一秒切换</strong>：大纲与导图双向无缝转换</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-amber)' }} />
                    <span><strong>OPML 2.0 / FreeMind 导出</strong>：无缝流转至专业思维导图工具</span>
                  </div>
                </>
              )}
              {activeTab === 'read' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                    <span><strong>960px 黄金阅读视宽</strong>：专为长时间深度阅读优化的护眼排版</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                    <span><strong>打字机垂直锁定</strong>：输入焦点永远居中于舒适视线</span>
                  </div>
                </>
              )}
              {activeTab === 'source' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-cyan)' }} />
                    <span><strong>CodeMirror 6 现代底座</strong>：代码围栏折叠与极客高亮</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-emerald)' }} />
                    <span><strong>YAML Front Matter 管理</strong>：完整呈现文档元数据与标签体系</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Screenshot Display Frame */}
          <div style={{
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-elevated)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.3)'
          }}>
            <img
              src={currentMode.image}
              alt={currentMode.title}
              style={{
                width: '100%',
                height: 'auto',
                display: 'block'
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
