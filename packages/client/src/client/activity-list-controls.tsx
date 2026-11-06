import { Menu } from './appearance-primitives.js';
import { useState, type ReactElement } from 'react';
import { Button, IconRightUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary, HumanAttentionItem } from './store.js';
import { HUMAN_INBOX_SNOOZE_CHOICES, activityListSnoozeUntil } from './activity-list-snooze.js';

export function ActivityListSourceButton({
  item,
  bots,
  channels,
  t,
  onClick,
  localIdentity = true,
}: {
  item: HumanAttentionItem;
  bots: readonly Pick<
    BotSummary,
    'slug' | 'displayName' | 'avatar' | 'appearance' | 'avatarSeed'
  >[];
  channels: readonly Pick<ChannelSummary, 'id' | 'type' | 'name' | 'avatar'>[];
  t: BotHarnessTranslate;
  onClick: () => void;
  localIdentity?: boolean;
}): ReactElement {
  const channel = channels.find((value) => value.id === item.channelId);
  const bot = bots.find((value) => value.slug === item.botSlug);
  const name = channel?.type === 'group' ? channel.name : (bot?.displayName ?? item.botSlug);
  const sourceName = item.channelName ?? name;
  const label =
    t(
      item.kind === 'bot-message-needs-repair' && (!item.channelName || !item.messageId)
        ? 'activityList.openBotInbox'
        : item.category === 'handled' && item.assignmentSessionId !== undefined
          ? 'activityList.handled.session'
          : 'activityList.open',
    ) +
    ' · ' +
    sourceName;
  return (
    <Tooltip label={label} portal side="top">
      <button
        type="button"
        className="bh-activity-list-source-link"
        aria-label={label}
        onClick={onClick}
      >
        {channel?.type === 'group' ? (
          <span className="bh-activity-list-channel-avatar" aria-hidden="true">
            {channel.avatar === undefined ? '#' : <img src={channel.avatar} alt="" />}
          </span>
        ) : (
          <PersonaBotAvatar
            preview={!localIdentity}
            personaBotId={item.botSlug}
            name={name}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            size={24}
            indicator={false}
            t={t}
          />
        )}
        <IconRightUpOutlineRegular className="bh-activity-list-source-arrow" />
      </button>
    </Tooltip>
  );
}

const SNOOZE_LABELS = {
  hour: 'activityList.snooze.hour',
  evening: 'activityList.snooze.evening',
  tomorrow: 'activityList.snooze.tomorrow',
  week: 'activityList.snooze.week',
} as const;

export function ActivityListSnoozeButton({
  item,
  t,
  open,
  onOpenChange,
  onSnooze,
  disabled = false,
}: {
  item: HumanAttentionItem;
  t: BotHarnessTranslate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSnooze: (until: string | null) => void;
  disabled?: boolean;
}): ReactElement {
  if (item.snoozedUntil !== undefined)
    return (
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={disabled}
        onClick={() => onSnooze(null)}
      >
        {t('activityList.snooze.cancel')}
      </Button>
    );
  const now = new Date();
  const items = HUMAN_INBOX_SNOOZE_CHOICES.flatMap((choice) => {
    const until = activityListSnoozeUntil(choice, now);
    return until === undefined
      ? []
      : [
          {
            id: until.toISOString(),
            label: t(SNOOZE_LABELS[choice], {
              time: until.toLocaleString(undefined, {
                weekday: choice === 'week' ? 'short' : undefined,
                hour: '2-digit',
                minute: '2-digit',
              }),
            }),
          },
        ];
  });
  return (
    <Menu
      open={open}
      portal
      items={items}
      onSelect={(id) => {
        onOpenChange(false);
        onSnooze(id);
      }}
      onClose={() => onOpenChange(false)}
      anchor={
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          {t('activityList.snooze')}
        </Button>
      }
    />
  );
}
