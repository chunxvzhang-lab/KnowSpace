import React from 'react';
import { ShieldCheck, Zap, Layout, Share2, Printer } from 'lucide-react';

export const SocialProofStrip: React.FC = () => {
  const items = [
    { label: '100% 本地优先', desc: '物理事务原子落盘 · 零云端上传', icon: ShieldCheck, color: 'var(--accent-emerald)' },
    { label: '< 15ms 混合检索', desc: '段落级高性能倒排索引分词', icon: Zap, color: 'var(--accent-amber)' },
    { label: 'JSON Canvas 1.0', desc: '全球开放白板生态无锁死', icon: Layout, color: 'var(--accent-cyan)' },
    { label: '60FPS 动态图谱', desc: '黄金螺旋物理力导向拓扑', icon: Share2, color: 'var(--accent-indigo)' },
    { label: '印刷级 PDF 打印', desc: 'Chromium 矢量排版防截断', icon: Printer, color: 'var(--text-primary)' }
  ];

  return (
    <section style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {items.map((item, idx) => {
          const Icon = item.icon;
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
                <Icon size={22} color={item.color} />
              </div>
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
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
