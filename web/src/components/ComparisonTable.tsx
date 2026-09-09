import React from 'react';
import { Scale, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const ComparisonTable: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section id="comparison" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <Scale size={14} />
          <span>{t.comparison.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.comparison.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          {t.comparison.desc}
        </p>
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800, fontSize: '0.92rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }}>
              <th style={{ padding: '18px 20px', fontWeight: 700, width: '22%' }}>{t.comparison.thDimension}</th>
              <th style={{ padding: '18px 20px', fontWeight: 800, color: 'var(--accent-cyan)', width: '28%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{t.comparison.thKnowSpace}</span>
                  <span className="badge-pill primary" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>{t.comparison.badgeOotb}</span>
                </div>
              </th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '20%' }}>Obsidian</th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '15%' }}>Notion</th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '15%' }}>Typora</th>
            </tr>
          </thead>
          <tbody>
            {t.comparison.rows.map((row, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: row.highlight ? 'rgba(56, 189, 248, 0.03)' : 'transparent'
                }}
              >
                <td style={{ padding: '16px 20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {row.feature}
                </td>
                <td style={{ padding: '16px 20px', color: 'var(--text-primary)', fontWeight: 600, borderLeft: '2px solid var(--accent-cyan)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                    <span>{row.knowspace}</span>
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                  {row.obsidian}
                </td>
                <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                  {row.notion}
                </td>
                <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                  {row.typora}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
