export type ComposerSession = 'none' | 'stacked' | 'compact';

export function composerRows({
  session,
  expanded,
  stackedByContent,
}: {
  session: ComposerSession;
  expanded: boolean;
  stackedByContent: boolean;
}) {
  const sessionRow = session === 'stacked' || (session === 'compact' && expanded);
  const stacked = sessionRow || stackedByContent;
  return { sessionRow, stacked, sessionCompact: session === 'compact' && !stacked };
}

export function composerSlots({
  session,
  slot,
  leading,
  trailing,
  stop,
}: {
  session: ComposerSession;
  slot: number;
  leading: number;
  trailing: number;
  stop: boolean;
}) {
  if (session !== 'compact')
    return { left: leading, right: trailing === 0 ? 0 : slot, measured: session === 'none' };
  return {
    left: leading + (trailing > 0 && stop ? slot : 0),
    right: slot * (1 + (trailing > 0 ? trailing : stop ? 1 : 0)),
    measured: true,
  };
}
