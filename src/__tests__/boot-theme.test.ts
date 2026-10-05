import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_THEME,
  PREFS_KEY,
  THEME_ALIASES,
  loadPreferences,
  savePreferences,
} from "../services/storage";

/**
 * 「挂载前应用主题」引导脚本的守卫（技术债：启动闪屏）。
 *
 * 病根是**时序**，不是颜色：主题覆盖写在 `:root[data-theme=…]` 上，而写这个属性的人
 * （`useDesktopBridgeSync`）住在 lazy 加载的 App 里。在它跑起来之前 `<html>` 没有属性，
 * 级联只剩 `:root` 的浅色默认值——深色 / eink 用户每次启动闪一下白。
 * `index.html` 里那段同步内联脚本把属性提前到首帧之前。
 *
 * 代价是那段脚本**不能 import**（它要在打包之前就运行），于是存储键、遗留别名、缺省值
 * 都成了 `storage.ts` 的复制品。复制品没有编译器兜着：改一边忘另一边，症状是「又开始闪」，
 * 而没人会去怀疑两行字面量之间的关系。所以这里做三件事：
 *
 * 1. **文本绑定**：脚本里的键名 / 缺省值 / 别名对，必须与 `storage.ts` 导出的同值。
 * 2. **行为等价**：同一批存储内容，分别喂给脚本和 `loadPreferences()`，产出的主题必须
 *    逐个相同。文本比对只能证明「写着一样」，这条证明「算出来一样」。
 * 3. **成对断言（规则 5）**：把脚本的键名改掉一个字符，等价检查必须**报出差**——
 *    否则第 2 条可能是空转（比较了两边都不执行的代码路径，永远全绿）。
 */

const HTML = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

/** 取 index.html 里那段无 `type` 的内联脚本正文。 */
function extractBootstrap(html: string): string | null {
  const m = /<script>\s*([\s\S]*?)<\/script>/.exec(html);
  return m ? m[1] : null;
}

/** 在干净 document 上跑一遍脚本正文，返回它写到 <html> 上的 data-theme。 */
function runBootstrap(body: string, stored: string | null): string | null {
  // 脚本按全局写法引用 localStorage / document，用形参把它们遮蔽掉即可隔离运行；
  // 假的 document 只需要 setAttribute —— 不碰 jsdom 的真实 <html>，用例之间互不污染。
  const sink: Record<string, string> = {};
  const fakeDocument = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        sink[name] = String(value);
      },
    },
  };
  const fakeStorage = {
    getItem: (k: string) => (k === PREFS_KEY ? stored : null),
  };
  new Function("localStorage", "document", body)(fakeStorage, fakeDocument);
  return sink["data-theme"] ?? null;
}

const PAYLOADS: [string, string | null][] = [
  ["没有存储（首装）", null],
  ["空对象", "{}"],
  ["twitter", '{"theme":"twitter"}'],
  ["light", '{"theme":"light"}'],
  ["eink", '{"theme":"eink"}'],
  ["system", '{"theme":"system"}'],
  ["遗留 dark（改名前的深色项）", '{"theme":"dark"}'],
  ["原型链探针", '{"theme":"constructor"}'],
  ["空字符串", '{"theme":""}'],
  ["null", '{"theme":null}'],
  ["非字符串", '{"theme":5}'],
  ["坏 JSON", "{oops"],
];

describe("挂载前的主题引导（index.html 内联脚本）", () => {
  const BODY = extractBootstrap(HTML);

  it("脚本存在且被解析到（否则下面全是空转）", () => {
    expect(BODY, "index.html 里没有内联 <script> 正文").toBeTruthy();
    expect(BODY!, "脚本没有写 data-theme").toContain("data-theme");
    expect(HTML.indexOf(BODY!)).toBeLessThan(HTML.indexOf('type="module"'));
  });

  it("存储键、缺省值、别名与 storage.ts 同字面量", () => {
    expect(BODY!).toContain(`"${PREFS_KEY}"`);
    expect(BODY!).toContain(`"${DEFAULT_THEME}"`);
    for (const [legacy, current] of THEME_ALIASES) {
      expect(BODY!, `脚本没处理遗留取值 ${legacy}`).toContain(`"${legacy}"`);
      expect(BODY!, `脚本没把 ${legacy} 映射到 ${current}`).toContain(`"${current}"`);
    }
  });

  it("对同一批存储内容，脚本与 loadPreferences() 产出同一个主题", () => {
    const diffs: string[] = [];
    for (const [label, stored] of PAYLOADS) {
      if (stored === null) localStorage.removeItem(PREFS_KEY);
      else localStorage.setItem(PREFS_KEY, stored);
      const fromScript = runBootstrap(BODY!, stored);
      const fromService = String(loadPreferences().theme);
      if (fromScript !== fromService) {
        diffs.push(`${label}: 脚本=${fromScript} / storage.ts=${fromService}`);
      }
    }
    expect(diffs, `两边算出的主题不一致：${diffs.join(" | ")}`).toEqual([]);
  });

  it("漂移会被抓到（成对断言：改掉脚本里的键名，上一条必须报差）", () => {
    const mutated = BODY!.replace(`"${PREFS_KEY}"`, `"${PREFS_KEY}-typo"`);
    const dark = '{"theme":"twitter"}';
    expect(runBootstrap(mutated, dark)).toBe(DEFAULT_THEME);
    localStorage.setItem(PREFS_KEY, dark);
    expect(String(loadPreferences().theme)).toBe("twitter");
  });

  it("脚本不做主题解析：写进去的是存储原值", () => {
    // `"system"` 必须原样落到属性上——主窗口的跟随系统靠
    // `:root[data-theme="system"]` 里的媒体查询（tokens.css），在引导这一步解析成具体
    // 主题反而会把值冻在加载那一刻（系统主题之后变了也不会重来）。`resolveThemeMode()`
    // 负责的是胶囊那一侧，边界见规则 9。
    expect(runBootstrap(BODY!, '{"theme":"system"}')).toBe("system");
    expect(runBootstrap(BODY!, null)).toBe("system");
  });
});

describe("占位层不再引用悬空令牌", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("main.tsx 的 Suspense 占位用 --bg（app-shell 用的同一个令牌）", () => {
    const main = readFileSync(resolve(__dirname, "../main.tsx"), "utf8");
    expect(main).toContain("var(--bg)");
    // `--bg-primary` 从未被定义。这里只拦**引用**（`var(--bg-primary`），注释里写出它的
    // 名字是为了说明这段历史；悬空引用的集合检查归 css-custom-properties.test.ts 管。
    expect(main).not.toMatch(/var\(\s*--bg-primary/);
    const css = readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8");
    expect(/--bg\s*:/.test(css), "--bg 必须有定义，否则占位又变成恒定色").toBe(true);
  });

  it("首装时偏好为缺省主题（脚本的 system 与 App 的初值一致）", () => {
    expect(loadPreferences().theme).toBe(DEFAULT_THEME);
    savePreferences({ ...loadPreferences(), theme: "eink" });
    expect(loadPreferences().theme).toBe("eink");
  });
});
