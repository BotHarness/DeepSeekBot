type Axis = 'vertical' | 'horizontal';

export function accessibilityAction(
  action: string,
  onScroll: (axis: Axis, step: number) => Promise<boolean>,
): void {
  if (action === 'increment' || action === 'decrement')
    onScroll('vertical', action === 'increment' ? 1 : -1);
}
