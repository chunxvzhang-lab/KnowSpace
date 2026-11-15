export type DocumentTemplate = {
  id: string;
  title: string;
  category: string;
  content: string;
  extension?: ".md" | ".mindmap.md" | ".canvas";
};

// Bundle the maintained Markdown files so templates also work offline in app.asar.
const files = import.meta.glob<string>("../../docs/markdown-templates/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const documentTemplates: DocumentTemplate[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, content]) => {
    const parts = path.split("/");
    const fileName = parts.at(-1)!;
    return {
      id: fileName.replace(/\.md$/, ""),
      title: fileName.replace(/^\d+-/, "").replace(/\.md$/, ""),
      category: parts.at(-2)!.replace(/^\d+-/, ""),
      content,
    };
  });
