import React from 'react';
import { ShieldCheck, Cpu, HardDrive, RefreshCw, Lock, FileCode } from 'lucide-react';

export const EngineeringTrust: React.FC = () => {
  const pillars = [
    {
      icon: HardDrive,
      title: 'Temp + Fsync 物理事务原子落盘',
      desc: '保存时绝不在原文件上直接覆盖。先写入隐藏临时文件，调用 OS 系统级 fsync 确保沉入磁盘物理扇区，再执行原子重命名替换，彻底杜绝断电导致 0 字节损坏。',
      color: 'var(--accent-emerald)'
    },
    {
      icon: RefreshCw,
      title: '外部编辑器并发修改三向协商',
      desc: '实时校验磁盘物理指纹 { size, mtimeMs }。当外部程序（Git pull / 云同步盘 / 外部编辑器）修改文件时，主动拦截并提供「重载/强制覆盖/另存为」安全协商。',
      color: 'var(--accent-amber)'
    },
    {
      icon: Lock,
      title: '零网络上传与绝对数据主权',
      desc: '100% 本地优先运行。软件没有任何后台追踪分析或私有云端上报，断网可用率 100%，您的知识资产永远掌握在自己手中。',
      color: 'var(--accent-cyan)'
    },
    {
      icon: FileCode,
      title: '开放标准生态，拒绝厂商绑定',
      desc: '原生拥抱 JSON Canvas 1.0、OPML 2.0、FreeMind、GitHub Flavored Markdown 与 KaTeX，数据格式自由流转，随时可迁移、可备份。',
      color: 'var(--accent-indigo)'
    }
  ];

  return (
    <section style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 24px 60px' }}>
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <div className="badge-pill" style={{ color: 'var(--accent-emerald)', borderColor: 'currentColor', marginBottom: 14 }}>
          <ShieldCheck size={14} />
          <span>硬核工程与安全底座</span>
        </div>
        <h2 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
          数据安全高于一切：为严谨研究者而生
        </h2>
        <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', maxWidth: 680, margin: '0 auto' }}>
          从底层代码到上层交互，KnowSpace 的每一个技术选型都将「防丢稿、防损坏、防锁定」置于最高优先级。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
        {pillars.map((p, idx) => {
          const Icon = p.icon;
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
                <Icon size={24} color={p.color} />
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
