import React from 'react';
import { Download, BookOpen, Sun, Moon, Feather, Shield, Zap, LayoutGrid, CheckCircle } from 'lucide-react';

interface HeroProps {
  currentTheme: 'dark' | 'light' | 'eink';
  setTheme: (theme: 'dark' | 'light' | 'eink') => void;
  onGoToDocs: () => void;
}

export const Hero: React.FC<HeroProps> = ({ currentTheme, setTheme, onGoToDocs }) => {
  return (
    <section style={{ position: 'relative', padding: '60px 24px 80px', maxWidth: 1280, margin: '0 auto', textAlign: 'center' }}>
      {/* Top Pill Announcement with Cyber Radar Dot */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '6px 18px', borderRadius: 9999, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', marginBottom: 28, boxShadow: '0 4px 16px var(--glow-color)' }}>
        <span className="radar-pulse-dot" style={{ color: 'var(--accent-cyan)' }} />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-cyan)', letterSpacing: '0.04em' }}>
          SYSTEM ONLINE · KNOWSPACE v2.0.0
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>//</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          无限空间白板 · 本地版本旅行 · 毫秒级混合检索
        </span>
      </div>

      {/* Main Headline with Neon Gradient */}
      <h1 className="cyber-text-gradient" style={{
        fontSize: 'clamp(3rem, 6.5vw, 4.8rem)',
        fontWeight: 900,
        lineHeight: 1.15,
        letterSpacing: '-0.03em',
        marginBottom: 20,
        maxWidth: 960,
        margin: '0 auto 20px'
      }}>
        记录 · 阅读 · 连接 · 认知
      </h1>

      {/* Subhead */}
      <p style={{
        fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
        lineHeight: 1.6,
        color: 'var(--text-secondary)',
        maxWidth: 780,
        margin: '0 auto 36px',
        fontWeight: 400
      }}>
        告别折腾 50+ 插件与配置泥潭。开箱即享纯粹 Markdown 写作、全键盘思维导图、
        <strong style={{ color: 'var(--text-primary)' }}> JSON Canvas 1.0 空间白板</strong> 与 
        <strong style={{ color: 'var(--text-primary)' }}> 60FPS 知识星系图谱</strong>。100% 本地优先，物理事务原子落盘。
      </p>

      {/* Dual CTA Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 44 }}>
        <a href="#download" className="btn-primary" style={{ padding: '14px 28px', fontSize: '1.05rem' }}>
          <Download size={20} />
          <span>免费下载 Windows 版 (v2.0.0)</span>
        </a>
        <button onClick={onGoToDocs} className="btn-secondary" style={{ padding: '14px 26px', fontSize: '1.05rem' }}>
          <BookOpen size={19} />
          <span>查阅 32 大模块全景画册</span>
        </button>
      </div>

      {/* Trust Mini Pills */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={16} color="var(--accent-emerald)" />
          <span>100% 数据私有 · 零网络泄露</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={16} color="var(--accent-amber)" />
          <span>&lt; 15ms 倒排混合检索引擎</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LayoutGrid size={16} color="var(--accent-cyan)" />
          <span>JSON Canvas 1.0 全球开放标准</span>
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
          在线亲历设计质感：
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
            cursor: 'pointer'
          }}
        >
          <Sun size={15} color="#d97706" />
          <span>日光浅色 (Warm)</span>
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
            cursor: 'pointer'
          }}
        >
          <Feather size={15} />
          <span>仿电子墨水屏 (E-ink)</span>
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
            cursor: 'pointer'
          }}
        >
          <Moon size={15} color="var(--accent-cyan)" />
          <span>极客暗黑 (Geek Dark)</span>
        </button>
      </div>

      {/* 2400×1350 Hero Showcase Window with Glass Frame & Cyber Laser Scanline */}
      <div className="showcase-window cyber-bracket-container" style={{ maxWidth: 1160, margin: '0 auto' }}>
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
              03-无限空间白板.canvas
            </span>
            <span style={{ color: 'var(--accent-cyan)', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace' }}>
              // 5D_WORKSPACE · 60FPS_ENGINE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="radar-pulse-dot" style={{ color: 'var(--accent-emerald)' }} />
            <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 600 }}>物理原子落盘已同步</span>
          </div>
        </div>

        {/* Real 2400×1350 Showcase Hero Image with Cyber Scanline */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Animated Laser Scanline Effect */}
          <div className="cyber-scanline" />

          <img
            src="./screenshot.png"
            alt="KnowSpace v2.0.0 拟真运行工作台全景"
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
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(56, 189, 248, 0.15)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LayoutGrid size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>五维空间自由跃迁</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>阅读 · 分屏 · 源码 · 脑图 · 白板</div>
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
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700 }}>零知识 · 100% 数据主权</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Temp+Fsync 物理事务原子写</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
