import React from 'react';
import { COMPARISON_DATA } from '../data/comparison';
import { Scale, CheckCircle2 } from 'lucide-react';

export const ComparisonTable: React.FC = () => {
  return (
    <section id="comparison" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <Scale size={14} />
          <span>客观横向矩阵</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          为什么选择 KnowSpace？
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          无需在“受制于云端”与“陷入复杂插件配置”之间妥协。
        </p>
      </div>

      <div className="glass-panel" style={{ overflowX: 'auto', padding: '10px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800, fontSize: '0.92rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }}>
              <th style={{ padding: '18px 20px', fontWeight: 700, width: '22%' }}>核心考量维度</th>
              <th style={{ padding: '18px 20px', fontWeight: 800, color: 'var(--accent-cyan)', width: '28%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>KnowSpace (v2.0.0)</span>
                  <span className="badge-pill primary" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>开箱即用</span>
                </div>
              </th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '20%' }}>Obsidian</th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '15%' }}>Notion</th>
              <th style={{ padding: '18px 20px', color: 'var(--text-secondary)', width: '15%' }}>Typora</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON_DATA.map((row, idx) => (
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
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <CheckCircle2 size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
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
