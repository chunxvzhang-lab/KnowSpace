// Synthetic English notes for product screenshots. No user vault is read.
const architecture = `# Building a connected knowledge workspace

> Write. Read. Connect. Know. — Keep your ideas in local, portable files.

## Capture an idea
Start with a short note. Link it to [[02-Project plan]] and [[03-Review cards]] when a connection becomes useful. #knowledge #architecture

- [x] Keep Markdown files on your own device
- [x] Connect notes with wiki links and block references
- [ ] Turn the next idea into a focused project

## Connect the pieces
The workspace brings writing, visual thinking, and review into one place. ^workspace

\`\`\`mermaid
flowchart LR
    A[Capture] --> B[Write]
    B --> C[Connect]
    C --> D[Review]
    D --> B
\`\`\`

## Write with structure
Use headings for an outline, a mind map for relationships, and a canvas for a spatial overview.

| Tool | Purpose | File format |
| :--- | :--- | :--- |
| Editor | Develop an idea | Markdown |
| Mind map | Organize an outline | Markdown + sidecar |
| Canvas | Connect visual cards | JSON Canvas |

## Code and mathematics
\`\`\`typescript
const workspace = {
  storage: "local files",
  connections: ["wiki links", "block references"],
};
\`\`\`

Spaced repetition supports long-term recall: $R = e^{-t/S}$.

## Keep useful context
![[02-Project plan#^next-steps]]

## Next steps
Read [[02-Project plan]], collect ideas in Space, and review [[03-Review cards]].
`;
const plan = `# Project plan

Link ideas, build a clear outline, and keep the next action visible. #project

## Discover
- Read [[01-Knowledge workspace]]
- Capture questions and references

## Design
### Writing
- Keep notes in Markdown
- Use headings to organize the outline
### Visual thinking
- Sketch relationships on a canvas
- Explore the knowledge graph

## Deliver
### Next steps
Write a concise proposal, review open questions, and publish the result. ^next-steps

### Feedback
Record decisions and update [[03-Review cards]].
`;
const review = `# Review cards

Write flashcards in ordinary Markdown and review them with FSRS-5.

## Question and answer
Q: What keeps KnowSpace notes portable?
A: Notes are stored as local Markdown and open-format canvas files.

## Inline card
- A wiki link connects notes using :: [[double brackets]]

## Cloze card
Keep knowledge in {{c1::local files}} that you can read with other tools.

Related: [[01-Knowledge workspace]]
`;
const canvas = JSON.stringify({
  nodes: [
    {
      id: "g1",
      type: "group",
      label: "A local-first knowledge workflow",
      x: 0,
      y: 0,
      width: 1070,
      height: 620,
      color: "5",
    },
    {
      id: "a",
      type: "text",
      x: 40,
      y: 70,
      width: 290,
      height: 195,
      color: "1",
      text: "### 01 · Capture\n\nA quick idea is enough to begin.\n\n- Global Flash Notes shortcut\n- Tasks and tags\n- Saved locally in Space",
    },
    {
      id: "b",
      type: "text",
      x: 390,
      y: 70,
      width: 290,
      height: 195,
      color: "4",
      text: "### 02 · Develop\n\nTurn fragments into clear thinking.\n\n- Markdown with live preview\n- Mind maps from outlines\n- Local version snapshots",
    },
    {
      id: "c",
      type: "text",
      x: 740,
      y: 70,
      width: 290,
      height: 195,
      color: "5",
      text: "### 03 · Connect\n\nKeep ideas in context.\n\n- Wiki links and backlinks\n- Visual canvas relationships\n- Explore the knowledge graph",
    },
    {
      id: "d",
      type: "text",
      x: 390,
      y: 365,
      width: 290,
      height: 185,
      color: "3",
      text: "### 04 · Review\n\nReturn to what matters.\n\n- FSRS-5 scheduling\n- Q&A, inline and cloze cards\n- Recall, reveal, and rate",
    },
    {
      id: "e",
      type: "file",
      file: "01-Knowledge workspace.md",
      x: 40,
      y: 365,
      width: 290,
      height: 185,
      color: "2",
    },
    {
      id: "f",
      type: "file",
      file: "assets/knowspace.png",
      x: 740,
      y: 365,
      width: 290,
      height: 185,
    },
  ],
  edges: [
    { id: "ab", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: "Develop" },
    { id: "bc", fromNode: "b", fromSide: "right", toNode: "c", toSide: "left", label: "Connect" },
    {
      id: "cd",
      fromNode: "c",
      fromSide: "bottom",
      toNode: "d",
      toSide: "right",
      label: "Remember",
    },
    {
      id: "da",
      fromNode: "d",
      fromSide: "left",
      toNode: "a",
      toSide: "bottom",
      label: "New ideas",
    },
  ],
});

const rootPath = "C:\\KnowSpace-Demo";
const documents = {
  "01-Knowledge workspace.md": architecture,
  "02-Project plan.md": plan,
  "03-Review cards.md": review,
  "04-Connected workflow.canvas": canvas,
};

