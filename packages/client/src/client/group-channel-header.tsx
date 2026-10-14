import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  PersonaBotFacepile,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelSummary } from './store.js';
import { CompanionPin } from './window-companions-view.js';
import type { WindowCompanions } from './window-companions.js';
import { border, color, radius, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  title: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: '56px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: text.strong,
  },
  mark: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '22px',
    height: '22px',
    overflow: 'hidden',
    borderRadius: radius.sm,
    backgroundColor: color.elevated,
    color: color.muted,
    fontSize: text.metaSize,
    fontWeight: text.strong,
  },
  name: {
    display: 'inline-flex',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: 'inherit',
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
  },
});

export function ConversationTitle({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <span data-conversation-title="" {...stylex.props(styles.title)}>
      {children}
    </span>
  );
}

export function ChannelMark(): ReactElement {
  return (
    <span aria-hidden="true" data-channel-mark="" {...stylex.props(styles.mark)}>
      #
    </span>
  );
}

export function GroupChannelHeader({
  channel,
  title,
  members,
  expanded,
  t,
  onOpenActivity,
  onToggleProfile,
  companion,
}: {
  channel: ChannelSummary;
  title: string;
  members: readonly PersonaBotFacepileItem[];
  expanded: boolean;
  t: BotHarnessTranslate;
  onOpenActivity(): void;
  onToggleProfile(): void;
  companion?: WindowCompanions | undefined;
}): ReactElement {
  return (
    <span className="bh-channel-island bh-group-channel-header">
      {channel.avatar ? (
        <img className="bh-group-avatar-image bh-group-avatar-topbar" src={channel.avatar} alt="" />
      ) : members.length === 0 ? (
        <ChannelMark />
      ) : null}
      <PersonaBotFacepile
        items={members}
        indicator={false}
        size={22}
        t={t}
        renderAvatar={(item, avatar) => {
          const label =
            item.name +
            ' · ' +
            personaBotPresentationSummary(item.state ?? 'idle', item.activity, item.attention, t);
          return (
            <span key={item.personaBotId} className="bh-companion-chip">
              <Tooltip label={label} side="bottom" portal delayMs={350}>
                <button
                  type="button"
                  className="bh-avatar-facepile-button"
                  aria-label={label}
                  aria-haspopup="dialog"
                  aria-expanded={expanded}
                  onClick={onOpenActivity}
                >
                  {avatar}
                </button>
              </Tooltip>
              {companion ? (
                <CompanionPin
                  companion={companion}
                  botId={item.personaBotId}
                  name={item.name}
                  t={t}
                />
              ) : null}
            </span>
          );
        }}
      />
      <button
        type="button"
        data-group-channel-name=""
        {...stylex.props(styles.name)}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={t('groupProfile.openAvatar', { name: channel.name })}
        onClick={onToggleProfile}
      >
        <ConversationTitle>{title}</ConversationTitle>
      </button>
    </span>
  );
}
