import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const FaqSection: React.FC = () => {
  const { t } = useLanguage();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const toggle = (i: number) => {
    setExpandedIdx(expandedIdx === i ? null : i);
  };

  return (
    <section style={{ maxWidth: 960, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <HelpCircle size={14} />
          <span>{t.faq.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.faq.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)' }}>
          {t.faq.desc}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {t.faq.items.map((faq, idx) => {
          const isExpanded = expandedIdx === idx;
          return (
            <div
              key={idx}
              className="glass-panel"
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'border-color 0.2s ease',
                border: isExpanded ? '1px solid var(--accent-cyan)' : '1px solid var(--border-subtle)'
              }}
            >
              <button
                onClick={() => toggle(idx)}
                style={{
                  width: '100%',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                  gap: 16
                }}
              >
                <span>{faq.question}</span>
                {isExpanded ? <ChevronUp size={20} color="var(--accent-cyan)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
              </button>

              {isExpanded && (
                <div style={{
                  padding: '0 24px 20px',
                  fontSize: '0.95rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.7,
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 16
                }}>
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
