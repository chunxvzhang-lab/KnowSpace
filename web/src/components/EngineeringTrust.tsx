import React from 'react';
import { ShieldCheck, HardDrive, RefreshCw, Lock, FileCode } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const EngineeringTrust: React.FC = () => {
  const { t } = useLanguage();

  const icons = [
    { icon: HardDrive, color: 'var(--accent-emerald)' },
    { icon: RefreshCw, color: 'var(--accent-amber)' },
    { icon: Lock, color: 'var(--accent-cyan)' },
    { icon: FileCode, color: 'var(--accent-indigo)' }
  ];

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <div className="badge-pill" style={{ color: 'var(--accent-emerald)', borderColor: 'currentColor', marginBottom: 14 }}>
          <ShieldCheck size={14} />
          <span>{t.engineering.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.engineering.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          {t.engineering.desc}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        {t.engineering.pillars.map((p, idx) => {
          const Icon = icons[idx]?.icon || HardDrive;
          const color = icons[idx]?.color || 'var(--accent-cyan)';
          return (
            <div key={idx} className="glass-panel" style={{ padding: '30px' }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20
              }}>
                <Icon size={24} color={color} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
                {p.title}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                {p.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
