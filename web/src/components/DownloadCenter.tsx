import React from 'react';
import { Download, Package, Archive, ShieldCheck, Check, ExternalLink } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const DownloadCenter: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section id="download" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <Download size={14} />
          <span>{t.download.badge}</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          {t.download.title}
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          {t.download.desc}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, maxWidth: 960, margin: '0 auto 40px' }}>
        {/* MSI Installer Card */}
        <div className="glass-panel" style={{ padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--accent-cyan)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(56, 189, 248, 0.12)', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={24} />
              </div>
              <span className="badge-pill primary" style={{ fontSize: '0.78rem' }}>{t.download.msiBadge}</span>
            </div>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
              {t.download.msiTitle}
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              {t.download.msiDesc}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {t.download.msiPoints.map((point, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <a
              href="https://github.com/knowspace/knowspace/releases/download/v2.0.0/KnowSpace-Setup-2.0.0.msi"
              className="btn-primary"
              style={{ width: '100%', padding: '14px', marginBottom: 12 }}
            >
              <Download size={18} style={{ flexShrink: 0 }} />
              <span>{t.download.msiBtn}</span>
            </a>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              {t.download.msiNote}
            </div>
          </div>
        </div>

        {/* Portable Zip Card */}
        <div className="glass-panel" style={{ padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Archive size={24} style={{ flexShrink: 0 }} />
              </div>
              <span className="badge-pill" style={{ fontSize: '0.78rem' }}>{t.download.zipBadge}</span>
            </div>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
              {t.download.zipTitle}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              {t.download.zipDesc}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              {t.download.zipPoints.map((point, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color="var(--accent-emerald)" style={{ flexShrink: 0 }} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <a
              href="https://github.com/knowspace/knowspace/releases/download/v2.0.0/KnowSpace-win-x64-v2.0.0-portable.zip"
              className="btn-secondary"
              style={{ width: '100%', padding: '14px', marginBottom: 12 }}
            >
              <Download size={18} style={{ flexShrink: 0 }} />
              <span>{t.download.zipBtn}</span>
            </a>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              {t.download.zipNote}
            </div>
          </div>
        </div>
      </div>

      {/* Verification & Environmental Specs */}
      <div className="glass-panel" style={{ maxWidth: 960, margin: '0 auto', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={20} color="var(--accent-emerald)" />
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong>{t.download.shaTitle}</strong>：{t.download.shaDesc}
          </div>
        </div>
        <a
          href="https://github.com/knowspace/knowspace/releases"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          <span>{t.download.githubAll}</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
};
