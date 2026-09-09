import React from 'react';
import { Download, Package, Archive, ShieldCheck, Check, Terminal, ExternalLink } from 'lucide-react';

export const DownloadCenter: React.FC = () => {
  return (
    <section id="download" style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div className="badge-pill primary" style={{ marginBottom: 14 }}>
          <Download size={14} />
          <span>下载中心</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          立即开启您的空间化认知之旅
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          完全免费、遵循 MIT 开源许可。选择适合您的安装方式：
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
              <span className="badge-pill primary" style={{ fontSize: '0.78rem' }}>推荐日常使用</span>
            </div>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
              Windows MSI 自动化安装包
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              一键自动化静默安装，自动注册系统级 <code>.md</code> 与 <code>.canvas</code> 文件双击关联及快捷方式。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>原生集成系统级文件后缀关联</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>控制面板标准完整卸载支持</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>支持企业级静默部署参数</span>
              </div>
            </div>
          </div>

          <div>
            <a
              href="https://github.com/knowspace/knowspace/releases/download/v2.0.0/KnowSpace-Setup-2.0.0.msi"
              className="btn-primary"
              style={{ width: '100%', padding: '14px', marginBottom: 12 }}
            >
              <Download size={18} />
              <span>下载 MSI 安装包 (~98 MB)</span>
            </a>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              适配 Windows 10 / 11 (64位)
            </div>
          </div>
        </div>

        {/* Portable Zip Card */}
        <div className="glass-panel" style={{ padding: '36px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Archive size={24} />
              </div>
              <span className="badge-pill" style={{ fontSize: '0.78rem' }}>免安装 · 随身携带</span>
            </div>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: 8, color: 'var(--text-primary)' }}>
              Windows 绿色便携版 (.zip)
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              无需管理员权限，解压即用。可存放于 U 盘或随身移动硬盘，配置默认保留在自身目录，跨机随行。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>解压即可启动，无注册表残留</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>无管理员权限设备即开即用</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color="var(--accent-emerald)" />
                <span>U 盘随身移动办公利器</span>
              </div>
            </div>
          </div>

          <div>
            <a
              href="https://github.com/knowspace/knowspace/releases/download/v2.0.0/KnowSpace-win-x64-v2.0.0-portable.zip"
              className="btn-secondary"
              style={{ width: '100%', padding: '14px', marginBottom: 12 }}
            >
              <Download size={18} />
              <span>下载绿色便携版 (.zip)</span>
            </a>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              直接解压运行 KnowSpace.exe
            </div>
          </div>
        </div>
      </div>

      {/* Verification & Environmental Specs */}
      <div className="glass-panel" style={{ maxWidth: 960, margin: '0 auto', padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={20} color="var(--accent-emerald)" />
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong>SHA-256 完整性哈希校验</strong>：可在安装前使用 PowerShell <code>Get-FileHash</code> 进行校验
          </div>
        </div>
        <a
          href="https://github.com/knowspace/knowspace/releases"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          <span>查看 GitHub 全部 Releases 历史</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
};
