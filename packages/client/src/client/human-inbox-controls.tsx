import { useId, useState, type ReactElement } from 'react';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconRightUpOutlineRegular,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, ChannelSummary, HumanAttentionItem } from './store.js';
import { HUMAN_INBOX_SNOOZE_CHOICES, humanInboxSnoozeUntil } from './human-inbox-snooze.js';

export function HumanInboxFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="bh-human-inbox-filter">
      <span id={labelId}>{label}</span>
      <Menu
        open={open}
        portal
        selectedId={value}
        items={options}
        onSelect={(id) => {
          setOpen(false);
          onChange(id);
        }}
        onClose={() => setOpen(false)}
        anchor={
          <Button
            variant="outline"
            className="bh-human-inbox-selector"
            aria-labelledby={labelId + ' ' + valueId}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            onKeyDown={(event) => {
              if (!open && event.key === 'ArrowDown') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span id={valueId}>
              {options.find((option) => option.id === value)?.label ?? options[0]?.label}
            </span>
            <IconChevronDownOutlineRegular />
          </Button>
        }
      />
    </div>
  );
}

export function HumanInboxSourceButton({
  item,
  bots,
  channels,
  t,
  onClick,
}: {
  item: HumanAttentionItem;
  bots: readonly BotSummary[];
  channels: readonly ChannelSummary[];
  t: BotHarnessTranslate;
  onClick: () => void;
}): ReactElement {
  const channel = channels.find((value) => value.id === item.channelId);
  const bot = bots.find((value) => value.slug === item.botSlug);
  const name = channel?.type === 'group' ? channel.name : (bot?.displayName ?? item.botSlug);
  const sourceName = item.channelName ?? name;
  const label =
    t(
      item.kind === 'bot-message-needs-repair' && (!item.channelName || !item.messageId)
        ? 'humanInbox.openBotInbox'
        : item.category === 'handled' && item.assignmentSessionId !== undefined
          ? 'humanInbox.handled.session'
          : 'humanInbox.open',
    ) +
    ' · ' +
    sourceName;
  return (
    <Tooltip label={label} portal side="top">
      <button
        type="button"
        className="bh-human-inbox-source-link"
        aria-label={label}
        onClick={onClick}
      >
        {channel?.type === 'group' ? (
          <span className="bh-human-inbox-channel-avatar" aria-hidden="true">
            {channel.avatar === undefined ? '#' : <img src={channel.avatar} alt="" />}
          </span>
        ) : (
          <PersonaBotAvatar
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
        <IconRightUpOutlineRegular className="bh-human-inbox-source-arrow" />
      </button>
    </Tooltip>
  );
}

const SNOOZE_LABELS = {
  hour: 'humanInbox.snooze.hour',
  evening: 'humanInbox.snooze.evening',
  tomorrow: 'humanInbox.snooze.tomorrow',
  week: 'humanInbox.snooze.week',
} as const;

export function HumanInboxSnoozeButton({
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
        {t('humanInbox.snooze.cancel')}
      </Button>
    );
  const now = new Date();
  const items = HUMAN_INBOX_SNOOZE_CHOICES.flatMap((choice) => {
    const until = humanInboxSnoozeUntil(choice, now);
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
          {t('humanInbox.snooze')}
        </Button>
      }
    />
  );
}
