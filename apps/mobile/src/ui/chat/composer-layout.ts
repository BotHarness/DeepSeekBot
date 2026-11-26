export function composerSlots({
  model,
  slot,
  leading,
  trailing,
  stop,
}: {
  model: boolean;
  slot: number;
  leading: number;
  trailing: number;
  stop: boolean;
}) {
  if (!model) return { left: leading, right: trailing === 0 ? 0 : slot };
  return {
    left: leading + (trailing > 0 && stop ? slot : 0),
    right: slot * (1 + (trailing > 0 ? trailing : stop ? 1 : 0)),
  };
}
