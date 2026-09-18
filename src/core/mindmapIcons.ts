import {
  Award,
  Bell,
  Bookmark,
  Calendar,
  CircleAlert,
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
  Icon: LucideIcon;
}

/** Icons gathered by what they mean, which is how they are shown in the picker. */
export interface MindmapIconGroup {
  group: string;
  icons: MindmapIcon[];
}

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

/** Every icon, in the order the groups are shown. */
export const MINDMAP_ICONS: MindmapIcon[] = MINDMAP_ICON_GROUPS.flatMap((group) => group.icons);

const ICON_BY_ID = new Map(MINDMAP_ICONS.map((icon) => [icon.id, icon]));

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
