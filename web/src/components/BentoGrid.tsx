import React from 'react';
import { BENTO_FEATURES } from '../data/features';
import { Check, Sparkles, ArrowRight } from 'lucide-react';

interface BentoGridProps {
  onSelectFeature?: (featureId: string) => void;
}

export const BentoGrid: React.FC<BentoGridProps> = () => {
  return (
    <section id="bento" style={{ maxWidth: 1280, margin: '0 auto', padding: '100px 24px 60px' }}>
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="badge-pill primary" style={{ marginBottom: 16 }}>
          <Sparkles size={14} />
          <span>核心能力便当盒</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          开箱即用的极客全能武器库
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          打破传统单体编辑器的能力边界。无需安装任何额外插件，原生沉淀六大高光认知工程模块。
        </p>
      </div>

      {/* Bento Grid Container */}
      <div className="bento-grid">
        {BENTO_FEATURES.map((item, index) => {
          const colClass = `bento-${item.colSpan}`;
          return (
            <div
              key={item.id}
              className={`glass-panel glass-interactive cyber-card-tilt cyber-bracket-container ${colClass}`}
              style={{
                padding: '30px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Top Meta info */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="badge-pill" style={{
                    color: item.tagColor === 'cyan' ? 'var(--accent-cyan)' :
                           item.tagColor === 'emerald' ? 'var(--accent-emerald)' :
                           item.tagColor === 'indigo' ? 'var(--accent-indigo)' : 'var(--accent-amber)',
                    borderColor: 'currentColor'
                  }}>
                    {item.badge}
                  </span>

                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    // 0{index + 1}_SPEC
                  </span>
                </div>

                <h3 style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.3, marginBottom: 12, color: 'var(--text-primary)' }}>
                  {item.title}
                </h3>

                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  {item.description}
                </p>

                {/* Key feature check bullets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 12px', marginBottom: 24 }}>
                  {item.highlights.map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                      <Check size={14} color="var(--accent-emerald)" />
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Real HD Screenshot Preview Window */}
              <div style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                marginTop: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                position: 'relative'
              }}>
                <img
                  src={item.image}
                  alt={item.title}
                  style={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: item.colSpan === 'col-8' ? 380 : 280,
                    objectFit: 'cover',
                    objectPosition: 'top',
                    display: 'block'
                  }}
                  loading="lazy"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
