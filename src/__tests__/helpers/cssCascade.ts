/**
 * CSS 选择器判定原语（跨守卫共用，**不要写第二遍**——规则 1）。
 *
 * 这些函数原来长在 `flash-capsule-theme-contrast.test.ts` 里，是那条守卫踩了三次坑之后
 * 收敛出来的版本：漏掉 `:root[data-theme="light"]` 这种前缀写法、漏掉伪类剥离
 * （`.theme-light .x` 能盖住 `.x:hover`）、漏掉特异度比较（`.theme-light .x` 盖不住
 * `.graph-zoom-group .x:hover`）。**同一套判定复制两份，迟早只有一份被修**。
 *
 * 提取时一条断言都没改：那条守卫自带「解析器本身也要防错」的一组锚点（见该文件的
 * 引擎自检用例），它们继续证明这里的实现是对的。
 */

/** 最后一个复合选择器里的类名（`.a.b .c` → c 的部分）。 */
export function classesOf(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1]));
}

/** 最后一个复合选择器里的属性选择器（`[data-theme="light"]`、`[aria-selected]`）。 */
export function attrsOf(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/\[[^\]]*\]/g)].map((m) => m[0]));
}

/** 伪类与伪元素（`:hover`、`::placeholder`）。它们决定一条规则能否命中某元素。 */
export function pseudoParts(selector: string): Set<string> {
  const last = selector.split(" ").pop() ?? "";
  return new Set([...last.matchAll(/::?[\w-]+/g)].map((m) => m[0]));
}

/** 选择器里出现的主题限定值（`.theme-eink` / `[data-theme="light"]` → "eink"/"light"）。 */
export function themeQualifiers(selector: string): string[] {
  return [...selector.matchAll(/\.theme-([\w-]+)|\[data-theme="([\w-]+)"\]/g)].map(
    (m) => m[1] ?? m[2],
  );
}

/**
 * 特异度。**必须数整条选择器**。
 *
 * 只数最后一个复合选择器会把 `.theme-eink` 那部分权重丢掉，于是
 * `.theme-eink .flash-tab-btn`(0,3,0) 被误判为输给 `.flash-tab-btn:hover`(0,2,0)——
 * 引擎会报出一个不存在的失败。伪元素不计入特异度，伪类计入。
 */
export function specificity(selector: string): number {
  const s = selector.replace(/::[\w-()]+/g, "");
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+/g) ?? []).length;
  const attrs = (s.match(/\[[^\]]*\]/g) ?? []).length;
  const pseudoClasses = (s.match(/:[\w-]+/g) ?? []).length;
  return ids * 1000 + (classes + attrs + pseudoClasses) * 10;
}

/**
 * 规则选择器 `ruleSelector` 能否命中「由 `elementSelector` 描述的那个元素」。
 *
 * 判断依据是复合选择器的包含关系：`.flash-mini-btn` 能命中 `.flash-mini-btn:hover`
 * （这正是 hover 态只改背景、颜色继承基础规则的原因），反过来不行。
 * 伪类必须被满足：`.flash-mini-btn:hover` 命中不了 `.flash-mini-btn`。
 */
export function matchesElement(ruleSelector: string, elementSelector: string): boolean {
  for (const c of classesOf(ruleSelector)) if (!classesOf(elementSelector).has(c)) return false;
  for (const a of attrsOf(ruleSelector)) if (!attrsOf(elementSelector).has(a)) return false;
  for (const p of pseudoParts(ruleSelector)) if (!pseudoParts(elementSelector).has(p)) return false;
  return true;
}
