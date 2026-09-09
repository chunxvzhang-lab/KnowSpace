import React, { useState } from 'react';
import { DOCS_MODULES, DocModule } from '../data/docsManifest';
import { BookOpen, Search, ArrowLeft, Maximize2, Check, X, Tag } from 'lucide-react';

interface DocsViewerProps {
  onBackToLanding: () => void;
}

export const DocsViewer: React.FC<DocsViewerProps> = ({ onBackToLanding }) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string>(DOCS_MODULES[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<{ src: string; caption: string } | null>(null);

  const filteredModules = DOCS_MODULES.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.shortcut && m.shortcut.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const currentModule = DOCS_MODULES.find(m => m.id === selectedModuleId) || DOCS_MODULES[0];

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '30px 24px 80px' }}>
      {/* Top Header & Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <button
          onClick={onBackToLanding}
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '0.88rem' }}
        >
          <ArrowLeft size={16} />
          <span>返回产品首页</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="badge-pill primary">
            <BookOpen size={14} />
            <span>全功能高清图片手册 (Illustrated Manual) · 32 大模块全景画册</span>
          </div>
        </div>
      </div>

      {/* Main Layout: Left Sidebar + Right Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Left Sidebar: Search & Module List */}
        <div className="glass-panel" style={{ padding: '20px', position: 'sticky', top: 90, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
          {/* Search box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-elevated)',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            marginBottom: 16
          }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="搜索 32 大模块..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                outline: 'none',
                width: '100%'
              }}
            />
          </div>

          {/* Module Scroll List */}
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredModules.map((m) => {
              const isSelected = m.id === currentModule.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModuleId(m.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid transparent',
                    background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                    color: isSelected ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: isSelected ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                    color: isSelected ? '#fff' : 'var(--text-muted)',
                    fontFamily: 'monospace'
                  }}>
                    {m.index}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {m.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {m.category} {m.shortcut ? `· ${m.shortcut}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Content Area: Module Details & HD Images */}
        <div className="glass-panel" style={{ padding: '36px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge-pill primary" style={{ fontSize: '0.85rem' }}>
                模块 {currentModule.index} / 32
              </span>
              <span className="badge-pill">
                <Tag size={12} />
                <span>{currentModule.category}</span>
              </span>
            </div>

            {currentModule.shortcut && (
              <span className="badge-pill" style={{ color: 'var(--accent-amber)', borderColor: 'currentColor' }}>
                快捷键：{currentModule.shortcut}
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: 14, color: 'var(--text-primary)' }}>
            {currentModule.title}
          </h2>

          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
            {currentModule.description}
          </p>

          {/* Key Points Bullet List */}
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 10,
            padding: '16px 20px',
            marginBottom: 32,
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              💡 核心设计与实操要点：
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 16px' }}>
              {currentModule.keyPoints.map((pt, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <Check size={14} color="var(--accent-emerald)" />
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Images Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {currentModule.images.map((img, i) => (
              <div key={i} style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
                <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setPreviewImage(img)}>
                  <img
                    src={img.src}
                    alt={img.caption}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.75rem',
                    backdropFilter: 'blur(6px)'
                  }}>
                    <Maximize2 size={14} />
                    <span>查看大图</span>
                  </div>
                </div>

                <div style={{ padding: '12px 18px', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  {img.caption}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fullscreen Image Preview Lightbox */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <button
            onClick={() => setPreviewImage(null)}
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: '#fff',
              width: 40,
              height: 40,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={22} />
          </button>

          <img
            src={previewImage.src}
            alt={previewImage.caption}
            style={{
              maxWidth: '92vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 10,
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)'
            }}
          />
          <div style={{ color: '#fff', marginTop: 14, fontSize: '0.95rem', fontWeight: 600 }}>
            {previewImage.caption}
          </div>
        </div>
      )}
    </div>
  );
};
