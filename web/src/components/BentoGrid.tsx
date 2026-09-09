import React from 'react';
import { BENTO_FEATURES } from '../data/features';
import { Check, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface BentoGridProps {
  onSelectFeature?: (featureId: string) => void;
}

export const BentoGrid: React.FC<BentoGridProps> = () => {
  const { t } = useLanguage();

  return (
    <section id="bento" style={{ maxWidth: 1280, margin: '0 auto', padding: '100px 24px 60px' }}>
      {/* Section Header */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <div className="badge-pill primary" style={{ marginBottom: 16 }}>
          <Sparkles size={14} />
          <span>{t.bento.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.bento.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          {t.bento.desc}
        </p>
      </div>

      {/* Bento Grid Container */}
      <div className="bento-grid">
        {BENTO_FEATURES.map((item, index) => {
          const colClass = `bento-${item.colSpan}`;
          const trans = t.bento.features[index] || item;
          return (
            <div
              key={item.id}
              className={`glass-panel glass-interactive cyber-card-tilt ${colClass}`}
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
                    {trans.badge}
                  </span>

                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    // 0{index + 1}_SPEC
                  </span>
                </div>

                <h3 style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.3, marginBottom: 12, color: 'var(--text-primary)' }}>
                  {trans.title}
                </h3>

                <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  {trans.desc}
                </p>

                {/* Key feature check bullets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 10px', marginBottom: 24 }}>
                  {trans.highlights.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.84rem',
                        color: 'var(--text-primary)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        padding: '6px 10px',
                        borderRadius: 8
                      }}
                    >
                      <Check size={14} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 500, lineHeight: 1.3 }}>{h}</span>
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
