import { describe, expect, it } from "vitest";

// 与 shell-new-plan.test.ts 同一模式：scripts/*.cjs 无类型声明，require 加载
// 并在本地手写形状——判定逻辑是纯函数，边界因此可以逐条钉住。
// @ts-ignore: perf-window.cjs is CommonJS without type declarations
const perfWindow = require("../../scripts/perf-window.cjs") as {
  judgeWindow: (
    samples: Record<string, number[]>,
    tolerance?: number,
  ) => {
    clean: boolean;
    checks: Array<{
      scenario: string;
      metric: string;
      kind: string;
      min: number;
      max: number;
      spread: number;
      limit: number;
      unstable: boolean;
    }>;
  };
  describeVerdict: (v: { clean: boolean; checks: unknown[] }) => string[];
  compareToCommitted: (
    committed: Record<string, number>,
    fresh: Record<string, number>,
    metrics: Array<{ key: string; kind: string }>,
  ) => string[];
  DEFAULT_TOLERANCE: number;
  ABSOLUTE_ALLOWANCE: number;
};

const { judgeWindow, describeVerdict, compareToCommitted, DEFAULT_TOLERANCE } = perfWindow;

/**
 * 这个判定的存在理由：忙机器上的性能捕获**不会失败**，它会成功地把更差的
 * 数字写进基线——那是无声放宽棘轮。2026-10-11 连着两次捕获就发生了：同一台
 * 机器两次结果互相矛盾（掉帧 25 vs 52，而基线是 13），全靠人肉眼看才发现。
 *
 * 判据不是"某个数字高"，而是**同一个场景自己的几次采样是否一致**：干净窗口
 * 的采样聚得很紧，脏窗口散得很开。所以下面每组都成对——散的要拦、聚的要放。
 */

/** 干净窗口：采样互相咬得很紧（2026-09-30 那次真实捕获的量级）。 */
const CLEAN_SAMPLES = {
  typing_max_longtask_ms: [0, 0, 0],
  scroll_p95_frame_ms: [16.8, 17.1, 16.9],
  scroll_dropped_frames: [0, 0, 1],
  mermaid_firstpaint_ms: [120.4, 123.1, 121.0],
  tab_switch_max_longtask_ms: [58.0, 61.0, 59.0],
};

