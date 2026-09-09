import React from 'react';
import { Download, BookOpen, Sun, Moon, Feather, Shield, Zap, LayoutGrid, CheckCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface HeroProps {
  currentTheme: 'dark' | 'light' | 'eink';
  setTheme: (theme: 'dark' | 'light' | 'eink') => void;
  onGoToDocs: () => void;
}

export const Hero: React.FC<HeroProps> = ({ currentTheme, setTheme, onGoToDocs }) => {
  const { t } = useLanguage();

  return (
    <section style={{ position: 'relative', padding: '60px 24px 80px', maxWidth: 1280, margin: '0 auto', textAlign: 'center' }}>
      {/* Top Pill Announcement with Cyber Radar Dot */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 18px',
        borderRadius: 9999,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-strong)',
        marginBottom: 28,
        boxShadow: '0 4px 16px var(--glow-color)',
        lineHeight: 1
      }}>
        <span className="radar-pulse-dot" style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.04em' }}>
          {t.hero.pillTitle}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>//</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {t.hero.pillDesc}
        </span>
      </div>

      {/* Main Headline with Neon Gradient */}
      <h1 className="cyber-text-gradient" style={{
        fontSize: 'clamp(3rem, 6.5vw, 4.8rem)',
        fontWeight: 900,
        lineHeight: 1.18,
        letterSpacing: '-0.03em',
        marginBottom: 20,
        maxWidth: 960,
        margin: '0 auto 20px'
      }}>
        {t.hero.headline}
      </h1>

      {/* Subhead */}
      <p style={{
        fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
        lineHeight: 1.65,
        color: 'var(--text-secondary)',
        maxWidth: 780,
        margin: '0 auto 36px',
        fontWeight: 400
      }}>
        {t.hero.subhead}
      </p>

      {/* Dual CTA Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 44 }}>
        <a href="#download" className="btn-primary" style={{ padding: '14px 28px', fontSize: '1.05rem' }}>
          <Download size={20} style={{ flexShrink: 0 }} />
          <span>{t.hero.ctaDownload}</span>
        </a>
        <button onClick={onGoToDocs} className="btn-secondary" style={{ padding: '14px 26px', fontSize: '1.05rem' }}>
          <BookOpen size={19} style={{ flexShrink: 0 }} />
          <span>{t.hero.ctaDocs}</span>
        </button>
      </div>

      {/* Trust Mini Pills with enhanced contrast */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Shield size={16} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
          <span>{t.hero.trustLocal}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Zap size={16} color="var(--accent-amber)" style={{ flexShrink: 0 }} />
          <span>{t.hero.trustSearch}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <LayoutGrid size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <span>{t.hero.trustCanvas}</span>
        </div>
      </div>

      {/* Interactive Theme Switcher Bar above Stage */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderRadius: 14,
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        marginBottom: 20,
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
      }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {t.hero.themeExperience}
        </span>
        <button
          onClick={() => setTheme('light')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: currentTheme === 'light' ? '1px solid var(--accent-amber)' : '1px solid transparent',
            background: currentTheme === 'light' ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-primary)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1
          }}
        >
          <Sun size={15} color="#d97706" style={{ flexShrink: 0 }} />
          <span>{t.hero.themeWarm}</span>
        </button>
        <button
          onClick={() => setTheme('eink')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: currentTheme === 'eink' ? '1px solid var(--border-strong)' : '1px solid transparent',
            background: currentTheme === 'eink' ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-primary)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1
          }}
        >
          <Feather size={15} style={{ flexShrink: 0 }} />
          <span>{t.hero.themeEink}</span>
        </button>
        <button
          onClick={() => setTheme('dark')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: currentTheme === 'dark' ? '1px solid var(--accent-cyan)' : '1px solid transparent',
            background: currentTheme === 'dark' ? 'var(--bg-elevated)' : 'transparent',
            color: 'var(--text-primary)',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1
          }}
        >
          <Moon size={15} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
          <span>{t.hero.themeDark}</span>
        </button>
      </div>

      {/* 2400×1350 Hero Showcase Window with Glass Frame & Cyber Laser Scanline */}
      <div className="showcase-window" style={{ maxWidth: 1160, margin: '0 auto' }}>
        {/* Fake Desktop Window Titlebar */}
        <div style={{
          height: 42,
          padding: '0 16px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>KnowSpace v2.0.0</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="badge-pill" style={{ fontSize: '0.72rem', padding: '2px 8px', fontFamily: 'monospace' }}>
              {t.hero.windowTag}
            </span>
            <span style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
              {t.hero.windowEngine}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="radar-pulse-dot" style={{ color: 'var(--accent-emerald)' }} />
            <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600 }}>{t.hero.windowStatus}</span>
          </div>
        </div>

        {/* Real 2400×1350 Showcase Hero Image with Cyber Scanline */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Animated Laser Scanline Effect */}
          <div className="cyber-scanline" />

          <img
            src="./screenshot.png"
            alt="KnowSpace v2.0.0"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              transition: 'filter 0.3s ease'
            }}
          />

          {/* Floating High-Impact Highlight Badges */}
          <div style={{
            position: 'absolute',
            bottom: 24,
            left: 24,
            background: 'var(--bg-card)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-strong)',
            padding: '12px 18px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left'
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LayoutGrid size={20} style={{ flexShrink: 0 }} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.hero.float5DTitle}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.hero.float5DDesc}</div>
            </div>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            background: 'var(--bg-card)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--border-strong)',
            padding: '12px 18px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            textAlign: 'left'
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle size={20} style={{ flexShrink: 0 }} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.hero.floatLocalTitle}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t.hero.floatLocalDesc}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
