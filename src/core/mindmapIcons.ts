import {
  Award,
  Bell,
  Bookmark,
  Calendar,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock,
  Code,
  Coins,
  Database,
  FileText,
  Flag,
  Flame,
  Globe,
  GraduationCap,
  Hash,
  Heart,
  Image as ImageIcon,
  Key,
  Lightbulb,
  Link,
  ListChecks,
  ListTodo,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Pin,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  User,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The icons a node can wear.
 *
 * A curated table rather than lucide's whole catalogue. `import * as icons`
 * would pull thousands of components into the bundle to offer a picker nobody
 * can search, and lucide is not a stable surface: three of its renamed aliases
 * (`CheckCircle2`, `HelpCircle`, `AlertTriangle`) are already gone in the version
 * this app builds against. Every name below was checked against the installed
 * package before the table was written, and `mindmap-icons.test.ts` keeps
 * checking, so a future bump cannot turn a missing icon into a runtime blank.
 *
 * The `id` is what goes in the companion file, so it is deliberately not the
 * component's name: the ids stay put even if the drawing behind one is swapped.
 */

/** One icon a node can wear, and what it says. */
export interface MindmapIcon {
  id: string;
  label: string;
  /**
   * One line saying when to wear it.
   *
   * Here because the type icons below are only worth having if two readers would
   * reach for the same one for the same situation. A name like "风险" is not enough
   * on its own — the sentence is what makes the row a set of decisions rather than a
   * set of pictures.
   */
  meaning?: string;
  Icon: LucideIcon;
}

/** Icons gathered by what they mean, which is how they are shown in the picker. */
export interface MindmapIconGroup {
  group: string;
  icons: MindmapIcon[];
}

/**
 * The node types: eight icons, one row, one meaning each.
 *
 * This table is what the picker offers, and it replaced a grid of thirty-four
 * pictures grouped by nothing in particular — stars beside hearts beside flags,
 * where two reasonable readers would never choose the same one for the same
 * situation, which is the whole test a marker has to pass.
 *
 * What each one is for, so the row is a decision rather than decoration:
 *
 *   - 待办 / 进行中 / 已完成 — where a piece of work stands. One node, one answer.
 *   - 疑问 / 想法 — what a node is *for* in a map that is still being thought in.
 *   - 风险 — the branch that needs watching. The one marker worth seeing from far away.
 *   - 重点 — the link in a long branch that matters most.
 *   - 参考 — this is not my own conclusion, it came from somewhere else.
 *
 * The interaction is deliberately the smallest one that can work: clicking a type
 * sets it, clicking the same type again takes it off, and a node wears at most one.
 * It is stored in the companion file like the note and the link, so the type
 * survives closing the document and never lands in the Markdown; and the in-canvas
 * search matches on the name — type 「待办」 and every node marked that way is
 * found, which is the use the feature did not have before.
 */
export const MINDMAP_NODE_TYPES: MindmapIcon[] = [
  { id: "todo", label: "待办", meaning: "这件事还没做", Icon: ListTodo },
  { id: "doing", label: "进行中", meaning: "正在做，别人不用再安排", Icon: LoaderCircle },
  { id: "done", label: "已完成", meaning: "做完了，留着做记录", Icon: CircleCheck },
  { id: "question", label: "疑问", meaning: "还没想清楚，等一个答案", Icon: CircleHelp },
  { id: "idea", label: "想法", meaning: "值得记下来，但还没定", Icon: Lightbulb },
  { id: "risk", label: "风险", meaning: "可能出问题，先盯住", Icon: TriangleAlert },
  { id: "important", label: "重点", meaning: "这一支里最要紧的一环", Icon: Star },
  { id: "reference", label: "参考", meaning: "外部资料、依据或出处", Icon: Link },
];

/**
 * What a node is wearing, in words, or an empty string.
 *
 * The one answer to "what does this id mean" — used as a node's own search term, and by
 * the panel to name the type in the row header. It resolves through the whole table
 * rather than the eight types alone: a node marked before the redesign still wears a
 * real icon, and a search that cannot find it by name would be the same forgetting the
 * old ids are kept to avoid.
 */
export function describeMindmapIcon(id: string | null | undefined): string {
  if (!id) return "";
  return ICON_BY_ID.get(id)?.label ?? "";
}

/**
 * The old picker's icons.
 *
 * Kept, and kept out of the picker, for exactly one reason: companion files in the
 * wild name these ids, and `findMindmapIcon` has to keep drawing them or a map
 * written last week opens with its icons silently gone. A node that already wears
 * one still shows it, and the panel offers to take it off; what it does not offer
 * is a second set of thirty-four pictures to choose from.
 */
export const MINDMAP_ICON_GROUPS: MindmapIconGroup[] = [
  {
    group: "重点",
    icons: [
      { id: "star", label: "星标", Icon: Star },
      { id: "flag", label: "旗标", Icon: Flag },
      { id: "bookmark", label: "书签", Icon: Bookmark },
      { id: "heart", label: "喜欢", Icon: Heart },
      { id: "pin", label: "固定", Icon: Pin },
      { id: "flame", label: "热点", Icon: Flame },
    ],
  },
  {
    group: "状态",
    icons: [
      { id: "sparkles", label: "灵光", Icon: Sparkles },
      { id: "lightbulb", label: "想法", Icon: Lightbulb },
      { id: "circle-help", label: "疑问", Icon: CircleHelp },
      { id: "circle-alert", label: "注意", Icon: CircleAlert },
      { id: "triangle-alert", label: "警告", Icon: TriangleAlert },
      { id: "list-checks", label: "清单", Icon: ListChecks },
    ],
  },
  {
    group: "时间与目标",
    icons: [
      { id: "target", label: "目标", Icon: Target },
      { id: "clock", label: "待办", Icon: Clock },
      { id: "calendar", label: "日期", Icon: Calendar },
      { id: "rocket", label: "启动", Icon: Rocket },
      { id: "zap", label: "快速", Icon: Zap },
      { id: "award", label: "成果", Icon: Award },
    ],
  },
  {
    group: "人物与来源",
    icons: [
      { id: "user", label: "个人", Icon: User },
      { id: "users", label: "团队", Icon: Users },
      { id: "message-square", label: "讨论", Icon: MessageSquare },
      { id: "bell", label: "提醒", Icon: Bell },
      { id: "graduation-cap", label: "学习", Icon: GraduationCap },
      { id: "shield-check", label: "已核实", Icon: ShieldCheck },
    ],
  },
  {
    group: "资料",
    icons: [
      { id: "file-text", label: "文档", Icon: FileText },
      { id: "link", label: "链接", Icon: Link },
      { id: "code", label: "代码", Icon: Code },
      { id: "image", label: "图片", Icon: ImageIcon },
      { id: "database", label: "数据", Icon: Database },
      { id: "globe", label: "外部", Icon: Globe },
      { id: "key", label: "关键", Icon: Key },
      { id: "coins", label: "成本", Icon: Coins },
      { id: "map-pin", label: "地点", Icon: MapPin },
      { id: "hash", label: "话题", Icon: Hash },
    ],
  },
];

/** Every icon the picker offers, in the order the row shows them. */
export const MINDMAP_ICONS: MindmapIcon[] = MINDMAP_NODE_TYPES;

/** Every icon this build can draw, the node types and the old table both. */
const ICON_BY_ID = new Map(
  [...MINDMAP_NODE_TYPES, ...MINDMAP_ICON_GROUPS.flatMap((group) => group.icons)].map((icon) => [
    icon.id,
    icon,
  ])
);

/**
 * The icon with this id, or null.
 *
 * An id this build does not know is not an error: a companion file written by a
 * newer version may name an icon that was added after this one, and the node
 * simply shows no icon until the app catches up. Throwing here would turn a
 * newer file into a map that will not open.
 */
export function findMindmapIcon(id: string | null | undefined): MindmapIcon | null {
  if (!id) return null;
  return ICON_BY_ID.get(id) ?? null;
}
