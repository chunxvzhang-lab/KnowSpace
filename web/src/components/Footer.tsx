import React from 'react';
import { Sparkles, Github, Heart } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface FooterProps {
  onGoToDocs: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onGoToDocs }) => {
  const { t } = useLanguage();

  return (
    <footer style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', padding: '60px 24px 40px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 40, marginBottom: 50 }}>
        {/* Col 1: Brand & Philosophy */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Sparkles size={18} />
            </div>
            <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>KnowSpace</span>
          </div>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
            {t.footer.brandDesc}
          </p>

          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {t.footer.builtBy}
          </div>
        </div>

        {/* Col 2: Core Capabilities */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            {t.footer.colFeatures}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkCanvas}</a>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkHistory}</a>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkSearch}</a>
            <a href="#workspace" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.link5D}</a>
            <a href="#interactive" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkInteractive}</a>
          </div>
        </div>

        {/* Col 3: Documentation & Manuals */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            {t.footer.colDocs}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <button onClick={onGoToDocs} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textAlign: 'left', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
              {t.footer.linkManual}
            </button>
            <a href="#comparison" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkComparison}</a>
            <a href="#download" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkMsiGuide}</a>
            <a href="#download" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{t.footer.linkZipGuide}</a>
          </div>
        </div>

        {/* Col 4: Community & License */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            {t.footer.colCommunity}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <a
              href="https://github.com/knowspace/knowspace"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              <Github size={16} style={{ flexShrink: 0 }} />
              <span>{t.footer.linkGithub}</span>
            </a>
            <span style={{ color: 'var(--text-secondary)' }}>{t.footer.license}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{t.footer.openStandard}</span>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{ maxWidth: 1280, margin: '0 auto', paddingTop: 24, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        <div>
          {t.footer.copyright}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{t.footer.motto}</span>
          <Heart size={13} color="#ef4444" fill="#ef4444" style={{ marginLeft: 4, flexShrink: 0 }} />
        </div>
      </div>
    </footer>
  );
};
