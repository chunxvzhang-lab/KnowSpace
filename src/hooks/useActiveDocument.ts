import { useMemo } from "react";
import type { BookManifest, DocumentSession, RenderedChapter } from "../core/types";
import { tabsWithDirtyFlags, type TabMeta } from "../store/useTabStore";

/**
 * 当前打开文档的**派生视图**：活动标签、标签栏要渲染的数组、活动章节、活动标题、
 * 章节序号，以及「这份文档能不能进评审」的快照。它们全部由同几个输入算出来，没有
 * 任何自己的状态。
 *
 * 为什么这一组待在一起（R1 批次 B10-A 从 `App.tsx` 整段搬出）：它们都是
 * 「tabs + chapterId + manifest + session + renderedChapter + activeHeadingId」的纯函数，
 * 互相之间还有依赖（`activeChapter` 用 `activeTab`），散在装配组件里时每次读都要在
 * 761→…行的文件里跳一遍；搬进来之后 App 只剩一行调用与一次解构。
 *
 * 两条不能丢的既有理由（注释跟着代码走）：
 *  · 脏标记是**算**出来的，不是存在 tab 数组里的——在已保存的文档里敲字只会让
 *    `tabsForDisplay` 变，不动 tab 数组、不动 effect、也不会多出第二次渲染来收尾
 *    标签栏（这就是当初把镜像 effect 删掉的原因）；
 *  · `reviewableDocument` 刻意只依赖 `session` 的三个字段而不是整个 `session`：
 *    敲一次字换一个对象身份，评审面板就会跟着抖。`dirty` 之所以要跟着走，是因为
 *    评审在文档有未保存改动时**拒绝**这个来源——见 DailyReviewPanel，那里写着为什么
 *    那是条规则而不是警告。
 *
 * 依赖数组与搬出前逐字一致；本文件不在 eslint 的 exhaustive-deps 遗留豁免名单里
 * （名单只覆盖 `src/App.tsx` 等四个待拆文件），所以这些数组是被规则检查过的。
 */
export function useActiveDocument({
  tabs,
  chapterId,
  isDirty,
  session,
  manifest,
  renderedChapter,
  activeHeadingId,
}: {
  tabs: TabMeta[];
  chapterId: string;
  isDirty: boolean;
  session: DocumentSession | null;
  manifest: BookManifest | null;
  renderedChapter: RenderedChapter | null;
  activeHeadingId: string | undefined;
}) {
  const activeTab = useMemo(() => tabs.find((item) => item.id === chapterId), [tabs, chapterId]);

  const tabsForDisplay = useMemo(
    () => tabsWithDirtyFlags(tabs, chapterId, isDirty),
    [tabs, chapterId, isDirty],
  );

  const reviewableDocument = useMemo(() => {
    const absolutePath = session?.absolutePath;
    const fileName = session?.fileName;
    if (!absolutePath || !fileName) return null;
    const lower = fileName.toLowerCase();
    if (!lower.endsWith(".md") && !lower.endsWith(".markdown")) return null;
    return { filePath: absolutePath, content: session?.source ?? "", dirty: isDirty };
  }, [session?.absolutePath, session?.fileName, session?.source, isDirty]);

  const activeChapter = useMemo(() => {
    const fromManifest = manifest?.chapters.find((item) => item.id === chapterId);
    if (fromManifest) return fromManifest;
    if (activeTab) {
      return {
        id: activeTab.id,
        title: activeTab.title,
        src: activeTab.relativePath || activeTab.title,
        absolutePath: activeTab.absolutePath,
      };
    }
    return undefined;
  }, [manifest?.chapters, chapterId, activeTab]);

  const activeHeading = renderedChapter?.headings.find((heading) => heading.id === activeHeadingId);
  const activeIndex = manifest?.chapters.findIndex((item) => item.id === chapterId) ?? -1;

  // `activeTab` is deliberately **not** returned: it only exists to feed the
  // fallback branch of `activeChapter` below, and App proved no use for it once
  // that lookup moved here. Returning it would invite a consumer to lean on a
  // value nothing asked for.
  return { tabsForDisplay, reviewableDocument, activeChapter, activeHeading, activeIndex };
}
