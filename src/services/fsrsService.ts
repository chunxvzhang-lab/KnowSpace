/**
 * FSRS (Free Spaced Repetition Scheduler) service.
 *
 * Implements the DSR model — Difficulty / Stability / Retrievability — together
 * with the three flashcard syntaxes KnowSpace recognises and the on-disk
 * progress metadata. Everything here is pure and synchronous: no DOM, no
 * network, no storage access, which is what keeps scheduling in the sub-50ms
 * range the release plan requires and makes the whole module unit-testable.
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
  params = FSRS_DEFAULT_PARAMS
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
  params = FSRS_DEFAULT_PARAMS
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
  params = FSRS_DEFAULT_PARAMS
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
  maximumInterval = FSRS_MAX_INTERVAL_DAYS
): number {
  const retention = clamp(requestRetention, 0.7, 0.98);
  const raw = (stability / FSRS_FACTOR) * (Math.pow(retention, 1 / FSRS_DECAY) - 1);
  return Math.max(1, Math.min(maximumInterval, Math.round(raw)));
}

/** Current recall probability of a card. */
export function currentRetrievability(lastReview: string, stability: number, now = new Date()): number {
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
  options: FsrsOptions = {}
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
        params
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

// ─────────────────────────────────────────────────────────────────────────────
// Syntax parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fenced code blocks are skipped wholesale: a note teaching FSRS syntax would
 * otherwise turn every example into a real card, and code samples containing
 * `::` or `{{c1::…}}` are common.
 *
 * Computed once for the whole note rather than asked per line. The obvious
 * shape — "is line *i* inside a fence?" answered by walking the lines above it —
 * is O(n) per call and O(n²) per note, and it was called for every line by all
 * three extractors: a 2000-line note cost roughly six million fence checks
 * before a single card was looked for. That is the whole reason a vault-sized
 * review froze the window. One pass over the lines answers every query at once.
 *
 * `mask[i]` is the fence state *before* line `i` is read, which is exactly what
 * the per-line walk used to return: a fence marker line is not itself "inside" a
 * fence, and everything between the opening and closing markers is.
 */
function computeFenceMask(lines: string[]): Uint8Array {
  const mask = new Uint8Array(lines.length);
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    mask[i] = fence !== null ? 1 : 0;
    const match = /^\s*(```+|~~~+)/.exec(lines[i]);
    if (!match) continue;
    if (fence === null) fence = match[1][0];
    else if (match[1][0] === fence) fence = null;
  }
  return mask;
}

/** Blocks that must never contribute cards. */
function isInsideMetadata(line: string): boolean {
  return /<!--\s*fsrs/i.test(line);
}

/** Strips markdown emphasis/links so card text reads cleanly in the review UI. */
function cleanCardText(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*>\s?/, "")
    .trim();
}

/**
 * Stable card id.
 *
 * Derived from the kind and the prompt text rather than from the position, so
 * reordering a note — or inserting a card above — does not detach a card from
 * its scheduling history. Only genuine edits to the question reset progress,
 * which is the behaviour a reviewer expects.
 */
export function computeCardId(kind: FsrsCardKind, front: string): string {
  const input = `${kind}\u0000${front.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fsrs-${(hash >>> 0).toString(36)}`;
}

/** `Q: … / A: …` question-answer pairs, with continuation lines on the answer. */
function extractQaPairs(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (fence[i] || isInsideMetadata(lines[i])) continue;

    const question = /^\s*Q[:：]\s*(.+)$/.exec(lines[i]);
    if (!question) continue;

    const front = cleanCardText(question[1]);
    if (!front) continue;

    // The answer may continue over several lines until the next Q:/A: or a
    // blank line followed by another block.
    const answerParts: string[] = [];
    let j = i + 1;
    let started = false;

    for (; j < lines.length; j += 1) {
      const line = lines[j];
      const answerStart = /^\s*A[:：]\s*(.*)$/.exec(line);

      if (answerStart) {
        answerParts.push(answerStart[1]);
        started = true;
        continue;
      }
      if (/^\s*Q[:：]/.test(line)) break;
      if (fence[j]) break;
      if (!started && !line.trim()) continue;
      if (started && !line.trim()) break;
      // Indented or plain continuation lines belong to the answer
      if (started) answerParts.push(line.replace(/^\s{2,}/, ""));
      else break;
    }

    const back = cleanCardText(answerParts.join("\n"));
    if (!back) continue;

    cards.push({ id: computeCardId("qa", front), kind: "qa", front, back, line: i + 1 });
    i = j - 1;
  }

  return cards;
}

/** Inline `front :: back` cards, one per line. */
function extractInlineCards(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence[i] || isInsideMetadata(line)) continue;
    // A QA block body must not be re-read as an inline card
    if (/^\s*[QA][:：]/.test(line)) continue;
    // A cloze carries its own `::` inside `{{c1::…}}` (and a hint after a second
    // `::`), so it would otherwise be captured as an inline card too — the same
    // line producing two cards. `==highlight==` clozes are excluded as well.
    if (/\{\{c\d+::/.test(line) || /==[^=]+==/.test(line)) continue;

    const body = line.replace(/^\s*[-*+]\s+/, "").trim();
    const separator = body.indexOf("::");
    if (separator <= 0) continue;
    // `:::` or more is a directive, not a delimiter
    if (body[separator + 2] === ":") continue;

    const front = cleanCardText(body.slice(0, separator));
    const back = cleanCardText(body.slice(separator + 2));
    if (!front || !back) continue;

    cards.push({ id: computeCardId("inline", front), kind: "inline", front, back, line: i + 1 });
  }

  return cards;
}

/** `{{c1::answer}}` and `==highlight==` clozes. */
function extractClozeCards(lines: string[], fence: Uint8Array): FsrsCard[] {
  const cards: FsrsCard[] = [];
  const clozeRe = /\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g;
  const highlightRe = /==([^=]+)==/g;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fence[i] || isInsideMetadata(line)) continue;

    const blanks: string[] = [];
    let matched = false;
    let text = line;

    text = text.replace(clozeRe, (_m, answer: string) => {
      matched = true;
      blanks.push(answer.trim());
      return "[...]";
    });
    // `==highlight==` behaves as a cloze with a single blank
    text = text.replace(highlightRe, (_m, answer: string) => {
      matched = true;
      blanks.push(answer.trim());
      return "[...]";
    });
    if (!matched || blanks.length === 0) continue;

    const front = cleanCardText(text);
    if (!front) continue;

    cards.push({
      id: computeCardId("cloze", front),
      kind: "cloze",
      front,
      back: blanks.join(" / "),
      line: i + 1,
      blanks,
    });
  }

  return cards;
}

/**
 * Extracts every flashcard from a note, in source order.
 *
 * Recognised syntaxes:
 *
 * | Syntax                        | Kind     |
 * | :---------------------------- | :------- |
 * | `Q: …` / `A: …`               | `qa`     |
 * | `front :: back`               | `inline` |
 * | `{{c1::answer}}`, `==answer==`| `cloze`  |
 *
 * Fenced code blocks and existing `<!-- fsrs … -->` metadata are ignored.
 */
export function parseFlashcards(markdown: string): FsrsCard[] {
  if (!markdown || typeof markdown !== "string") return [];

  const lines = markdown.split(/\r?\n/);
  // One pass for all three extractors, rather than each of them asking per line.
  const fence = computeFenceMask(lines);
  const found = [
    ...extractQaPairs(lines, fence),
    ...extractInlineCards(lines, fence),
    ...extractClozeCards(lines, fence),
  ];

  // QA pairs claim whole blocks, so an inline card can only appear on a line the
  // QA parser skipped. Deduplicate by id and restore reading order.
  const seen = new Map<string, FsrsCard>();
  for (const card of found) {
    if (!seen.has(card.id)) seen.set(card.id, card);
  }
  return [...seen.values()].sort((a, b) => a.line - b.line);
}

/** Convenience wrapper: how many cards does this note contain? */
export function countFlashcards(markdown: string): number {
  return parseFlashcards(markdown).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress metadata persistence
// ─────────────────────────────────────────────────────────────────────────────

const BLOCK_BEGIN = "<!-- fsrs:begin";
const BLOCK_END = "fsrs:end -->";

const STATE_CODES: Record<FsrsState, string> = {
  new: "new",
  learning: "learning",
  review: "review",
  relearning: "relearning",
};

/** Serialises one card's progress onto a single line. */
function formatLine(id: string, progress: FsrsProgress): string {
  const parts = [
    id,
    `S=${progress.stability.toFixed(4)}`,
    `D=${progress.difficulty.toFixed(4)}`,
    `due=${progress.due}`,
    `reps=${progress.reps}`,
    `lapses=${progress.lapses}`,
    `state=${STATE_CODES[progress.state] ?? "review"}`,
  ];
  if (progress.last) parts.push(`last=${progress.last}`);
  return parts.join(" ");
}

/** Parses one metadata line back into progress. Returns null when malformed. */
function parseLine(line: string): { id: string; progress: FsrsProgress } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("<!--")) return null;

  const tokens = trimmed.split(/\s+/);
  const id = tokens.shift();
  if (!id) return null;

  const fields: Record<string, string> = {};
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq > 0) fields[token.slice(0, eq)] = token.slice(eq + 1);
  }

  const due = fields.due;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due ?? "")) return null;

  const state = fields.state as FsrsState;

  return {
    id,
    progress: {
      stability: Number(fields.S ?? 0) || 0,
      difficulty: Number(fields.D ?? 0) || 0,
      due,
      reps: Number(fields.reps ?? 0) || 0,
      lapses: Number(fields.lapses ?? 0) || 0,
      state: STATE_CODES[state] ? state : "review",
      last: /^\d{4}-\d{2}-\d{2}$/.test(fields.last ?? "") ? fields.last : undefined,
    },
  };
}

/**
 * Reads every card's progress out of a note.
 *
 * Only `<!-- fsrs … -->` comments are consulted, so the result is identical
 * whether or not a third-party editor has touched the file. Older single-line
 * comments (`<!-- fsrs: S=… D=… due=… -->`) are accepted too and matched
 * positionally, which keeps notes written by early builds working.
 */
export function parseFsrsMetadata(
  markdown: string,
  /**
   * The note's cards, when the caller has already parsed them.
   *
   * Only the legacy single-line metadata form needs them — it carries no card id
   * and is matched to cards by order. Passing them in keeps `parseNote` from
   * parsing every note twice, which for a vault-sized source was half the work
   * of the scan.
   */
  parsedCards?: FsrsCard[]
): Map<string, FsrsProgress> {
  const result = new Map<string, FsrsProgress>();
  if (!markdown) return result;

  const lines = markdown.split(/\r?\n/);
  const orphanProgress: FsrsProgress[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock && line.includes(BLOCK_BEGIN)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.includes(BLOCK_END)) {
        inBlock = false;
        continue;
      }
      const parsed = parseLine(line);
      if (parsed) result.set(parsed.id, parsed.progress);
      continue;
    }

    // Legacy single-line form: <!-- fsrs: S=1.2 D=3.4 due=2026-09-22 -->
    const single = /<!--\s*fsrs[:\s]([^>]*?)-->/i.exec(line);
    if (single && !single[1].includes("begin")) {
      // This form carries no card id, so it is parsed purely by field name —
      // running it through parseLine() would treat the leading `S=1.2` as the
      // id and silently drop the stability. Values are matched to cards by
      // order further down, which keeps notes written by early builds readable.
      const fields: Record<string, string> = {};
      for (const token of single[1].replace(/:/g, " ").split(/\s+/)) {
        const eq = token.indexOf("=");
        if (eq > 0) fields[token.slice(0, eq)] = token.slice(eq + 1);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(fields.due ?? "")) {
        const state = fields.state as FsrsState;
        orphanProgress.push({
          stability: Number(fields.S ?? 0) || 0,
          difficulty: Number(fields.D ?? 0) || 0,
          due: fields.due,
          reps: Number(fields.reps ?? 0) || 0,
          lapses: Number(fields.lapses ?? 0) || 0,
          state: STATE_CODES[state] ? state : "review",
          last: /^\d{4}-\d{2}-\d{2}$/.test(fields.last ?? "") ? fields.last : undefined,
        });
      }
    }
  }

  // Attach legacy values to the parsed cards in order.
  if (orphanProgress.length > 0) {
    const cards = parsedCards ?? parseFlashcards(markdown);
    cards.forEach((card, index) => {
      if (index < orphanProgress.length && !result.has(card.id)) {
        result.set(card.id, orphanProgress[index]);
      }
    });
  }

  return result;
}

/** Builds the metadata block body for the given progress map. */
export function serializeFsrsMetadata(
  markdown: string,
  progress: Map<string, FsrsProgress>,
  /** The note's cards, when the caller has already parsed them. */
  parsedCards?: FsrsCard[]
): string {
  // An empty map is not "nothing to say" — it is "nothing to keep", and what the
  // document still holds belongs to cards that are no longer in the map, so it goes.
  // The shortcut that used to be here (`if (progress.size === 0) return markdown`)
  // read the other way round, and undoing a rating is what found it out: taking back
  // the only rating a note had left the row behind, because the map that would have
  // removed it was empty.

  // Only keep entries that still correspond to a card in the note, so deleted cards
  // do not accumulate forever.
  //
  // The check is unconditional, and the first version of it was not: it read
  // `liveIds.size > 0 && !liveIds.has(id)`, which skipped the filter entirely once a
  // note had no cards left — so deleting the last card and then rating anything wrote
  // every row back, leaving a file that claims scheduling history for cards that are
  // not in it. With no cards the block is empty, and an empty block is removed below,
  // which is what that guard was reaching for in the first place.
  const liveIds = new Set((parsedCards ?? parseFlashcards(markdown)).map((c) => c.id));
  const lines: string[] = [];
  for (const [id, value] of progress) {
    if (!liveIds.has(id)) continue;
    lines.push(formatLine(id, value));
  }
  if (lines.length === 0) return stripFsrsMetadata(markdown);

  const block = [BLOCK_BEGIN, ...lines, BLOCK_END].join("\n");
  const stripped = stripFsrsMetadata(markdown).replace(/\s+$/, "");
  return `${stripped}\n\n${block}\n`;
}

/** Removes any fsrs metadata from a note, leaving the body untouched. */
export function stripFsrsMetadata(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (!inBlock && line.includes(BLOCK_BEGIN)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      if (line.includes(BLOCK_END)) inBlock = false;
      continue;
    }
    if (/<!--\s*fsrs[:\s](?!begin)/i.test(line)) continue;
    kept.push(line);
  }

  // Trailing blank lines go too, so a note that has had its last rating taken back
  // reads exactly like a note that was never rated — the block was appended after a
  // blank line, and leaving that blank line behind is a mark of its own.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

/** Merges updated progress into a note, replacing any previous metadata. */
export function upsertFsrsMetadata(
  markdown: string,
  updates: Map<string, FsrsProgress>
): string {
  // Parsed once for both halves. Each used to parse the note itself, so rating a
  // single card walked the whole note twice to write one line.
  const cards = parseFlashcards(markdown);
  const merged = parseFsrsMetadata(markdown, cards);
  for (const [id, value] of updates) merged.set(id, value);
  return serializeFsrsMetadata(markdown, merged, cards);
}

// ─────────────────────────────────────────────────────────────────────────────
// Review queue helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A card paired with its current progress, ready for review. */
export interface FsrsQueueItem {
  card: FsrsCard;
  progress: FsrsProgress;
  /** Retrievability right now, for sorting the queue. */
  retrievability: number;
}

/**
 * One note, parsed once.
 *
 * Parsing is the expensive part of a review session — a real vault is tens of
 * megabytes and every line of every document has to be looked at — so it happens
 * once per note and the result is carried around. `buildReviewQueue` and
 * `summarize` take notes rather than parsed notes, and each of them parses
 * everything again: calling the three of them over the same vault used to read it
 * three times over, on the render thread, which is where a large vault froze the
 * window.
 */
export interface ParsedNote {
  path: string;
  content: string;
  cards: FsrsCard[];
  progress: Map<string, FsrsProgress>;
}

/**
 * A source of cards, parsed once.
 *
 * `owner` is the duplicate rule written down: a card's identity is its content, so
 * the same question in two notes is one card, and the first note to carry it is
 * the one whose progress and text win. Both the queue and the counters read this,
 * so they cannot disagree about which note a card belongs to.
 */
export interface ParsedReviewSource {
  notes: ParsedNote[];
  owner: Map<string, ParsedNote>;
}

export function emptyParsedSource(): ParsedReviewSource {
  return { notes: [], owner: new Map() };
}

export function parseNote(note: { path: string; content: string }): ParsedNote {
  // Parsed once and shared with the metadata reader. Both used to call
  // parseFlashcards themselves — and the metadata reader could call it a second
  // time on top of that for legacy notes — so a single note was walked three
  // times over before a card was shown.
  const cards = parseFlashcards(note.content);
  return {
    path: note.path,
    content: note.content,
    cards,
    progress: parseFsrsMetadata(note.content, cards),
  };
}

/**
 * Files one parsed note into a source under construction.
 *
 * Meant to be called once per note while a source is being built — in the panel
 * that happens a few notes at a time, between frames, so that a big vault makes
 * the progress line move rather than the window stop answering.
 */
export function addParsedNote(source: ParsedReviewSource, note: ParsedNote): void {
  source.notes.push(note);
  for (const card of note.cards) {
    if (!source.owner.has(card.id)) source.owner.set(card.id, note);
  }
}

/**
 * Parses a set of notes in one go.
 *
 * The convenience path, for callers that hold every note already and do not need
 * to show progress — tests, mostly. Anything that reads a vault the reader is
 * waiting on should build the source in pieces instead.
 */
export function parseReviewSource(notes: Array<{ path: string; content: string }>): ParsedReviewSource {
  const source = emptyParsedSource();
  for (const note of notes) addParsedNote(source, parseNote(note));
  return source;
}

/**
 * Today's review queue, from a source that has already been parsed.
 *
 * Cards are ordered by retrievability ascending — the ones most likely to be
 * forgotten come first — with never-seen cards placed ahead of everything else
 * so new material is never starved by a backlog.
 */
export function buildQueueFromParsed(source: ParsedReviewSource, now = new Date()): FsrsQueueItem[] {
  const today = toDateKey(now);
  const items: FsrsQueueItem[] = [];
  const seen = new Set<string>();

  for (const note of source.notes) {
    for (const card of note.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      const entry = note.progress.get(card.id) ?? createNewProgress(today);
      if (entry.due > today) continue;
      items.push({
        card,
        progress: entry,
        retrievability:
          entry.state === "new" || !entry.last
            ? 0
            : currentRetrievability(entry.last, entry.stability, now),
      });
    }
  }

  return items.sort((a, b) => {
    const aNew = a.progress.state === "new" ? 0 : 1;
    const bNew = b.progress.state === "new" ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return a.retrievability - b.retrievability;
  });
}

/**
 * Builds today's review queue from a set of notes.
 *
 * Cards are ordered by retrievability ascending — the ones most likely to be
 * forgotten come first — with never-seen cards placed ahead of everything else
 * so new material is never starved by a backlog.
 *
 * A card's identity is its content (`computeCardId`), so the same question written
 * into two notes is **one card**: the first note that carries it supplies the
 * progress, and the duplicate is not queued again. It was queued twice before, and
 * the panel — which skips a card id it has already rated — could only ever show the
 * first of the two, so the header promised a card the session could not deliver.
 */
export function buildReviewQueue(
  notes: Array<{ path: string; content: string }>,
  now = new Date()
): FsrsQueueItem[] {
  return buildQueueFromParsed(parseReviewSource(notes), now);
}

/** Aggregate counters for the review panel header. */
export interface FsrsStats {
  total: number;
  due: number;
  fresh: number;
  learning: number;
  review: number;
  /** Cards reviewed at least once, i.e. with a non-zero stability. */
  tracked: number;
}

/**
 * Dashboard counters, from a source that has already been parsed.
 *
 * Counts cards, not occurrences: the same question in two notes is one card, the
 * same way the queue lists it once. Counting it twice made the header disagree with
 * the session — "共 2 张" above a caption that could only ever reach "1 / 1".
 */
export function summarizeParsed(source: ParsedReviewSource, now = new Date()): FsrsStats {
  const stats: FsrsStats = { total: 0, due: 0, fresh: 0, learning: 0, review: 0, tracked: 0 };
  const seen = new Set<string>();

  for (const note of source.notes) {
    for (const card of note.cards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);

      stats.total += 1;
      const entry = note.progress.get(card.id);
      if (!entry) {
        stats.fresh += 1;
        stats.due += 1;
        continue;
      }
      if (entry.stability > 0) stats.tracked += 1;
      if (entry.due <= toDateKey(now)) stats.due += 1;
      if (entry.state === "learning" || entry.state === "relearning") stats.learning += 1;
      else if (entry.state === "review") stats.review += 1;
    }
  }

  return stats;
}

/**
 * Summarises a set of notes for the review dashboard.
 *
 * Parses everything it is given, so a caller that is about to build a queue as
 * well should parse once and use the two `…FromParsed` functions instead.
 */
export function summarize(notes: Array<{ path: string; content: string }>, now = new Date()): FsrsStats {
  return summarizeParsed(parseReviewSource(notes), now);
}
