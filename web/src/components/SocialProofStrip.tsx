import React from 'react';
import { ShieldCheck, Zap, Layout, Share2, Printer } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const SocialProofStrip: React.FC = () => {
  const { t } = useLanguage();

  const icons = [
    { icon: ShieldCheck, color: 'var(--accent-emerald)' },
    { icon: Zap, color: 'var(--accent-amber)' },
    { icon: Layout, color: 'var(--accent-cyan)' },
    { icon: Share2, color: 'var(--accent-indigo)' },
    { icon: Printer, color: 'var(--text-primary)' }
  ];

  return (
    <section style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {t.socialProof.items.map((item, idx) => {
          const Icon = icons[idx]?.icon || ShieldCheck;
          const color = icons[idx]?.color || 'var(--accent-cyan)';
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={22} color={color} style={{ flexShrink: 0 }} />
              </div>
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
