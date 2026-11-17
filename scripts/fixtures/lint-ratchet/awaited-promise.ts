type Axis = 'vertical' | 'horizontal';

export async function accessibilityAction(
  action: string,
  onScroll: (axis: Axis, step: number) => Promise<boolean>,
): Promise<void> {
  if (action === 'increment' || action === 'decrement')
    await onScroll('vertical', action === 'increment' ? 1 : -1);
}
