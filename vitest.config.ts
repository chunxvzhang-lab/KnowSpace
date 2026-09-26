import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * The same version define vite.config.ts applies.
 *
 * It has to be repeated here because the test run does not go through the Vite
 * config, and any component reading __APP_VERSION__ would otherwise throw a
 * ReferenceError under vitest. Kept identical in both places on purpose: a test
 * that renders the About dialog should see the version the build would show.
 */
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/__tests__/setup.ts"],
    pool: "forks",
    forks: {
      singleFork: true,
    },
    /**
     * 默认的 5s 对本套件不够，而且它产生的失败现象和真实回归分不出来：vitest 把超时报告成
     * `STACK_TRACE_ERROR`，于是一台忙的机器看起来像坏掉的代码。
     *
     * 实测（空闲机器、已绕开沙箱的 fs 拦截层）：`mindmap-marks-ui` 里一次面板交互就要 ~3.6s
     * ——重量级 jsdom 渲染 + 假定时器 + 真的往伴生文件写盘。机器一忙，同一条用例就跨过 5s。
     * 有一次全量跑挂了 7 个文件，全是超时，而每一个单文件跑都通过。
     *
     * 超时该用来抓"卡死"，不是抓"机器慢"。所以预算按"远高于最慢的合法用例"来设，而不是刚好压线。
     * 调这个值之前请先量一遍最慢的用例（`npx vitest run <file>` 看单条耗时）。
     */
    testTimeout: 15000,
    /**
     * `hookTimeout` 是同一个问题的另一半，只是之前漏了 —— 它一直是默认的 10s。
     *
     * 这个套件里有若干用例在 `beforeEach` / `afterEach` 里真的读写磁盘（`markdown-files`
     * 建临时目录、写几十个文件、再递归删掉），而 `singleFork: true` 让所有文件共用一个进程：
     * 前一个文件留下的 GC 压力会落到后一个文件的 hook 上。实测 `markdown-files` 单跑约 7s、
     * 每个 hook 平均不到 100ms，但在全量跑的负载下同一个 hook 会跨过 10s —— 于是单文件绿、
     * 全量红，且失败点报在 `afterEach` 上，看起来像"清理代码坏了"。
     *
     * 与 `testTimeout` 取同一个值：两者都该抓卡死，而不是抓机器慢。
     */
    hookTimeout: 15000,
  },
});