describe("judgeWindow", () => {
  it("放行聚得很紧的窗口（干净机器）", () => {
    const verdict = judgeWindow(CLEAN_SAMPLES);
    expect(verdict.clean).toBe(true);
    expect(verdict.checks.every((c) => !c.unstable)).toBe(true);
  });

  it("拦住明显散开的窗口——脏窗口的典型形态（采样翻倍级差异）", () => {
    const verdict = judgeWindow({
      ...CLEAN_SAMPLES,
      scroll_p95_frame_ms: [16.9, 36.5, 41.0],
    });
    expect(verdict.clean).toBe(false);
    const scrollCheck = verdict.checks.find((c) => c.metric === "scroll_p95_frame_ms");
    expect(scrollCheck?.unstable).toBe(true);
    expect(scrollCheck!.spread).toBeGreaterThan(DEFAULT_TOLERANCE);
  });

  it("已知盲区：33% 的散度在默认阈值下**拦不住**（这是刻意的，不是漏网）", () => {
    // 2026-10-11 那次跨捕获的 p95 差异是 36.5 vs 48.4（约 33%），恰在 0.35 线下。
    // 默认阈值是临时判断（此前从未记录过捕获内散度，样本从本版起才开始留），
    // 所以这里**如实钉住盲区**而不是把阈值调到刚好过关：要么等真实数据收紧，
    // 要么调用方显式传更严的容忍度。
    const loose = judgeWindow({ ...CLEAN_SAMPLES, scroll_p95_frame_ms: [36.5, 48.4, 41.0] });
    expect(loose.clean).toBe(true); // ← 默认阈值放行
    const strict = judgeWindow({ ...CLEAN_SAMPLES, scroll_p95_frame_ms: [36.5, 48.4, 41.0] }, 0.2);
    expect(strict.clean).toBe(false); // ← 收紧后拦住
  });

  it("拦住只有最差采样拖后腿的窗口（一次运行被打断的形态）", () => {
    const verdict = judgeWindow({
      ...CLEAN_SAMPLES,
      tab_switch_max_longtask_ms: [59.0, 61.0, 130.0],
    });
    expect(verdict.clean).toBe(false);
    expect(verdict.checks.find((c) => c.metric === "tab_switch_max_longtask_ms")?.unstable).toBe(
      true,
    );
  });

  it("同一场景的两个指标各读各的采样——毫秒与帧数不会串（2026-10-11 真实踩到）", () => {
    // 现场 bug：按「场景」取采样时，掉帧那一行打印出 37 .. 69.29 —— 那是 p95 的
    // 毫秒值，却挂在「帧数」标签下。数值是真的，标签是假的。改成按指标取之后，
    // 两个指标必须能从各自的采样里读出各自的结论。
    const verdict = judgeWindow({
      ...CLEAN_SAMPLES,
      scroll_p95_frame_ms: [37, 69.3, 41], // 散
      scroll_dropped_frames: [25, 26, 25], // 聚
    });
    const p95 = verdict.checks.find((c) => c.metric === "scroll_p95_frame_ms");
    const drops = verdict.checks.find((c) => c.metric === "scroll_dropped_frames");
    expect(p95?.unstable).toBe(true);
    expect(drops?.unstable).toBe(false);
    // 帧数那一行的上下界必须是帧数（个位/十位），不是毫秒
    expect(drops!.max).toBeLessThan(100);
    expect(p95!.max).toBeGreaterThan(60);
  });

  it("采样不足两个时跳过，不猜", () => {
    const verdict = judgeWindow({ typing_max_longtask_ms: [0], scroll_p95_frame_ms: [] });
    expect(verdict.clean).toBe(true); // 没有可判的项 → 不因此拦
    expect(verdict.checks.length).toBe(0);
  });

  it("容忍度可传参，边界行为与阈值一致", () => {
    const samples = { scroll_p95_frame_ms: [100, 130] }; // 30% 散度
    expect(judgeWindow(samples, 0.5).clean).toBe(true);
    expect(judgeWindow(samples, 0.2).clean).toBe(false);
  });

  it("零值场景不会因为除零而误判为不稳定", () => {
    // 打字长任务在干净机器上是 0ms（基线就是 0），全 0 必须读作"稳"。
    const verdict = judgeWindow({ typing_max_longtask_ms: [0, 0, 0] });
    expect(verdict.clean).toBe(true);
    expect(verdict.checks.find((c) => c.metric === "typing_max_longtask_ms")?.spread).toBe(0);
  });

  it("计数指标用绝对容差：干净机器上掉帧 0 → 1 是正常的，不算脏窗口", () => {
    // 用比例判 0 → 1 会算出无穷大，于是**每一次**安静捕获都被判脏。
    // 计数走绝对值（与 checkAgainst 的 +25 兜底同一约定）。
    const verdict = judgeWindow({ scroll_dropped_frames: [0, 1, 0] });
    expect(verdict.clean).toBe(true);
    const check = verdict.checks.find((c) => c.metric === "scroll_dropped_frames");
    expect(check?.kind).toBe("count");
    expect(check?.limit).toBe(25);
  });

  it("计数指标仍然拦得住真脏窗口：掉帧 25 → 52 超出绝对容差", () => {
    // 2026-10-11 实际观测到的两次捕获差异，正是这个判定要拦的东西。
    const verdict = judgeWindow({ scroll_dropped_frames: [25, 52, 30] });
    expect(verdict.clean).toBe(false);
    expect(verdict.checks.find((c) => c.metric === "scroll_dropped_frames")?.unstable).toBe(true);
  });

  it("计时指标不会被误当成计数：p95 = 16.9ms 仍走相对容差", () => {
    // 现场 bug：曾用「最小值 < 20」来切换容差种类，于是 16.9ms 的 p95 被
    // 当成计数、拿到了 25 个单位的绝对容差。判据必须是**指标种类**，不是数值大小。
    const verdict = judgeWindow({ scroll_p95_frame_ms: [16.9, 60.0, 17.0] });
    const check = verdict.checks.find((c) => c.metric === "scroll_p95_frame_ms");
    expect(check?.kind).toBe("timing");
    expect(check?.limit).toBe(DEFAULT_TOLERANCE);
    expect(check?.unstable).toBe(true);
  });

  it("从 0 变成非 0 是真实的散度，必须拦住", () => {
    // 基线是 0 的指标一旦出现非零采样，说明窗口里有东西在跑。
    const verdict = judgeWindow({ typing_max_longtask_ms: [0, 0, 80] });
    expect(verdict.clean).toBe(false);
  });
});

