/**
 * The DSR model — Difficulty / Stability / Retrievability — and the `review`
 * step that applies one rating. Part of the FSRS service; the flashcard
 * syntaxes are parsed in `./fsrsCards`, the on-disk progress metadata in
 * `./fsrsMetadata` and the review-queue helpers in `./fsrsQueue`, all
 * re-exported by `./fsrsService`.
 *
 * Everything here is pure and synchronous: no DOM, no network, no storage
 * access, which is what keeps scheduling in the sub-50ms range the release
 * plan requires and makes the whole module unit-testable.
 *
 * Algorithm reference: FSRS-5 as published by the open-spaced-repetition
 * project. The default parameters below are that project's default weights.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FSRS-5 default weights (19 values). Index order matters — the formulas below
 * refer to them by position, so this array must not be reordered.
 */
export const FSRS_DEFAULT_PARAMS: readonly number[] = [
  0.40255, // w0  initial stability, Again
  1.18385, // w1  initial stability, Hard
  3.173, // w2  initial stability, Good
  15.69105, // w3  initial stability, Easy
  7.1949, // w4  initial difficulty baseline
  0.5345, // w5  initial difficulty sensitivity
  1.4604, // w6  difficulty change rate
  0.0046, // w7  difficulty mean reversion
  1.54575, // w8  stability growth base
  0.1192, // w9  stability decay exponent
  1.01925, // w10 retrievability sensitivity on success
  1.9395, // w11 stability after lapse base
  0.11, // w12 stability after lapse difficulty exponent
  0.29605, // w13 stability after lapse growth
  2.2698, // w14 retrievability sensitivity on lapse
  0.2315, // w15 hard penalty multiplier
  2.9898, // w16 easy bonus multiplier
  0.51655, // w17 same-day review stability (short-term)
  0.6621, // w18 same-day review offset (short-term)
];

/** Decay exponent of the forgetting curve. Fixed by FSRS so that R(S,S) = 0.9. */
export const FSRS_DECAY = -0.5;

/** Curve scale factor, derived from {@link FSRS_DECAY} so R(S, S) equals 0.9. */
export const FSRS_FACTOR = 19 / 81;

/** Hard bounds on difficulty. */
export const FSRS_MIN_DIFFICULTY = 1;
export const FSRS_MAX_DIFFICULTY = 10;

/** Below this elapsed time a review counts as a same-day (short-term) review. */
const SAME_DAY_THRESHOLD_DAYS = 1;

/** Interval ceiling: 100 years, matching Anki's practical limit. */
export const FSRS_MAX_INTERVAL_DAYS = 36500;

/** Default target retention. */
export const FSRS_DEFAULT_RETENTION = 0.9;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
export type FsrsRating = 1 | 2 | 3 | 4;

/** Where a card sits in the scheduling lifecycle. */
export type FsrsState = "new" | "learning" | "review" | "relearning";

/** How a card was written in the note. */
export type FsrsCardKind = "qa" | "inline" | "cloze";

/** Persisted scheduling state for one card. */
export interface FsrsProgress {
  /** Stability in days — the interval at which retention falls to 90%. */
  stability: number;
  /** Difficulty, 1 (easiest) to 10 (hardest). */
  difficulty: number;
  /** Next due date, `YYYY-MM-DD`. */
  due: string;
  /** Total number of reviews. */
  reps: number;
  /** Number of times the card was forgotten. */
  lapses: number;
  /** Lifecycle state. */
  state: FsrsState;
  /** Last review date, `YYYY-MM-DD`. Absent for a never-reviewed card. */
  last?: string;
}

/** A flashcard extracted from a markdown note. */
export interface FsrsCard {
  /** Stable identifier derived from kind + front text, so progress survives edits. */
  id: string;
  kind: FsrsCardKind;
  /** Prompt side. For clozes this is the sentence with the answer blanked. */
  front: string;
  /** Answer side. Empty for clozes, which reveal inline instead. */
  back: string;
  /** 1-based line number in the source note. */
  line: number;
  /** For clozes: the hidden answers in order. */
  blanks?: string[];
}

/** Result of scheduling one review. */
export interface FsrsReviewResult {
  progress: FsrsProgress;
  /** Days until the next review. */
  intervalDays: number;
  /** Retrievability the algorithm assumed at review time (0-1). */
  retrievability: number;
  /** Stability before this review, for UI feedback. */
  previousStability: number;
  /** Stability after this review. */
  nextStability: number;
}

