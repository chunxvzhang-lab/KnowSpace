/**
 * Block-granular article insertion in ReaderPane (phase 2, wave 2-1).
 *
 * The React-commit half of the typing long task disappears because React no
 * longer owns the article's children: the pane splices ONE changed block and
 * leaves every other node untouched. These tests pin the three properties
 * that claim buys — node identity across a rerender (search <mark>s and
 * mermaid SVGs inside untouched blocks survive), the documentKey remount
 * (React drops the manually appended DOM with its container), and the
 * innerHTML fallback for chapters without blocks (today's path, unchanged).
 */
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReaderPane } from "../components/ReaderPane";
import { renderMarkdown } from "../services/markdown";
import type { RenderedChapter } from "../core/types";

const v1Source = `# Title Block

The first paragraph stays untouched.

The second paragraph gets edited.

- a list block
- with two items

> and a quote block

The last paragraph stays untouched too.
`;

async function editMiddle(source: string): Promise<string> {
  return source.replace("The second paragraph gets edited.", "The second paragraph got edited!");
}

/**
 * The live DOM minus the insertion bookkeeping: stamped `data-block-key`
 * attributes are the splice markers, not chapter content — the article's
 * element TREE must equal what `html` would parse to.
 */
function strippedArticleHtml(article: HTMLElement): string {
  const template = document.createElement("template");
  template.innerHTML = article.innerHTML;
  template.content
    .querySelectorAll("[data-block-key]")
    .forEach((el) => el.removeAttribute("data-block-key"));
  return template.innerHTML;
}

function mountReader(chapter: RenderedChapter | null, documentKey?: string) {
  return render(
    <ReaderPane
      chapter={chapter}
      documentKey={documentKey}
      containerRef={{ current: null }}
      fontScale={1}
      mermaidTheme="default"
      onMermaidError={() => {}}
      showLineNumbers
    />,
  );
}

