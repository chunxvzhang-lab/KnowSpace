import React from 'react';
import { Sparkles, Github, Heart } from 'lucide-react';

interface FooterProps {
  onGoToDocs: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onGoToDocs }) => {
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
            让思想在无界空间中自由生长。<br />
            下一代本地优先、高颜值的个人知识工作台与认知操作系统。
          </p>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Designed & Built by <strong>摸鱼Lab (Moyu Lab)</strong>
          </div>
        </div>

        {/* Col 2: Core Capabilities */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            核心特性
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>无限可视化白板</a>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>本地版本时间旅行</a>
            <a href="#bento" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>全库毫秒级混合检索</a>
            <a href="#workspace" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>五维立体工作区</a>
            <a href="#interactive" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>在线交互实验室</a>
          </div>
        </div>

        {/* Col 3: Documentation & Manuals */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            文档与画册
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <button onClick={onGoToDocs} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
              32 大模块高清图片手册 ➔
            </button>
            <a href="#comparison" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>主流工具横向对比矩阵</a>
            <a href="#download" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Windows MSI 安装说明</a>
            <a href="#download" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>绿色便携版使用指引</a>
          </div>
        </div>

        {/* Col 4: Community & License */}
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>
            开源生态
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.88rem' }}>
            <a
              href="https://github.com/knowspace/knowspace"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              <Github size={16} />
              <span>GitHub 源码仓库</span>
            </a>
            <span style={{ color: 'var(--text-muted)' }}>协议：MIT License © 2026</span>
            <span style={{ color: 'var(--text-muted)' }}>开放标准：JSON Canvas 1.0</span>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{ maxWidth: 1280, margin: '0 auto', paddingTop: 24, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        <div>
          Copyright © 2026 摸鱼Lab (Moyu Lab). All rights reserved.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>Write. Read. Connect. Know.</span>
          <Heart size={13} color="#ef4444" fill="#ef4444" style={{ marginLeft: 4 }} />
        </div>
      </div>
    </footer>
  );
};
