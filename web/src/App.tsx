import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { SocialProofStrip } from './components/SocialProofStrip';
import { BentoGrid } from './components/BentoGrid';
import { Workspace5D } from './components/Workspace5D';
import { InteractiveStage } from './components/InteractiveStage';
import { EngineeringTrust } from './components/EngineeringTrust';
import { ComparisonTable } from './components/ComparisonTable';
import { DownloadCenter } from './components/DownloadCenter';
import { DocsViewer } from './components/DocsViewer';
import { FaqSection } from './components/FaqSection';
import { Footer } from './components/Footer';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { CyberBackground } from './components/CyberBackground';
import { LanguageProvider } from './i18n/LanguageContext';

export const AppContent: React.FC = () => {
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light' | 'eink'>('dark');
  const [activeView, setActiveView] = useState<'landing' | 'docs'>('landing');
  const [paletteOpen, setPaletteOpen] = useState<boolean>(false);

  // Synchronize theme class to document body
  useEffect(() => {
    document.body.className = `theme-${currentTheme}`;
  }, [currentTheme]);

  // Global shortcut listener for Ctrl+K
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Background Mesh & Interactive Cyber Constellation */}
      <div className="ambient-mesh" />
      <CyberBackground theme={currentTheme} />

      {/* Sticky Top Navigation */}
      <Navbar
        currentTheme={currentTheme}
        setTheme={setCurrentTheme}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      {/* Main View Router */}
      <main style={{ flex: 1, position: 'relative', zIndex: 1 }}>
        {activeView === 'landing' ? (
          <>
            <Hero
              currentTheme={currentTheme}
              setTheme={setCurrentTheme}
              onGoToDocs={() => {
                setActiveView('docs');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
            <SocialProofStrip />
            <BentoGrid />
            <Workspace5D />
            <InteractiveStage />
            <EngineeringTrust />
            <ComparisonTable />
            <DownloadCenter />
            <FaqSection />
          </>
        ) : (
          <DocsViewer
            onBackToLanding={() => {
              setActiveView('landing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </main>

      {/* Global Footer */}
      <Footer
        onGoToDocs={() => {
          setActiveView('docs');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Command Palette Interactive Simulator Modal */}
      <CommandPaletteModal
        isOpen={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        setTheme={setCurrentTheme}
        onGoToDocs={() => {
          setActiveView('docs');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
};

