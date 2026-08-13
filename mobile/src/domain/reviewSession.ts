export function canApplyReviewResult(resultSession: number, activeSession: number) {
  return resultSession === activeSession;
}