/** Options accepted by the scheduler. */
export interface FsrsOptions {
  /** Target retention, 0.7-0.98. Defaults to 0.9. */
  requestRetention?: number;
  /** Maximum interval in days. Defaults to {@link FSRS_MAX_INTERVAL_DAYS}. */
  maximumInterval?: number;
  /** Weight vector override; kept for tests and future parameter fitting. */
  parameters?: readonly number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Algorithm core
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Probability of recalling a card `elapsedDays` after its last review, given a
 * stability of `stability` days.
 *
 * R(t, S) = (1 + FACTOR · t / S) ^ DECAY
 *
 * The constants are chosen so R(S, S) = 0.9 exactly, which is the definition of
 * stability in FSRS.
 */
export function forgettingCurve(elapsedDays: number, stability: number): number {
  if (!(stability > 0)) return 1;
  if (!(elapsedDays > 0)) return 1;
  const value = Math.pow(1 + (FSRS_FACTOR * elapsedDays) / stability, FSRS_DECAY);
  return clamp(value, 0, 1);
}

/** Stability a brand-new card receives for its first rating. */
export function initialStability(rating: FsrsRating, params = FSRS_DEFAULT_PARAMS): number {
  return params[rating - 1];
}

/** Difficulty a brand-new card receives for its first rating. */
export function initialDifficulty(rating: FsrsRating, params = FSRS_DEFAULT_PARAMS): number {
  const raw = params[4] - Math.exp(params[5] * (rating - 1)) + 1;
  return clamp(raw, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
}

/**
 * Difficulty after a review.
 *
 * D' = D + ΔD · (10 - D) / 9, where ΔD = -w6 · (G - 3)
 * D'' = w7 · D0(4) + (1 - w7) · D'
 *
 * The second line nudges difficulty back towards the "Easy" starting value
 * (mean reversion) so a card that is repeatedly rated Hard does not drift to 10
 * and stay there forever.
 */
export function nextDifficulty(
  difficulty: number,
  rating: FsrsRating,
  params = FSRS_DEFAULT_PARAMS,
): number {
  const delta = -params[6] * (rating - 3);
  const damped = difficulty + (delta * (FSRS_MAX_DIFFICULTY - difficulty)) / 9;
  const reverted = params[7] * initialDifficulty(4, params) + (1 - params[7]) * damped;
  return clamp(reverted, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
}

/**
 * Stability after a successful review (rating 2-4).
 *
 * S' = S · (1 + e^w8 · (11 - D) · S^-w9 · (e^(w10 · (1 - R)) - 1) · hardPenalty · easyBonus)
 *
 * Growth is multiplicative: a card that is already well known gains more per
 * review, while the `(1 - R)` term scales the gain by how much was forgotten.
 */
export function nextStabilityOnSuccess(
  stability: number,
  difficulty: number,
  retrievability: number,
  rating: FsrsRating,
  params = FSRS_DEFAULT_PARAMS,
): number {
  const hardPenalty = rating === 2 ? params[15] : 1;
  const easyBonus = rating === 4 ? params[16] : 1;

  const growth =
    Math.exp(params[8]) *
    (11 - difficulty) *
    Math.pow(stability, -params[9]) *
    (Math.exp(params[10] * (1 - retrievability)) - 1) *
    hardPenalty *
    easyBonus;

  const next = stability * (1 + growth);
  return Math.max(0.01, next);
}

/**
 * Stability after forgetting (rating 1 = Again).
 *
 * S' = w11 · D^-w12 · ((S + 1)^w13 - 1) · e^(w14 · (1 - R))
 *
 * The result is capped at the previous stability: forgetting can never make a
 * card more memorable than it already was.
 */
export function nextStabilityOnLapse(
  stability: number,
  difficulty: number,
  retrievability: number,
  params = FSRS_DEFAULT_PARAMS,
): number {
  const next =
    params[11] *
    Math.pow(difficulty, -params[12]) *
    (Math.pow(stability + 1, params[13]) - 1) *
    Math.exp(params[14] * (1 - retrievability));

  return clamp(next, 0.01, Math.max(0.01, stability));
}

/**
 * Interval (in whole days) that reaches the requested retention.
 *
 * I(r) = S / FACTOR · (r^(1/DECAY) - 1)
 *
 * With r = 0.9 this returns exactly S, which is why stability doubles as the
 * "interval at 90% retention".
 */
export function nextInterval(
  stability: number,
  requestRetention = FSRS_DEFAULT_RETENTION,
  maximumInterval = FSRS_MAX_INTERVAL_DAYS,
): number {
  const retention = clamp(requestRetention, 0.7, 0.98);
  const raw = (stability / FSRS_FACTOR) * (Math.pow(retention, 1 / FSRS_DECAY) - 1);
  return Math.max(1, Math.min(maximumInterval, Math.round(raw)));
}

/** Current recall probability of a card. */
export function currentRetrievability(
  lastReview: string,
  stability: number,
  now = new Date(),
): number {
  const elapsed = daysBetween(lastReview, toDateKey(now));
  return forgettingCurve(elapsed, stability);
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Formats a date as `YYYY-MM-DD` in local time. */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses `YYYY-MM-DD` into a local-midnight Date. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Whole days between two `YYYY-MM-DD` keys. Computed on local midnights so that
 * daylight-saving shifts cannot produce 0.96 or 1.04 day results.
 */
export function daysBetween(from: string, to: string): number {
  const a = fromDateKey(from).getTime();
  const b = fromDateKey(to).getTime();
  return Math.round((b - a) / 86400000);
}

/** Adds whole days to a `YYYY-MM-DD` key. */
export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────

/** A fresh, never-reviewed card. */
export function createNewProgress(due: string): FsrsProgress {
  return {
    stability: 0,
    difficulty: 0,
    due,
    reps: 0,
    lapses: 0,
    state: "new",
  };
}

/** True when `progress` is due on or before `now`. */
export function isDue(progress: FsrsProgress | undefined, now = new Date()): boolean {
  if (!progress) return false;
  return progress.due <= toDateKey(now);
}

/**
 * Applies one review rating and returns the updated progress.
 *
 * `now` is injectable so tests are deterministic; every date produced here is
 * derived from it rather than from the wall clock.
 */
export function review(
  card: FsrsCard,
  progress: FsrsProgress,
  rating: FsrsRating,
  now = new Date(),
  options: FsrsOptions = {},
): FsrsReviewResult {
  const params = options.parameters ?? FSRS_DEFAULT_PARAMS;
  const today = toDateKey(now);
  const isFirstReview = progress.reps === 0 || progress.state === "new";

  let stability: number;
  let difficulty: number;
  let retrievability = 1;
  const previousStability = progress.stability;

  if (isFirstReview) {
    // A brand-new card has no history: FSRS uses dedicated initial values.
    stability = initialStability(rating, params);
    difficulty = initialDifficulty(rating, params);
  } else {
    const elapsed = progress.last ? daysBetween(progress.last, today) : 0;
    retrievability = forgettingCurve(Math.max(elapsed, 0), progress.stability);

    if (rating === 1) {
      // Forgotten. FSRS-5 treats a same-day lapse with the short-term weights.
      stability =
        elapsed < SAME_DAY_THRESHOLD_DAYS
          ? params[17]
          : nextStabilityOnLapse(progress.stability, progress.difficulty, retrievability, params);
      difficulty = nextDifficulty(progress.difficulty, rating, params);
    } else {
      stability = nextStabilityOnSuccess(
        progress.stability,
        progress.difficulty,
        retrievability,
        rating,
        params,
      );
      difficulty = nextDifficulty(progress.difficulty, rating, params);
    }
  }

  const intervalDays = nextInterval(stability, options.requestRetention, options.maximumInterval);
  const lapsed = rating === 1;

  // This build schedules by whole days, so there is no learning phase to be in: a
  // card is `new` until its first rating and in `review` from then on, and a
  // forgotten one is `relearning` until its next successful day.
  //
  // The branch that used to be here tested `intervalDays < 1`, which `nextInterval`
  // cannot return — dead code, under a comment describing a learning phase the app
  // does not have. `learning` is still *read*: another build may have written it
  // into a file, and such a card graduates on its next successful review like any
  // other. It is no longer claimed to be producible from a rating, because it is not.
  const state: FsrsState = lapsed ? "relearning" : "review";

  return {
    progress: {
      stability,
      difficulty,
      due: addDays(today, intervalDays),
      reps: progress.reps + 1,
      lapses: progress.lapses + (lapsed ? 1 : 0),
      state,
      last: today,
    },
    intervalDays,
    retrievability,
    previousStability,
    nextStability: stability,
  };
}
