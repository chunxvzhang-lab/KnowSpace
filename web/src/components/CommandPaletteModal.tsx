import React, { useState, useEffect } from 'react';
import { Search, FileText, Command, ArrowRight, X, Sparkles, Moon, Sun, Feather } from 'lucide-react';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  setTheme: (theme: 'dark' | 'light' | 'eink') => void;
  onGoToDocs: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  setTheme,
  onGoToDocs
}) => {
  const [query, setQuery] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const mockItems = [
    { type: 'file', label: '01-分布式系统架构.md', desc: '核心规范 · L45', action: () => { onGoToDocs(); onClose(); } },
    { type: 'file', label: '03-无限空间白板.canvas', desc: 'JSON Canvas 1.0 架构拓扑', action: () => { onGoToDocs(); onClose(); } },
    { type: 'cmd', label: '> 切换至日光浅色主题 (Warm Amber)', desc: '主题调度', action: () => { setTheme('light'); onClose(); } },
    { type: 'cmd', label: '> 切换至仿电子墨水屏主题 (E-ink Paper)', desc: '护眼模式', action: () => { setTheme('eink'); onClose(); } },
    { type: 'cmd', label: '> 切换至极客暗黑主题 (Geek Dark)', desc: '夜间模式', action: () => { setTheme('dark'); onClose(); } },
    { type: 'cmd', label: '> 打开 32 大模块高清画册与全景手册', desc: '在线文档', action: () => { onGoToDocs(); onClose(); } }
  ];

  const filtered = mockItems.filter(item => 
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.desc.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '14vh'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--bg-surface)',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          border: '1px solid var(--border-strong)'
        }}
      >
        {/* Search input header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          <Search size={20} color="var(--accent-cyan)" />
          <input
            autoFocus
            type="text"
            placeholder="输入文件名、拼音缩写 (如 jg)、或输入 > 执行动作..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: '1.05rem',
              outline: 'none'
            }}
          />
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              未搜索到匹配项
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                onClick={item.action}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {item.type === 'file' ? (
                    <FileText size={18} color="var(--accent-cyan)" />
                  ) : (
                    <Command size={18} color="var(--accent-emerald)" />
                  )}
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {item.desc}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span>回车执行</span>
                  <ArrowRight size={13} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div style={{
          padding: '10px 18px',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.78rem',
          color: 'var(--text-muted)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>↑↓ 导航</span>
            <span>↵ 确认</span>
            <span>Esc 退出</span>
          </div>
          <span style={{ color: 'var(--accent-cyan)' }}>KnowSpace Command Palette 模拟器</span>
        </div>
      </div>
    </div>
  );
};
