import React from 'react';
import { Sparkles, Download, BookOpen, Sun, Moon, Feather, Search, Languages } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

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
  const { lang, toggleLang, t } = useLanguage();

  return (
    <header className="sticky-nav">
      <div className="sticky-nav-inner">
        {/* Brand Logo & Version */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
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
              color: '#fff',
              flexShrink: 0
            }}>
              <Sparkles size={22} style={{ flexShrink: 0 }} />
            </div>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              Know<span style={{ color: 'var(--accent-cyan)' }}>Space</span>
            </span>
          </div>

          <span className="badge-pill primary" style={{ display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
            v2.0.0
          </span>
        </div>

        {/* Navigation Links with no-wrap and responsive collapsing */}
        <nav className="nav-links-container">
          <button
            onClick={() => setActiveView('landing')}
            className={`nav-link-btn ${activeView === 'landing' ? 'active' : ''}`}
          >
            {t.navbar.features}
          </button>

          {activeView === 'landing' && (
            <div className="nav-secondary-links" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <a href="#bento" className="nav-link-btn">
                {t.navbar.bento}
              </a>
              <a href="#workspace" className="nav-link-btn">
                {t.navbar.workspace}
              </a>
              <a href="#interactive" className="nav-link-btn">
                {t.navbar.interactive}
              </a>
              <a href="#comparison" className="nav-link-btn">
                {t.navbar.comparison}
              </a>
            </div>
          )}

          <button
            onClick={() => setActiveView('docs')}
            className={`nav-link-btn ${activeView === 'docs' ? 'active' : ''}`}
          >
            <BookOpen size={16} style={{ flexShrink: 0 }} />
            <span>{t.navbar.docs}</span>
          </button>
        </nav>

        {/* Action Controls, Language Switcher & Theme Toggle */}
        <div className="nav-controls-container">
          {/* Language Switcher (中 / EN) */}
          <button
            onClick={toggleLang}
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: 'var(--accent-cyan)',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              lineHeight: 1
            }}
            title={lang === 'zh' ? 'Switch to English (切换为英文)' : '切换为简体中文 (Switch to Chinese)'}
          >
            <Languages size={15} style={{ flexShrink: 0 }} />
            <span>{t.navbar.langToggle}</span>
          </button>

          {/* Palette trigger capsule */}
          <button
            onClick={onOpenPalette}
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 12px',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
            title="Ctrl+K"
          >
            <Search size={14} style={{ flexShrink: 0 }} />
            <span>{t.navbar.commandPalette}</span>
            <kbd style={{ fontSize: '0.72rem', background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: 4, border: '1px solid var(--border-strong)', lineHeight: 1 }}>
              Ctrl K
            </kbd>
          </button>

          {/* Theme Switcher Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-surface)', padding: 3, borderRadius: 10, border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button
              onClick={() => setTheme('light')}
              style={{
                background: currentTheme === 'light' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'light' ? 'var(--accent-amber)' : 'var(--text-muted)',
                padding: '6px 7px',
                borderRadius: 7,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0
              }}
              title="Warm Light"
            >
              <Sun size={15} style={{ flexShrink: 0 }} />
            </button>
            <button
              onClick={() => setTheme('eink')}
              style={{
                background: currentTheme === 'eink' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'eink' ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '6px 7px',
                borderRadius: 7,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0
              }}
              title="E-ink Paper"
            >
              <Feather size={15} style={{ flexShrink: 0 }} />
            </button>
            <button
              onClick={() => setTheme('dark')}
              style={{
                background: currentTheme === 'dark' ? 'var(--bg-card)' : 'none',
                border: 'none',
                color: currentTheme === 'dark' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                padding: '6px 7px',
                borderRadius: 7,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0
              }}
              title="Geek Dark"
            >
              <Moon size={15} style={{ flexShrink: 0 }} />
            </button>
          </div>

          {/* Download CTA */}
          <a
            href="#download"
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.86rem', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            <Download size={15} style={{ flexShrink: 0 }} />
            <span>{t.navbar.download}</span>
          </a>
        </div>
      </div>
    </header>
  );
};
