export type SpeakerRowLayout = { height?: number; bubbleTop?: number };

export function groupSpan(
  keys: readonly string[],
  layouts: ReadonlyMap<string, SpeakerRowLayout>,
): number {
  const first = keys[0];
  if (first === undefined) return 0;
  let above = 0;
  for (const key of keys.slice(0, -1)) above += layouts.get(key)?.height ?? 0;
  return above - (layouts.get(first)?.bubbleTop ?? 0);
}

export function speakerLift({
  bubbleBottom,
  floor,
  rest,
  span,
}: {
  bubbleBottom: number;
  floor: number;
  rest: number;
  span: number;
}): number {
  'worklet';
  return Math.min(Math.max(0, bubbleBottom - floor), Math.max(0, rest + span));
}