describe("describeVerdict", () => {
  it("干净窗口的日志说 PASS，并逐条报出每个指标的散度", () => {
    const lines = describeVerdict(judgeWindow(CLEAN_SAMPLES));
    expect(lines[0]).toContain("PASS");
    expect(lines.some((l) => l.includes("scroll_p95_frame_ms"))).toBe(true);
  });

  it("脏窗口的日志说 FAIL，并把不稳定的那条标出来", () => {
    const lines = describeVerdict(
      judgeWindow({ ...CLEAN_SAMPLES, tab_switch_max_longtask_ms: [59, 61, 130] }),
    );
    expect(lines[0]).toContain("FAIL");
    expect(
      lines.some((l) => l.includes("tab_switch_max_longtask_ms") && l.includes("UNSTABLE")),
    ).toBe(true);
  });

  it("没有可判项时如实说跳过，不假装 PASS", () => {
    const lines = describeVerdict(judgeWindow({}));
    expect(lines.join("\n")).toContain("skipped");
  });
});

/**
 * 第二个检查：**整体都慢**的窗口。
 *
 * 散度判据只挡「抖动的窗口」——采样互相矛盾。它挡不住「整台机器一致地慢」，
 * 而那正是这台机器的常态。2026-10-11 的 A/B 实验里真出现了：另一次检出在
 * 构建时，某次捕获打印 `clean-window check: PASS`，而打字长任务是 69ms、
 * 已提交基线是 0ms —— 若那次跑在主仓库，它会把 69 写进基线。
 *
 * 所以写入路径上还有第二道：新数字比已提交基线差出容差范围就拒绝写。
 */
const METRIC_SHAPE = [
  { key: "typing_max_longtask_ms", kind: "timing" },
  { key: "longdoc_dom_nodes", kind: "exact" },
];

describe("compareToCommitted", () => {
  it("一致的数字不报问题（放行）", () => {
    const problems = compareToCommitted(
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      METRIC_SHAPE,
    );
    expect(problems).toEqual([]);
  });

  it("整体变慢的窗口被拦住——这正是散度判据放行、而基线会被写坏的那一档", () => {
    // 现场实测：散度 PASS，但打字 69ms 对基线 0ms（容差 0+25=25）。
    const problems = compareToCommitted(
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      { typing_max_longtask_ms: 69, longdoc_dom_nodes: 191 },
      METRIC_SHAPE,
    );
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("typing_max_longtask_ms");
  });

  it("容差之内的小幅波动不算回归（否则安静机器也会被误拦）", () => {
    // 0 → 24 在 +25 的绝对容差内。
    const problems = compareToCommitted(
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      { typing_max_longtask_ms: 24, longdoc_dom_nodes: 191 },
      METRIC_SHAPE,
    );
    expect(problems).toEqual([]);
  });

  it("大数值走 ×1.5 相对容差", () => {
    const committed = { typing_max_longtask_ms: 100, longdoc_dom_nodes: 191 };
    const within = compareToCommitted(
      committed,
      { typing_max_longtask_ms: 140, longdoc_dom_nodes: 191 },
      METRIC_SHAPE,
    );
    expect(within).toEqual([]); // 140 < 150
    const over = compareToCommitted(
      committed,
      { typing_max_longtask_ms: 160, longdoc_dom_nodes: 191 },
      METRIC_SHAPE,
    );
    expect(over.length).toBe(1);
  });

  it("确定性计数必须逐字相等，差 1 就报", () => {
    const problems = compareToCommitted(
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 192 },
      METRIC_SHAPE,
    );
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("exact count changed 191 -> 192");
  });

  it("数字缺失时报出来，不当成 0 放行", () => {
    const problems = compareToCommitted(
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: 191 },
      { typing_max_longtask_ms: 0, longdoc_dom_nodes: undefined as unknown as number },
      METRIC_SHAPE,
    );
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("non-numeric");
  });
});
