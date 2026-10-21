import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  shownInChat,
  type Conversation,
  type ConversationMessage,
  type ConversationSnapshot,
} from '../../../../apps/mobile/src/host/conversation.js';
import { computerSources, type RemoteConversationTarget } from './computer-sources.js';
import { useComputerSources } from './computer-tabs.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { IconButton } from './ds/icon-button.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: color.base,
    color: color.fg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: 'var(--bh-channel-header-height, 48px)',
    paddingInline: space.x4,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
  },
  title: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  source: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  spacer: { flexGrow: 1 },
  timeline: {
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: space.x4,
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingBlock: space.x5,
    paddingInline: space.x5,
  },
  message: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  human: { alignItems: 'flex-end' },
  author: { color: color.subtle, fontSize: text.metaSize, lineHeight: text.metaLine },
  bubble: {
    maxWidth: 'min(720px, 100%)',
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.md,
    backgroundColor: color.elevated,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    overflowWrap: 'anywhere',
  },
  humanBubble: { backgroundColor: color.accentTint },
  failed: { color: color.danger, fontSize: text.metaSize, lineHeight: text.metaLine },
  status: {
    margin: 0,
    paddingInline: space.x5,
    paddingBlock: space.x2,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  composer: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: space.x3,
    paddingBlock: space.x4,
    paddingInline: space.x5,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: '40px',
    maxHeight: '200px',
    resize: 'vertical',
    boxSizing: 'border-box',
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
});

const idle: ConversationSnapshot = {
  status: 'opening',
  messages: [],
  drafts: [],
  hasOlder: false,
  loadingOlder: false,
  fromCache: false,
};

function useConversation(conversation: Conversation | undefined): ConversationSnapshot {
  const subscribe = useMemo(
    () =>
      (listener: () => void): (() => void) => {
        if (conversation === undefined) return () => {};
        const release = conversation.subscribe(listener);
        conversation.start();
        return () => {
          release();
          conversation.stop();
        };
      },
    [conversation],
  );
  const read = (): ConversationSnapshot => conversation?.getSnapshot() ?? idle;
  return useSyncExternalStore(subscribe, read, read);
}

function authorName(
  message: ConversationMessage,
  bots: ReadonlyMap<string, string>,
  t: BotHarnessTranslate,
): string {
  if (message.author === 'human') return t('rail.you');
  if (message.author === 'bot') return bots.get(message.bot ?? '') ?? message.bot ?? '';
  return t('computers.system');
}

export function RemoteConversationView({
  target,
  t,
}: {
  target: RemoteConversationTarget;
  t: BotHarnessTranslate;
}): ReactElement {
  const sources = computerSources();
  const computer = useComputerSources().computers.find(
    (candidate) => candidate.host.hostId === target.hostId,
  );
  const conversation = useMemo(
    () => sources.conversation(target),
    [sources, target.hostId, target.botSlug, target.channelId],
  );
  const snapshot = useConversation(conversation);
  const [draft, setDraft] = useState('');
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: t('message.code.copy'), copiedLabel: t('message.code.copied') },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const bots = new Map(
    (computer?.snapshot.roster?.bots ?? []).map((bot) => [bot.slug, bot.displayName]),
  );
  const reachable = computer?.snapshot.connection.status === 'connected';
  const send = (): void => {
    const body = draft.trim();
    if (body.length === 0 || conversation === undefined || !reachable) return;
    conversation.send(body);
    setDraft('');
  };
  const shown = snapshot.messages.filter(shownInChat);
  return (
    <section
      {...stylex.props(styles.root)}
      aria-label={target.title}
      data-remote-conversation={target.hostId}
    >
      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.title)}>{target.title}</span>
        <span {...stylex.props(styles.source)}>
          <ChannelSidebarIcon name="monitor" />
          {computer?.host.hostName ?? ''}
        </span>
        <span {...stylex.props(styles.spacer)} />
        <IconButton aria-label={t('common.close')} onClick={() => sources.close()}>
          <ChannelSidebarIcon name="x" />
        </IconButton>
      </header>
      {!reachable ? (
        <p role="status" {...stylex.props(styles.status)}>
          {t('computers.offline', { name: computer?.host.hostName ?? '' })}
        </p>
      ) : snapshot.status === 'interrupted' || snapshot.status === 'refused' ? (
        <p role="status" {...stylex.props(styles.status)}>
          {snapshot.reason ?? t('computers.interrupted')}
        </p>
      ) : null}
      <div {...stylex.props(styles.timeline)} data-remote-timeline="">
        {snapshot.drafts.map((entry) => (
          <div key={entry.draftId} {...stylex.props(styles.message)}>
            <span {...stylex.props(styles.author)}>{bots.get(entry.botSlug) ?? entry.botSlug}</span>
            <div {...stylex.props(styles.bubble)}>
              <MarkdownText text={entry.body} streaming labels={labels} />
            </div>
          </div>
        ))}
        {[...shown].reverse().map((message) => (
          <div
            key={message.id}
            data-remote-message={message.id}
            {...stylex.props(styles.message, message.author === 'human' && styles.human)}
          >
            <span {...stylex.props(styles.author)}>{authorName(message, bots, t)}</span>
            <div {...stylex.props(styles.bubble, message.author === 'human' && styles.humanBubble)}>
              <MarkdownText
                text={
                  message.body.trim() !== ''
                    ? message.body
                    : message.attachments.map((attachment) => attachment.name).join(', ')
                }
                streaming={false}
                labels={labels}
              />
            </div>
            {message.delivery === 'failed' ? (
              <span {...stylex.props(styles.failed)}>
                {message.error ?? t('computers.sendFailed')}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <form
        {...stylex.props(styles.composer)}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          {...stylex.props(styles.input)}
          aria-label={t('computers.composer', { name: target.title })}
          data-remote-composer=""
          rows={1}
          value={draft}
          disabled={!reachable}
          placeholder={reachable ? t('computers.composer', { name: target.title }) : undefined}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!reachable || draft.trim().length === 0}
          data-remote-send=""
        >
          {t('computers.send')}
        </Button>
      </form>
    </section>
  );
}
