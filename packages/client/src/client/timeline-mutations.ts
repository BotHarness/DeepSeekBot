const TIMELINE = '.bh-chat-body';

export function outsideTimeline(records: readonly MutationRecord[]): boolean {
  for (const record of records) {
    const target = record.target;
    const element = target.nodeType === 1 ? (target as Element) : target.parentElement;
    if (element === null || element.closest(TIMELINE) === null) return true;
  }
  return false;
}
