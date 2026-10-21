import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  shownInChat,
  type Conversation,
  type ConversationMessage,
  type ConversationSnapshot,
} from '../../../../apps/mobile/src/host/conversation.js';
import type { ChannelWireMessage } from '../../../../apps/mobile/src/host/wire.js';
import { parseStoredChannelMessage } from './bridge.js';
import { ChannelMessageBody } from './channel-message-body.js';
import {
  conversationChannelId,
  remoteHosts,
  type RemoteConversationTarget,
} from './remote-hosts.js';
import { createRemoteMessageHost, RemoteMessageHostContext } from './remote-message-host.js';
import type { ChannelMessage } from './store.js';
import { useRemoteHosts } from './host-tabs.js';
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
    borderRadius: radius.lg,
    backgroundColor: color.surface,
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

const parsed = new WeakMap<ChannelWireMessage, ChannelMessage | undefined>();

function channelMessage(
  message: ConversationMessage,
  wire: ChannelWireMessage | undefined,
): ChannelMessage {
  if (wire !== undefined) {
    if (!parsed.has(wire)) parsed.set(wire, parseStoredChannelMessage(wire));
    const value = parsed.get(wire);
    if (value !== undefined) return value;
  }
  return {
    id: message.id,
    at: message.at,
    author:
      message.author === 'bot' && message.bot !== undefined
        ? { kind: 'bot', slug: message.bot }
        : { kind: message.author === 'human' ? 'human' : 'system' },
    body: message.body,
  };
}

function authorName(
  message: ConversationMessage,
  bots: ReadonlyMap<string, string>,
  t: BotHarnessTranslate,
): string {
  if (message.author === 'human') return t('rail.you');
  if (message.author === 'bot') return bots.get(message.bot ?? '') ?? message.bot ?? '';
  return t('remoteHosts.system');
}

export function RemoteConversationView({
  target,
  t,
}: {
  target: RemoteConversationTarget;
  t: BotHarnessTranslate;
}): ReactElement {
  const sources = remoteHosts();
  const remote = useRemoteHosts().hosts.find(
    (candidate) => candidate.host.hostId === target.hostId,
  );
  const conversation = useMemo(
    () => sources.conversation(target),
    [sources, target.hostId, target.botSlug, target.channelId],
  );
  const snapshot = useConversation(conversation);
  const channelId = conversationChannelId(target);
  const messageHost = useMemo(() => {
    const client = sources.client(target.hostId);
    return client === undefined
      ? undefined
      : createRemoteMessageHost(client, (candidate) => {
          const open = sources.getSnapshot().open;
          return (
            open !== undefined &&
            open.hostId === target.hostId &&
            conversationChannelId(open) === candidate
          );
        });
  }, [sources, target.hostId]);
  const decisions = new Map(
    snapshot.messages.flatMap((message) =>
      message.resolves?.resolution.kind === 'tool-approval'
        ? [[message.resolves.requestId, message.resolves.resolution.outcome] as const]
        : [],
    ),
  );
  const answers = new Map(
    snapshot.messages.flatMap((message) =>
      message.resolves?.resolution.kind === 'user-question'
        ? [[message.resolves.requestId, message.resolves.resolution.state] as const]
        : [],
    ),
  );
  const [draft, setDraft] = useState('');
  const labels = useMemo<MarkdownLabels>(
    () => ({
      code: { copyLabel: t('message.code.copy'), copiedLabel: t('message.code.copied') },
      footnotes: t('message.footnotes'),
    }),
    [t],
  );
  const bots = new Map(
    (remote?.snapshot.roster?.bots ?? []).map((bot) => [bot.slug, bot.displayName]),
  );
  const reachable = remote?.snapshot.connection.status === 'connected';
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
          {remote?.host.hostName ?? ''}
        </span>
        <span {...stylex.props(styles.spacer)} />
        <IconButton aria-label={t('common.close')} onClick={() => sources.close()}>
          <ChannelSidebarIcon name="x" />
        </IconButton>
      </header>
      {!reachable ? (
        <p role="status" {...stylex.props(styles.status)}>
          {t('remoteHosts.offline', { name: remote?.host.hostName ?? '' })}
        </p>
      ) : snapshot.status === 'interrupted' || snapshot.status === 'refused' ? (
        <p role="status" {...stylex.props(styles.status)}>
          {snapshot.reason ?? t('remoteHosts.interrupted')}
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
              <RemoteMessageHostContext.Provider value={messageHost}>
                <ChannelMessageBody
                  message={channelMessage(message, conversation?.wireMessage?.(message.id))}
                  channelId={channelId}
                  toolApprovalDecision={decisions.get(message.id)}
                  userQuestionResolution={answers.get(message.id)}
                  t={t}
                />
              </RemoteMessageHostContext.Provider>
            </div>
            {message.delivery === 'failed' ? (
              <span {...stylex.props(styles.failed)}>
                {message.error ?? t('remoteHosts.sendFailed')}
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
          aria-label={t('remoteHosts.composer', { name: target.title })}
          data-remote-composer=""
          rows={1}
          value={draft}
          disabled={!reachable}
          placeholder={reachable ? t('remoteHosts.composer', { name: target.title }) : undefined}
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
          {t('remoteHosts.send')}
        </Button>
      </form>
    </section>
  );
}
