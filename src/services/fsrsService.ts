/*
 * The FSRS scheduler is not here. The DSR model — Difficulty / Stability /
 * Retrievability — together with the constants, the shared types and the
 * `review` step lives in `./fsrsScheduler`; the three flashcard syntaxes
 * KnowSpace recognises are parsed in `./fsrsCards`; the on-disk
 * `<!-- fsrs:… -->` progress metadata is coded and decoded in `./fsrsMetadata`;
 * and the review-queue/dashboard helpers live in `./fsrsQueue`.
 *
 * This file is the single import surface for the FSRS services: everything is
 * re-exported here so importers keep one entry point.
 *
 * Everything across these modules is pure and synchronous: no DOM, no network,
 * no storage access, which is what keeps scheduling in the sub-50ms range the
 * release plan requires and makes the whole service unit-testable. Algorithm
 * reference: FSRS-5 as published by the open-spaced-repetition project.
 */

export * from "./fsrsScheduler";
export * from "./fsrsCards";
export * from "./fsrsMetadata";
export * from "./fsrsQueue";
