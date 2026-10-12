import type { ChannelComposerActivity } from './channel-composer.js';
import { personaBotPresentationSummary, type PersonaBotFacepileItem } from './avatar.js';
import { attentionCount } from './activity-attention.js';
import type { BotHarnessTranslate } from './locale.js';

export function groupComposerActivity(
  members: readonly PersonaBotFacepileItem[],
  t: BotHarnessTranslate,
): ChannelComposerActivity | undefined {
  const active = (item: PersonaBotFacepileItem) =>
    item.state === 'thinking' || item.state === 'working';
  const items = members
    .filter(
      (item) =>
        (item.state !== undefined && item.state !== 'idle') || attentionCount(item.attention) > 0,
    )
    .sort(
      (left, right) =>
        Number(active(right)) - Number(active(left)) ||
        (left.personaBotId < right.personaBotId
          ? -1
          : left.personaBotId > right.personaBotId
            ? 1
            : 0),
    );
  if (items.length === 0) return undefined;
  const summary = items
    .slice(0, 2)
    .map((item) => {
      const labelActivity =
        item.activity === undefined
          ? undefined
          : {
              effect: item.activity.effect,
              toolKind: item.activity.toolKind,
              startedAt: item.activity.startedAt,
              activeToolCount: item.activity.activeToolCount,
            };
      return (
        item.name +
        ' ' +
        personaBotPresentationSummary(item.state ?? 'idle', labelActivity, item.attention, t)
      );
    })
    .join(' / ');
  return {
    presentation: 'group',
    items,
    summary:
      items.length > 2
        ? summary + ' · ' + t('main.activity.more', { count: items.length - 2 })
        : summary,
  };
}
