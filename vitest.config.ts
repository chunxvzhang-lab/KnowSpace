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
  },
});
