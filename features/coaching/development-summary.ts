export interface DevelopmentReview {
  id: string;
  playerId: string;
  privateObservation: string;
  parentSummary: string;
  status: "draft" | "approved";
  approvedBy?: string;
  approvedAt?: string;
}

export function approveParentSummary(review: DevelopmentReview, approval: { approvedBy: string; approvedAt: string }): DevelopmentReview {
  if (!review.parentSummary.trim()) throw new Error("Write a parent summary before approval.");
  if (!approval.approvedBy.trim() || Number.isNaN(Date.parse(approval.approvedAt))) throw new Error("Approval identity and timestamp are required.");
  return { ...review, status: "approved", approvedBy: approval.approvedBy, approvedAt: approval.approvedAt };
}

export function getParentVisibleSummary(review: DevelopmentReview) {
  if (review.status !== "approved" || !review.approvedAt) return null;
  return { playerId: review.playerId, summary: review.parentSummary, approvedAt: review.approvedAt };
}
