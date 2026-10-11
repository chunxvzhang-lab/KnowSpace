/**
 * Clean-window verdict for the perf capture (pure function, unit-tested).
 *
 * Why this exists: a perf capture on a busy machine does not fail - it succeeds
 * with WORSE numbers, and capture mode writes them straight over the committed
 * baseline. That is a silent loosening of the ratchet, and it already happened:
 * b816c06's message records the author throwing a capture away by eye ("typing
 * 182ms says the window was dirty"), and on 2026-10-11 two consecutive captures
 * on a loaded machine disagreed with each other by more than the gap to the
 * committed baseline (dropped frames 25 vs 52 against a baseline of 13).
 *
 * The tell is not one number being high - it is the SAMPLES of one scenario
 * disagreeing. A clean window produces a tight cluster; a dirty one produces
 * spread. So the verdict is computed from the spread of each scenario's own
 * samples, which needs no committed baseline and no magic absolute threshold.
 *
 * Kept free of fs/process/playwright so the decision can be tested directly,
 * the same split electron/shell-new-plan.cjs uses for its registry commands.
 */

/**
 * Relative allowance above which a timing's samples are called unstable, plus
 * the absolute allowance that replaces it for COUNTS.
 *
 * Why two kinds: a ratio cannot judge a count that legitimately sits at 0 or 1.
 * Dropped frames going 0 → 1 on a clean machine is normal, and judging it
 * relatively makes the allowance infinite — every quiet capture would read
 * "dirty". Counts therefore get the same absolute allowance `checkAgainst`
 * already uses (its `committed + 25` floor exists for exactly this reason),
 * and timings get the ratio.
 *
 * The distinction is by metric KIND, not by the observed value: an earlier
 * version switched on "min < 20", which mis-classified a p95 of 16.9ms as a
 * count and gave a millisecond metric a 25-unit allowance.
 *
 * PROVISIONAL, and honest about why: until now the harness recorded only the
 * min of N samples, so no within-capture spread was ever written down. The
 * 2026-10-11 evidence is ACROSS captures (dropped frames 25 vs 52, p95 36.5 vs
 * 48.4, tab-switch long task 76 vs 130ms, typing 0 vs 59ms) — it proves the
 * window was loaded, but it does not directly calibrate a within-capture
 * threshold. 0.35 is a judgment call between "a few percent" (the clean
 * 2026-09-30 capture) and the observed cross-capture spread; the samples are
 * now recorded, so the next real capture replaces this guess with data.
 *
 * Deliberately loose in one direction: a false "unstable" costs one re-run,
 * while a false "clean" writes bad numbers into the committed baseline.
 *
 * KNOWN BLIND SPOT (pinned by test): a ~33% spread on a timing is NOT caught at
 * 0.35 — the p95 disagreement above sat just under the line. The tolerance is a
 * parameter for exactly this reason; tighten it once real within-capture data
 * exists.
 */
const DEFAULT_TOLERANCE = 0.35;

/** Absolute allowance for count metrics — same 25 `checkAgainst` uses. */
const ABSOLUTE_ALLOWANCE = 25;

/**
 * Metrics whose sample spread is judged, keyed by METRIC (not by scenario).
 *
 * Keyed by metric on purpose: two metrics can come out of one scenario with
 * different units (scroll reports both p95 milliseconds and a dropped-frame
 * count), and an earlier version keyed them by scenario — which made the
 * dropped-frames line print milliseconds under a frame-count label. The values
 * were real, the label was a lie; that is the failure mode this repo machine-
 * checks for, so the mapping is one key to one array of that key's samples.
 *
 * `kind` decides the allowance: counts get an absolute one (a ratio cannot
 * judge 0 → 1), timings get the relative one.
 */
const SPREAD_CHECKS = [
  { scenario: "typing", key: "typing_max_longtask_ms", kind: "timing" },
  { scenario: "scroll", key: "scroll_p95_frame_ms", kind: "timing" },
  { scenario: "scroll", key: "scroll_dropped_frames", kind: "count" },
  { scenario: "mermaid", key: "mermaid_firstpaint_ms", kind: "timing" },
  { scenario: "tabs", key: "tab_switch_max_longtask_ms", kind: "timing" },
];

/**
 * Judge whether a capture's samples look like a clean measurement window.
 *
 * @param {Record<string, number[]>} samplesByMetric
 *   Metric key -> the values of its N measured samples (warm-up excluded).
 *   Fewer than 2 usable samples for a metric is skipped: spread is not
 *   observable, and inventing a verdict there would be a guess.
 * @param {number} [tolerance] Relative allowance for timing metrics.
 * @returns {{clean: boolean, checks: Array<{scenario: string, metric: string,
 *   kind: string, min: number, max: number, spread: number, limit: number,
 *   unstable: boolean}>}}
 */
function judgeWindow(samplesByMetric, tolerance = DEFAULT_TOLERANCE) {
  const checks = [];
  for (const { scenario, key, kind } of SPREAD_CHECKS) {
    const samples = (samplesByMetric || {})[key];
    if (!Array.isArray(samples) || samples.length < 2) continue;
    const values = samples.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (values.length < 2) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    // Spread is measured against the best (lowest) sample: these metrics are all
    // "lower is better", and the committed value is the min, so the question is
    // how far the other samples sit above the one that would be committed.
    const spread = min === 0 ? (max === 0 ? 0 : Infinity) : (max - min) / min;
    // Counts are judged absolutely (see ABSOLUTE_ALLOWANCE); timings relatively.
    const unstable = kind === "count" ? max - min > ABSOLUTE_ALLOWANCE : spread > tolerance;
    checks.push({
      scenario,
      metric: key,
      kind,
      min,
      max,
      spread,
      limit: kind === "count" ? ABSOLUTE_ALLOWANCE : tolerance,
      unstable,
    });
  }
  return { clean: checks.every((c) => !c.unstable), checks };
}

/** Human-readable lines for the capture log. */
function describeVerdict(verdict) {
  if (!verdict.checks.length) {
    return ["[perf] clean-window check: not enough samples to judge (skipped)"];
  }
  const lines = verdict.checks.map((c) => {
    // Counts get an absolute allowance, so a percentage would mislead there.
    const allowance =
      c.kind === "count"
        ? `±${c.limit} absolute`
        : `spread ${(c.spread * 100).toFixed(0)}%, limit ${(c.limit * 100).toFixed(0)}%`;
    return (
      `[perf]   ${c.scenario}/${c.metric}: ${c.min} .. ${c.max} ` +
      `(${allowance}) ${c.unstable ? "UNSTABLE" : "ok"}`
    );
  });
  lines.unshift(
    verdict.clean
      ? "[perf] clean-window check: PASS - samples agree, the window looks quiet"
      : "[perf] clean-window check: FAIL - samples disagree, the window is loaded",
  );
  return lines;
}

module.exports = {
  judgeWindow,
  describeVerdict,
  SPREAD_CHECKS,
  DEFAULT_TOLERANCE,
  ABSOLUTE_ALLOWANCE,
};