describe("ReaderPane block insertion", () => {
  it("keeps untouched block nodes identical and survives imperative mutations inside them", async () => {
    const first = await renderMarkdown(v1Source);
    expect(first.blocks).toBeDefined();
    const { container, rerender } = mountReader(first, "doc-a");
    const article = container.querySelector("article") as HTMLElement;
    expect(article).not.toBeNull();

    // Shape: one element per block, in order, with the reuse keys stamped.
    const elements = Array.from(article.children);
    expect(elements.length).toBe(first.blocks!.length);
    for (const el of elements) expect(el.getAttribute("data-block-key")).toBeTruthy();

    // Imperative mutations the real pipeline performs inside blocks: a search
    // highlight in block 1 (paragraph) and a marker in block 0 (heading).
    const heading = article.querySelector("h1") as HTMLElement;
    const untouchedPara = article.querySelector("p") as HTMLElement;
    const mark = document.createElement("mark");
    mark.textContent = "needle";
    untouchedPara.appendChild(mark);
    (untouchedPara as unknown as { __probe: boolean }).__probe = true;

    const second = await renderMarkdown(await editMiddle(v1Source));
    expect(second.blocks).toBeDefined();
    expect(second.blocks!.length).toBe(first.blocks!.length);
    rerender(
      <ReaderPane
        chapter={second}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );

    // The heading block and the first paragraph block were NOT touched: same
    // node objects, still holding the imperative <mark> and the expando.
    expect(article.querySelector("h1")).toBe(heading);
    const firstParaNow = article.querySelector("p") as HTMLElement;
    expect(firstParaNow).toBe(untouchedPara);
    expect(firstParaNow.querySelector("mark")).toBe(mark);
    expect((firstParaNow as unknown as { __probe?: boolean }).__probe).toBe(true);

    // The edited paragraph was replaced wholesale — new node, new content —
    // and it carries the new block key.
    const editedNow = Array.from(article.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("got edited"),
    ) as HTMLElement;
    expect(editedNow).toBeTruthy();
    const editedBefore = Array.from(elements).find((el) =>
      el.textContent?.includes("gets edited"),
    ) as HTMLElement;
    expect(editedNow).not.toBe(editedBefore);
    expect(editedBefore.isConnected).toBe(false);
    expect(editedNow.getAttribute("data-block-key")).toBeTruthy();

    // (No "DOM === html" assertion here on purpose: the <mark> above lives
    // inside a reused block — the point of the wave is that it SURVIVES, so
    // the live tree is the pristine render plus that deliberate imperative
    // edit. The pristine-shape check is in the splice test below.)
  });

  it("remounting via documentKey drops the manually appended DOM with the article", async () => {
    const chapter = await renderMarkdown(v1Source);
    const { container, rerender } = mountReader(chapter, "doc-a");
    const firstArticle = container.querySelector("article") as HTMLElement;
    expect(firstArticle.children.length).toBe(chapter.blocks!.length);

    rerender(
      <ReaderPane
        chapter={chapter}
        documentKey="doc-b"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );

    // React removed the old article element — subtree (ours) with it…
    expect(firstArticle.isConnected).toBe(false);
    // …and the fresh article is repopulated from the same cached chapter.
    const secondArticle = container.querySelector("article") as HTMLElement;
    expect(secondArticle).not.toBe(firstArticle);
    expect(secondArticle.children.length).toBe(chapter.blocks!.length);
    expect(strippedArticleHtml(secondArticle)).toBe(chapter.html);
  });

  it("chapters without blocks use today's innerHTML path unchanged", async () => {
    const chapter: RenderedChapter = {
      html: `<h1 data-source-line="1">Fallback</h1>\n<p data-source-line="2">Whole html.</p>\n`,
      headings: [],
      frontMatter: null,
      checksum: "fallback-1",
      plainText: "Fallback Whole html.",
      hasMermaid: false,
    };
    const { container, rerender } = mountReader(chapter, "doc-a");
    const article = container.querySelector("article") as HTMLElement;
    expect(article.innerHTML).toBe(chapter.html);

    // An imperative decoration inside the fallback DOM…
    const para = article.querySelector("p") as HTMLElement;
    const mark = document.createElement("mark");
    para.appendChild(mark);

    // …survives a rerender with a different chapter object carrying the SAME
    // html string (the dangerouslySetInnerHTML memo's old contract).
    rerender(
      <ReaderPane
        chapter={{ ...chapter }}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    expect(article.contains(mark)).toBe(true);

    // A different html is swapped whole, exactly like before.
    rerender(
      <ReaderPane
        chapter={{ ...chapter, html: `<h1>Replaced</h1>\n`, checksum: "fallback-2" }}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    expect(article.innerHTML).toBe(`<h1>Replaced</h1>\n`);
    expect(article.contains(mark)).toBe(false);
  });

  it("splices from blocks to blocks when the block count changes (insert/remove)", async () => {
    const short = await renderMarkdown("# A\n\nFirst paragraph.\n\nSecond paragraph.\n");
    const long = await renderMarkdown(
      "# A\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n",
    );
    const { container, rerender } = mountReader(short, "doc-a");
    const article = container.querySelector("article") as HTMLElement;
    const heading = article.querySelector("h1") as HTMLElement;
    const secondPara = article.querySelectorAll("p")[1] as HTMLElement;

    rerender(
      <ReaderPane
        chapter={long}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    expect(article.querySelectorAll("p").length).toBe(3);
    expect(article.querySelector("h1")).toBe(heading); // untouched, identity kept
    expect(article.querySelectorAll("p")[1]).toBe(secondPara);
    expect(strippedArticleHtml(article)).toBe(long.html);

    rerender(
      <ReaderPane
        chapter={short}
        documentKey="doc-a"
        containerRef={{ current: null }}
        fontScale={1}
        mermaidTheme="default"
        onMermaidError={() => {}}
        showLineNumbers
      />,
    );
    expect(article.querySelectorAll("p").length).toBe(2);
    expect(article.querySelector("h1")).toBe(heading);
    expect(strippedArticleHtml(article)).toBe(short.html);
  });
});
