import React, { useState } from 'react';
import { WORKSPACE_MODES } from '../data/features';
import { BookOpen, Columns2, Code2, GitBranch, Palette } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const Workspace5D: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<string>('canvas');

  const rawMode = WORKSPACE_MODES.find(m => m.id === activeTab) || WORKSPACE_MODES[4];
  const translatedMode = t.workspace.modes.find(m => m.id === activeTab) || t.workspace.modes[0];

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
          <span>{t.workspace.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.workspace.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 720, margin: '0 auto' }}>
          {t.workspace.desc}
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
        {t.workspace.modes.map((mode) => {
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
      <div className="glass-panel" style={{ padding: '36px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 36, alignItems: 'center' }}>
          {/* Mode Description & Highlights */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className="badge-pill" style={{ color: 'var(--accent-cyan)', borderColor: 'currentColor' }}>
                DIMENSION_0{t.workspace.modes.findIndex(m => m.id === activeTab) + 1}
              </span>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                // MODE_FLOW_ACTIVE
              </span>
            </div>
            <h3 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: 14, color: 'var(--text-primary)' }}>
              {translatedMode.title}
            </h3>
            <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
              {translatedMode.desc}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {translatedMode.bullets.map((bullet, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: idx === 0 ? 'var(--accent-cyan)' : idx === 1 ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                    flexShrink: 0
                  }} />
                  <span>{bullet}</span>
                </div>
              ))}
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
              src={rawMode.image}
              alt={translatedMode.title}
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