function installFixture({ documents, rootPath, initialName }) {
  const contents = Object.fromEntries(
    Object.entries(documents).map(([name, text]) => [
      `${rootPath}\\${name}`,
      name.endsWith(".canvas")
        ? text.replace("assets/knowspace.png", new URL("icon.png", window.location.href).href)
        : text,
    ]),
  );
  const chapters = Object.keys(documents).map((name, index) => ({
    id: `demo-${index}`,
    title: name.replace(/\.(md|canvas)$/, ""),
    src: name,
    absolutePath: `${rootPath}\\${name}`,
  }));
  const initialPath = `${rootPath}\\${initialName}`;
  const source = (filePath) => ({
    markdown: contents[filePath] || "",
    absolutePath: filePath,
    baseUrl: "file:///C:/KnowSpace-Demo/",
    diskVersion: "demo-1",
    writable: true,
    hasBom: false,
    lineEnding: "LF",
  });
  const manifest = { id: "english-demo", title: "KnowSpace · Demo vault", rootPath, chapters };
  const noop = async () => {};
  const event = () => () => {};
  const settings = {
    autoLaunch: false,
    runInBackground: false,
    autoSaveEnabled: false,
    flashShortcut: "Alt+Space",
  };
  const notes = [
    {
      filePath: `${rootPath}\\Space\\2026-11-09 10-30.md`,
      fileName: "2026-11-09 10-30.md",
      modifiedTime: Date.now(),
      dateStr: new Date().toISOString().slice(0, 10),
      timeDisplay: "10:30",
      size: 220,
      content:
        "# A small idea\n\nConnect the project outline to a visual canvas. #project\n\n- [ ] Review the proposal\n- [x] Sketch the workflow",
      tags: ["project"],
      todos: [
        { lineIndex: 4, text: "Review the proposal", completed: false },
        { lineIndex: 5, text: "Sketch the workflow", completed: true },
      ],
    },
  ];
  const snapshot = {
    id: "demo-snapshot",
    timestamp: "2026-11-08T09:00:00Z",
    filePath: initialPath,
    charCount: 920,
    lineCount: 26,
    diffAdded: 5,
    diffRemoved: 2,
    reason: "manual",
    hash: "english-demo",
  };
  const bridge = {
    apiVersion: "2.7.9",
    files: {
      readMarkdownFile: async (p) => source(p),
      readMarkdownBatch: async (paths) => paths.map((p) => ({ absolutePath: p, ...source(p) })),
      getDirectoryForFile: async () => ({ directory: manifest }),
      openDirectory: async () => ({ directory: manifest }),
      refreshDirectory: async () => manifest,
      readMindmapSidecar: async () => ({ success: true, content: null }),
      saveMindmapSidecar: async () => ({ success: true }),
      setScanOptions: noop,
      saveMarkdownFile: async () =>
        window.__conflict
          ? {
              success: false,
              errorCode: "FILE_CONFLICT",
              diskVersion: "demo-2",
              message: "The disk file has changed.",
            }
          : { success: true, diskVersion: "demo-2" },
      saveMarkdownFileAs: async () => ({
        success: true,
        absolutePath: initialPath,
        diskVersion: "demo-2",
      }),
    },
    history: {
      listSnapshots: async () => [snapshot],
      readSnapshot: async () => ({
        ...snapshot,
        content: documents[initialName].replace("Capture an idea", "Capture a thought"),
      }),
      createManualSnapshot: async () => ({ success: true, snapshot }),
    },
    media: {},
    system: {
      getInitialSyncData: () => ({ filePath: initialPath, source: source(initialPath) }),
      getLaunchFilePath: async () => initialPath,
      getAppSettings: async () => settings,
      setAppSettings: async () => ({ settings }),
      setNativeTheme: noop,
      setDocumentState: noop,
      isFullScreen: async () => false,
      getShellNewStatus: async () => ({
        supported: true,
        markdown: false,
        canvas: false,
        mindmap: false,
      }),
      onOpenFilePath: event,
      onMenuCommand: event,
      onBeforeClose: event,
      onFullScreenChanged: event,
      onThemeUpdated: event,
      onAppSettingsUpdated: event,
    },
    capture: {
      getFlashNotesSummary: async () => ({
        success: true,
        spaceDir: `${rootPath}\\Space`,
        notes,
        totalTodos: 2,
        completedTodos: 1,
      }),
      onFlashNoteSaved: event,
      onFlashFocus: event,
      onFlashShortcutUpdated: event,
      getFlashShortcut: async () => "Alt+Space",
      getFlashPin: async () => false,
      getFlashTargetPath: async () => ({
        success: true,
        spaceDir: `${rootPath}\\Space`,
        targetPath: `${rootPath}\\Space\\2026-11-09 10-30.md`,
        relativeDisplay: "Space/2026-11-09_1030.md",
      }),
      getFlashSpaceConfig: async () => ({
        currentDir: `${rootPath}\\Space`,
        defaultDir: `${rootPath}\\Space`,
        isCustom: false,
      }),
      getPersistentNote: async () =>
        "## Project checklist\n- [ ] Write the proposal\n- [ ] Review the evidence",
      setFlashPersistentTab: noop,
      savePersistentNote: async () => ({ success: true }),
      openFlashCapsule: noop,
    },
  };
  window.bookMDDesktop = bridge;
  window.knowSpaceDesktop = bridge;
}

module.exports = { documents, rootPath, installFixture };
