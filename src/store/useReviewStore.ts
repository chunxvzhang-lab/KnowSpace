import { create } from "zustand";

/**
 * The review domain's cross-component signal.
 *
 * "Start a review" is requested from the command bus and honoured by the Space
 * panel, which lives behind its own sidebar tab. The request travels as a
 * changing number the panel watches rather than as a flag it might already be
 * showing — opening a review while the panel is on another tab must still open
 * it, which a boolean cannot express.
 */
type ReviewStore = {
  reviewRequest: number;
  requestReview: () => void;
};

export const useReviewStore = create<ReviewStore>()((set) => ({
  reviewRequest: 0,
  requestReview: () => set((s) => ({ reviewRequest: s.reviewRequest + 1 })),
}));
