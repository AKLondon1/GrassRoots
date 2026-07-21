export interface PollRecommendationOption {
  readonly id: string;
  readonly startsAt: string;
  readonly availableRespondents: number;
  readonly pitchCapacity: number;
}

export function recommendPollOption(options: readonly PollRecommendationOption[]) {
  return [...options]
    .sort((left, right) => {
      const leftFeasible = left.pitchCapacity >= left.availableRespondents ? 1 : 0;
      const rightFeasible = right.pitchCapacity >= right.availableRespondents ? 1 : 0;
      return (
        rightFeasible - leftFeasible ||
        right.availableRespondents - left.availableRespondents ||
        right.pitchCapacity - left.pitchCapacity ||
        left.startsAt.localeCompare(right.startsAt) ||
        left.id.localeCompare(right.id)
      );
    })[0];
}
