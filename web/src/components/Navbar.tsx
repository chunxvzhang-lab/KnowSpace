import React from 'react';
import { Sparkles, Download, BookOpen, Sun, Moon, Feather, Search } from 'lucide-react';

interface NavbarProps {
  currentTheme: 'dark' | 'light' | 'eink';
  setTheme: (theme: 'dark' | 'light' | 'eink') => void;
  activeView: 'landing' | 'docs';
  setActiveView: (view: 'landing' | 'docs') => void;
  onOpenPalette: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTheme,
  setTheme,
  activeView,
  setActiveView,
  onOpenPalette
}) => {
  return (
    <header className="sticky-nav">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px', height: 70, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Brand Logo & Version */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div 
            onClick={() => setActiveView('landing')}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
          >
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)',
              color: '#fff'
            }}>
              <Sparkles size={22} />
            </div>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
              Know<span style={{ color: 'var(--accent-cyan)' }}>Space</span>
            </span>
          </div>

          <span className="badge-pill primary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            v2.0.0
          </span>
        </div>

        {/* Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <button
            onClick={() => setActiveView('landing')}
            style={{
              background: 'none',
              border: 'none',
              color: activeView === 'landing' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 0',
              borderBottom: activeView === 'landing' ? '2px solid var(--accent-cyan)' : '2px solid transparent'
            }}
          >
            产品特性
          </button>

          {activeView === 'landing' && (
            <>
              <a href="#bento" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500, textDecoration: 'none' }}>
                核心能力
              </a>
              <a href="#workspace" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500, textDecoration: 'none' }}>
                五维空间
              </a>
              <a href="#interactive" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500, textDecoration: 'none' }}>
                在线演练
              </a>
              <a href="#comparison" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500, textDecoration: 'none' }}>
                竞品对比
              </a>
            </>
          )}

          <button
            onClick={() => setActiveView('docs')}
            style={{
              background: 'none',
              border: 'none',
              color: activeView === 'docs' ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 0',
              borderBottom: activeView === 'docs' ? '2px solid var(--accent-cyan)' : '2px solid transparent'
            }}
          >
            <BookOpen size={17} />
            在线画册与文档
          </button>
        </nav>

        {/* Action Controls & Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Palette trigger capsule */}
          <button
            onClick={onOpenPalette}
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              border: '1px solid var(--border-subtle)'
            }}
            title="模拟全局命令中枢 (Ctrl+K)"
          >
            <Search size={15} />
            <span>命令中枢</span>
            <kbd style={{ fontSize: '0.75rem', background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-strong)' }}>
              Ctrl K
            </kbd>
          </button>

          {/* Theme Switcher Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', padding: 3, borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setTheme('light')}
              style={{
                background: currentTheme === 'light' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'light' ? 'var(--accent-amber)' : 'var(--text-muted)',
                padding: '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="切换至日光浅色主题"
            >
              <Sun size={15} />
            </button>
            <button
              onClick={() => setTheme('eink')}
              style={{
                background: currentTheme === 'eink' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'eink' ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="切换至电子墨水屏主题"
            >
              <Feather size={15} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              style={{
                background: currentTheme === 'dark' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'dark' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                padding: '6px 8px',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="切换至极客暗黑主题"
            >
              <Moon size={15} />
            </button>
          </div>

          {/* Download CTA */}
          <a href="#download" className="btn-primary" style={{ padding: '8px 18px', fontSize: '0.88rem' }}>
            <Download size={16} />
            <span>免费下载</span>
          </a>
        </div>
      </div>
    </header>
  );
};
