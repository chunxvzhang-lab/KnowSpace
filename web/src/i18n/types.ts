export type Language = 'zh' | 'en';

export interface TranslationDictionary {
  navbar: {
    features: string;
    bento: string;
    workspace: string;
    interactive: string;
    comparison: string;
    docs: string;
    commandPalette: string;
    download: string;
    langToggle: string;
  };
  hero: {
    pillTitle: string;
    pillDesc: string;
    headline: string;
    subhead: string;
    ctaDownload: string;
    ctaDocs: string;
    trustLocal: string;
    trustSearch: string;
    trustCanvas: string;
    themeExperience: string;
    themeWarm: string;
    themeEink: string;
    themeDark: string;
    windowTag: string;
    windowEngine: string;
    windowStatus: string;
    float5DTitle: string;
    float5DDesc: string;
    floatLocalTitle: string;
    floatLocalDesc: string;
  };
  socialProof: {
    items: {
      label: string;
      desc: string;
    }[];
  };
  bento: {
    badge: string;
    title: string;
    desc: string;
    features: {
      id: string;
      badge: string;
      title: string;
      desc: string;
      highlights: string[];
    }[];
  };
  workspace: {
    badge: string;
    title: string;
    desc: string;
    modes: {
      id: string;
      name: string;
      title: string;
      desc: string;
      bullets: string[];
    }[];
  };
  interactive: {
    badge: string;
    title: string;
    desc: string;
    tabCanvas: string;
    tabDiff: string;
    tabSearch: string;
    canvasTitle: string;
    canvasDesc: string;
    canvasExportBtn: string;
    canvasNodeATitle: string;
    canvasNodeAName: string;
    canvasNodeADrag: string;
    canvasNodeBTitle: string;
    canvasNodeBName: string;
    canvasNodeBDrag: string;
    canvasExtractedSuccess: string;
    canvasClosePreview: string;
    diffTitle: string;
    diffDesc: string;
    diffAdd: string;
    diffDel: string;
    diffSnapshotTime: string;
    diffCurrentVersion: string;
    diffRestoreBadge: string;
    diffLinesLeft: string[];
    diffLinesRight: string[];
    searchTitle: string;
    searchDesc: string;
    searchPlaceholder: string;
    searchSpeed: string;
    searchChipsLabel: string;
    searchNavBtn: string;
  };
  engineering: {
    badge: string;
    title: string;
    desc: string;
    pillars: {
      title: string;
      desc: string;
    }[];
  };
  comparison: {
    badge: string;
    title: string;
    desc: string;
    thDimension: string;
    thKnowSpace: string;
    badgeOotb: string;
    rows: {
      feature: string;
      knowspace: string;
      obsidian: string;
      notion: string;
      typora: string;
      highlight?: boolean;
    }[];
  };
  download: {
    badge: string;
    title: string;
    desc: string;
    msiBadge: string;
    msiTitle: string;
    msiDesc: string;
    msiPoints: string[];
    msiBtn: string;
    msiNote: string;
    zipBadge: string;
    zipTitle: string;
    zipDesc: string;
    zipPoints: string[];
    zipBtn: string;
    zipNote: string;
    shaTitle: string;
    shaDesc: string;
    githubAll: string;
  };
  faq: {
    badge: string;
    title: string;
    desc: string;
    items: {
      question: string;
      answer: string;
      category: string;
    }[];
  };
  docs: {
    backBtn: string;
    badge: string;
    searchPlaceholder: string;
    shortcutLabel: string;
    keyPointsHeader: string;
    zoomIn: string;
    moduleLabel: string;
  };
  footer: {
    brandDesc: string;
    builtBy: string;
    colFeatures: string;
    linkCanvas: string;
    linkHistory: string;
    linkSearch: string;
    link5D: string;
    linkInteractive: string;
    colDocs: string;
    linkManual: string;
    linkComparison: string;
    linkMsiGuide: string;
    linkZipGuide: string;
    colCommunity: string;
    linkGithub: string;
    license: string;
    openStandard: string;
    copyright: string;
    motto: string;
  };
  palette: {
    title: string;
    placeholder: string;
    catTheme: string;
    catNav: string;
    catDownload: string;
    themeLight: string;
    themeEink: string;
    themeDark: string;
    navDocs: string;
    navHome: string;
    navInteractive: string;
    downloadMsi: string;
    downloadZip: string;
    hintEsc: string;
  };
}
