import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

import {
  shownInChat,
  type Conversation,
  type ConversationMessage,
  type ConversationSnapshot,
} from '../../../../apps/mobile/src/host/conversation.js';
import { remoteHosts, type RemoteConversationTarget } from './remote-hosts.js';
import { useRemoteHosts } from './host-tabs.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { RemoteAvatar } from './remote-avatar.js';
import { IconButton } from './ds/icon-button.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { observeRemoteRead } from './remote-conversation-read.js';
import { useMountedResource } from './mounted-resource.js';
import { RemoteHostViewerPanel } from './remote-host-viewer-panel.js';
import type { RemoteViewerKind } from './remote-host-viewer.js';

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
  author: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
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
  const { hosts, avatars } = useRemoteHosts();
  const remote = hosts.find((candidate) => candidate.host.hostId === target.hostId);
  const conversation = useMemo(
    () => sources.conversation(target),
    [sources, target.hostId, target.botSlug, target.channelId],
  );
  const snapshot = useConversation(conversation);
  const markReadMount = useMountedResource<HTMLDivElement>(
    (node) => {
      if (conversation === undefined) return;
      return observeRemoteRead(node, conversation, (messageId) =>
        sources.markRead(target, messageId),
      );
    },
    [sources, conversation, target.hostId, target.botSlug, target.channelId],
  );
  const [draft, setDraft] = useState('');
  const [viewer, setViewer] = useState<RemoteViewerKind>();
  const viewerClient = sources.viewerClient(target.hostId);
  const bot =
    target.channelId === undefined
      ? remote?.snapshot.roster?.bots.find((entry) => entry.slug === target.botSlug)
      : undefined;
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
        <RemoteAvatar
          roster={remote?.snapshot.roster}
          avatars={avatars}
          target={target}
          size={34}
          t={t}
        />
        <span {...stylex.props(styles.title)}>{target.title}</span>
        <span {...stylex.props(styles.source)}>
          <ChannelSidebarIcon name="monitor" />
          {remote?.host.hostName ?? ''}
        </span>
        <span {...stylex.props(styles.spacer)} />
        {bot?.browserAccess ? (
          <IconButton
            aria-label={t('remoteViewer.browser')}
            title={t('remoteViewer.browser')}
            aria-pressed={viewer === 'browser'}
            onClick={() => setViewer(viewer === 'browser' ? undefined : 'browser')}
          >
            <ChannelSidebarIcon name="globe" />
          </IconButton>
        ) : null}
        {bot?.computerAccess ? (
          <IconButton
            aria-label={t('remoteViewer.computer')}
            title={t('remoteViewer.computer')}
            aria-pressed={viewer === 'computer'}
            onClick={() => setViewer(viewer === 'computer' ? undefined : 'computer')}
          >
            <ChannelSidebarIcon name="monitor" />
          </IconButton>
        ) : null}
        <IconButton aria-label={t('common.close')} onClick={() => sources.close()}>
          <ChannelSidebarIcon name="x" />
        </IconButton>
      </header>
      {viewer !== undefined &&
      viewerClient !== undefined &&
      bot !== undefined &&
      (viewer === 'browser' ? bot.browserAccess : bot.computerAccess) ? (
        <RemoteHostViewerPanel
          key={`${target.hostId}:${bot.slug}:${viewer}`}
          client={viewerClient}
          kind={viewer}
          slug={bot.slug}
          hostName={remote?.host.hostName ?? ''}
          t={t}
          onClose={() => setViewer(undefined)}
        />
      ) : (
        <>
          {!reachable ? (
            <p role="status" {...stylex.props(styles.status)}>
              {t('remoteHosts.offline', { name: remote?.host.hostName ?? '' })}
            </p>
          ) : snapshot.status === 'interrupted' || snapshot.status === 'refused' ? (
            <p role="status" {...stylex.props(styles.status)}>
              {snapshot.reason ?? t('remoteHosts.interrupted')}
            </p>
          ) : null}
          <div ref={markReadMount} {...stylex.props(styles.timeline)} data-remote-timeline="">
            {snapshot.drafts.map((entry) => (
              <div key={entry.draftId} {...stylex.props(styles.message)}>
                <span {...stylex.props(styles.author)}>
                  <RemoteAvatar
                    roster={remote?.snapshot.roster}
                    avatars={avatars}
                    target={{
                      botSlug: entry.botSlug,
                      title: bots.get(entry.botSlug) ?? entry.botSlug,
                    }}
                    size={24}
                    t={t}
                  />
                  {bots.get(entry.botSlug) ?? entry.botSlug}
                </span>
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
                <span {...stylex.props(styles.author)}>
                  {message.author === 'bot' && message.bot !== undefined ? (
                    <RemoteAvatar
                      roster={remote?.snapshot.roster}
                      avatars={avatars}
                      target={{ botSlug: message.bot, title: authorName(message, bots, t) }}
                      size={24}
                      t={t}
                    />
                  ) : null}
                  {authorName(message, bots, t)}
                </span>
                <div
                  {...stylex.props(styles.bubble, message.author === 'human' && styles.humanBubble)}
                >
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
              placeholder={
                reachable ? t('remoteHosts.composer', { name: target.title }) : undefined
              }
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
                  return;
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
        </>
      )}
    </section>
  );
}
