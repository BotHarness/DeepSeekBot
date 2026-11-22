import { Tag } from '../../ds/tag.js';
import { Button } from '../../ds/button.js';
import { ASSIGNMENT_SESSION_ICON } from '../../channel-sidebar-icon.js';
import type { ExternalSource } from '../../../../../core/src/messaging/inbound.js';
import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { fetchMessageResource, useMessageHost } from '../../message-host.js';
import { sameBotNames, useClientStore } from '../../use-client-store.js';
import type { ChannelSidebarEntryProps } from '../../channel-sidebar.js';
import { formatRelativeTime } from '../../labels.js';
import { LoadingSkeleton } from '../../loading-skeleton.js';
import { Note } from '../../ds/note.js';
import { PanelEmptyState } from '../../ds/empty-state.js';
import { PanelDialog } from '../../ds/panel-dialog.js';
import { ExternalSourceContent } from '../../external-source-content.js';
import { externalPlatformLabel, externalSenderLabel } from '../../bridge-source-label.js';
import { ScheduleDialog } from '../../schedules-entry.js';
import { SidebarCardList, SidebarCardRow } from '../../sidebar-card.js';
import { SidebarViewMenu } from '../../sidebar-view-menu.js';
import {
  inboxLayoutSnapshot,
  setInboxLayout,
  subscribeInboxLayout,
} from '../../inbox-view-prefs.js';
import {
  INBOX_SECTIONS,
  inboxSections,
  openInboxCount,
  type InboxSection,
} from '../../inbox-sections.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { BotAttentionItem } from '../../store.js';
import { GroupHeading } from '../../ds/group-heading.js';
import { border, color, space } from '../../ds/tokens.stylex.js';

const styles = stylex.create({
  flushInboxGroup: {
    paddingBlock: 0,
    marginTop: 0,
    borderTopWidth: { default: border.hairline, ':first-child': 0 },
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  flushInboxList: { marginBottom: 0 },
  inboxGroup: { paddingBlock: space.x1 },
  inboxSpaced: { marginTop: space.x3 },
  inboxList: { marginTop: 0, marginBottom: space.x2 },
});

const INBOX_STATE_TONE = {
  pending: 'warning',
  processing: 'info',
  observed: 'info',
  deferred: 'neutral',
  'needs-repair': 'danger',
  open: 'outline',
  snoozed: 'neutral',
  handled: 'success',
  ignored: 'quiet',
} as const;

function inboxIcon(item: BotAttentionItem): string {
  if (item.sourceKind === 'schedule') return 'alarm-clock';
  if (item.sourceKind === 'memory-change') return 'git-branch';
  if (item.sourceKind === 'assignment-report' || item.assignmentSessionId !== undefined)
    return ASSIGNMENT_SESSION_ICON;
  if (item.externalOrigin !== undefined) return 'globe';
  if (item.authorKind === 'human') return 'user';
  if (item.authorKind === 'bot') return 'bot';
  return 'inbox';
}

function sourcePreviewKind(
  source: ExternalSource,
  file: { mediaType?: string },
): 'image' | 'video' | undefined {
  if (source.platform === 'feishu' && source.event.video) return;
  if (file.mediaType?.startsWith('image/')) return 'image';
  if (source.event.video && file.mediaType?.startsWith('video/')) return 'video';
  return;
}

export function BotInboxItemRow({
  item,
  source,
  marker,
  actions,
  t,
}: {
  item: BotAttentionItem;
  source?: string | undefined;
  marker?: string | undefined;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const authorName = useClientStore(
    (state) => state.bots.find((bot) => bot.slug === item.authorBotSlug)?.displayName,
  );
  const externalRequest = useRef(0);
  const [externalOpen, setExternalOpen] = useState(false);
  const [external, setExternal] = useState<ExternalSource>();
  const [externalError, setExternalError] = useState(false);
  const [fileBusy, setFileBusy] = useState<string>();
  const [fileError, setFileError] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const fileRequest = useRef<AbortController>();
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [audioErrors, setAudioErrors] = useState<Record<string, boolean>>({});
  const [audioPreviews, setAudioPreviews] = useState<Record<string, string>>({});
  const [videoPreviews, setVideoPreviews] = useState<Record<string, string>>({});
  const [videoErrors, setVideoErrors] = useState<Record<string, boolean>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const previewUrls = useRef(new Set<string>());
  const previewLifecycle = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) return;
    ++externalRequest.current;
    fileRequest.current?.abort();
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    previewUrls.current.clear();
  }, []);
  const download = async (
    attachmentId: string,
    name: string,
    preview: boolean | 'audio' | 'video' = false,
  ): Promise<void> => {
    if (fileRequest.current !== undefined) return;
    const controller = new AbortController();
    fileRequest.current = controller;
    setFileBusy(attachmentId);
    setFileError(false);
    if (preview === 'video') setVideoErrors((value) => ({ ...value, [attachmentId]: false }));
    else if (preview === 'audio') setAudioErrors((value) => ({ ...value, [attachmentId]: false }));
    else if (preview) setImageErrors((value) => ({ ...value, [attachmentId]: false }));
    try {
      const response = await fetchMessageResource(
        '/api/botharness/attachment?' +
          new URLSearchParams({
            slug: item.botSlug,
            sourceEventId: item.id,
            attachmentId,
            ...(preview === 'audio' ? { representation: 'playback' } : {}),
          }),
        AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        host,
      );
      if (!response.ok) throw new Error('Download unavailable');
      const blob = await response.blob();
      controller.signal.throwIfAborted();
      if (preview === 'video' && blob.type !== 'video/mp4') throw new Error('Unsupported video');
      if (preview === 'audio' && blob.type !== 'audio/wav') throw new Error('Unsupported audio');
      if (
        preview === true &&
        !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(blob.type)
      )
        throw new Error('Unsupported image');
      const url = URL.createObjectURL(blob);
      if (preview) {
        previewUrls.current.add(url);
        if (preview === 'video') setVideoPreviews((value) => ({ ...value, [attachmentId]: url }));
        else if (preview === 'audio')
          setAudioPreviews((value) => ({ ...value, [attachmentId]: url }));
        else setImagePreviews((value) => ({ ...value, [attachmentId]: url }));
        return;
      }
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) {
        if (preview === 'video') setVideoErrors((value) => ({ ...value, [attachmentId]: true }));
        else if (preview === 'audio')
          setAudioErrors((value) => ({ ...value, [attachmentId]: true }));
        else if (preview) setImageErrors((value) => ({ ...value, [attachmentId]: true }));
        else setFileError(true);
      }
    } finally {
      if (fileRequest.current === controller) {
        fileRequest.current = undefined;
        setFileBusy(undefined);
      }
    }
  };
  const memoryChange = item.sourceKind === 'memory-change';
  const summary = memoryChange
    ? item.summary
        .replace(/^Memory changed since your last turn:\s*/u, '')
        .replace(/^Working Memory changes since your last turn:\s*/u, '')
        .replace(/^\?\? /u, '')
    : item.externalOrigin?.voice?.transcript === 'unavailable'
      ? t('im.voiceTranscriptUnavailableHint')
      : item.summary;
  const author =
    item.externalOrigin !== undefined
      ? `${externalPlatformLabel(item.externalOrigin.platform, t)} · ${externalSenderLabel(item.externalOrigin, t)}`
      : memoryChange
        ? t('inbox.memoryChange')
        : item.sourceKind === 'assignment-report' || item.sourceKind === 'assignment-lifecycle'
          ? t('inbox.assignment')
          : item.sourceKind === 'schedule'
            ? t('inbox.schedule')
            : item.authorKind === 'human'
              ? t('main.author.human')
              : item.authorKind === 'bot'
                ? (authorName ?? item.authorBotSlug ?? t('inbox.bot'))
                : t('inbox.system');
  const open = async (): Promise<void> => {
    if (!item.sourceAvailable) return;
    if (item.scheduleId !== undefined) {
      setScheduleOpen(true);
      return;
    }
    if (item.externalOrigin !== undefined) {
      const request = ++externalRequest.current;
      fileRequest.current?.abort();
      fileRequest.current = undefined;
      setFileBusy(undefined);
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
      setImagePreviews({});
      setAudioPreviews({});
      setAudioErrors({});
      setVideoPreviews({});
      setVideoErrors({});
      setImageErrors({});
      setExternal(undefined);
      setExternalOpen(true);
      setExternalError(false);
      setFileError(false);
      try {
        const source = await actions.messagingSource(item.botSlug, item.id);
        if (request !== externalRequest.current) return;
        setExternal(source);
        for (const file of source.event.attachments ?? []) {
          if (request !== externalRequest.current) return;
          if (sourcePreviewKind(source, file) === 'image') await download(file.id, file.name, true);
          else if (sourcePreviewKind(source, file) === 'video')
            await download(file.id, file.name, 'video');
        }
      } catch {
        if (request === externalRequest.current) setExternalError(true);
      }
      return;
    }
    if (item.assignmentSessionId !== undefined) {
      await actions.openSession(item.assignmentSessionId);
      return;
    }
    if (item.sourceChannelId === undefined || item.sourceMessageId === undefined) return;
    await actions.openChannel(item.sourceChannelId);
    await actions.openAround(item.sourceChannelId, item.sourceMessageId);
  };
  const imageAttachments =
    external?.event.attachments?.filter((file) => sourcePreviewKind(external, file) === 'image') ??
    [];
  const videoAttachments =
    external?.event.attachments?.filter((file) => sourcePreviewKind(external, file) === 'video') ??
    [];
  const unavailable = !memoryChange && !item.sourceAvailable;
  const chips = [
    marker === undefined ? null : (
      <Tag key="marker" tone="info">
        {marker}
      </Tag>
    ),
    item.externalOrigin?.voice ? (
      <Tag
        key="voice"
        tone={item.externalOrigin.voice.transcript === 'platform' ? 'info' : 'warning'}
      >
        {t(
          item.externalOrigin.voice.transcript === 'platform'
            ? 'im.voiceTranscriptPlatform'
            : 'im.voiceTranscriptUnavailable',
        )}
      </Tag>
    ) : null,
    item.assignmentReportState === undefined ? null : (
      <Tag key="report" tone="outline">
        {t(`inbox.report.${item.assignmentReportState}`)}
      </Tag>
    ),
  ].filter((chip) => chip !== null);
  const returnAt =
    item.snoozedUntil === undefined
      ? undefined
      : new Date(item.snoozedUntil).toLocaleString(undefined, {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
  const note = item.state === 'snoozed' ? item.snoozeNote : item.resolutionNote;
  const meta = [
    unavailable ? <span key="unavailable">{t('inbox.sourceUnavailable')}</span> : null,
    returnAt === undefined ? null : (
      <span key="return" className="bh-inbox-item-return">
        {t('inbox.snoozedUntil', { time: returnAt })}
      </span>
    ),
    note === undefined ? null : (
      <span key="note" className="bh-inbox-item-note" title={note}>
        {note}
      </span>
    ),
  ].filter((part) => part !== null);
  const origin =
    item.externalOrigin === undefined
      ? source
      : `${item.externalOrigin.accountName} · ${item.externalOrigin.conversationName}`;
  const row = (
    <SidebarCardRow
      icon={inboxIcon(item)}
      iconLabel={author}
      title={
        <>
          <span
            className="bh-inbox-item-author"
            title={origin === undefined ? author : `${author} · ${origin}`}
          >
            {author}
            {origin === undefined ? null : (
              <span className="bh-inbox-item-origin"> · {origin}</span>
            )}
          </span>
          <span className="bh-inbox-item-time">
            {formatRelativeTime(Date.parse(item.createdAt), Date.now(), t)}
          </span>
        </>
      }
      titleClassName="bh-inbox-item-head"
      badge={<Tag tone={INBOX_STATE_TONE[item.state]}>{t(`inbox.state.${item.state}`)}</Tag>}
      summary={summary || item.assignmentTitle || t('inbox.system')}
      hint={summary}
      mainClassName={memoryChange ? 'bh-inbox-item bh-inbox-item-info' : 'bh-inbox-item'}
      state={item.state}
      muted={unavailable}
      disabled={!item.sourceAvailable}
      dialog={item.scheduleId !== undefined || item.externalOrigin !== undefined}
      {...(memoryChange ? {} : { onClick: () => void open() })}
      {...(chips.length === 0 ? {} : { chips: <>{chips}</> })}
      {...(meta.length === 0 ? {} : { meta: <>{meta}</> })}
    />
  );
  return (
    <>
      {row}
      {scheduleOpen && item.scheduleId !== undefined ? (
        <ScheduleDialog
          botSlug={item.botSlug}
          scheduleId={item.scheduleId}
          actions={actions}
          t={t}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}
      {externalOpen ? (
        <PanelDialog
          size="medium"
          fill
          bodyRef={previewLifecycle}
          onClose={() => {
            ++externalRequest.current;
            fileRequest.current?.abort();
            fileRequest.current = undefined;
            setFileBusy(undefined);
            for (const url of previewUrls.current) URL.revokeObjectURL(url);
            previewUrls.current.clear();
            setImagePreviews({});
            setAudioPreviews({});
            setAudioErrors({});
            setVideoPreviews({});
            setVideoErrors({});
            setImageErrors({});
            setExternalOpen(false);
          }}
          title={t('im.sourceTitle')}
          closeLabel={t('common.close')}
        >
          {externalError ? (
            <Note tone="danger">{t('im.sourceError')}</Note>
          ) : external === undefined ? (
            <Note>{t('im.sourceLoading')}</Note>
          ) : (
            <ExternalSourceContent
              source={external}
              t={t}
              messageMedia={
                imageAttachments.length || videoAttachments.length ? (
                  <>
                    {imageAttachments.map((file) => (
                      <div className="bh-external-source-attachment" key={file.id}>
                        {imagePreviews[file.id] ? (
                          <img
                            className="bh-external-source-image"
                            src={imagePreviews[file.id]}
                            alt={file.name}
                          />
                        ) : imageErrors[file.id] ? (
                          <>
                            <p role="alert">{t('im.fileError')}</p>
                            <Button
                              disabled={fileBusy !== undefined}
                              onClick={() => void download(file.id, file.name, true)}
                            >
                              {t('im.imageRetry')}
                            </Button>
                          </>
                        ) : (
                          <span role="status">{t('im.fileDownloading')}</span>
                        )}
                      </div>
                    ))}
                    {videoAttachments.map((file) => (
                      <div className="bh-external-source-video" key={file.id}>
                        {videoPreviews[file.id] ? (
                          <video
                            controls
                            preload="metadata"
                            playsInline
                            src={videoPreviews[file.id]}
                            aria-label={t('im.videoPlayer')}
                            onError={() =>
                              setVideoErrors((value) => ({
                                ...value,
                                [file.id]: true,
                              }))
                            }
                          />
                        ) : null}
                        {videoErrors[file.id] ? (
                          <Button
                            variant="primary"
                            disabled={fileBusy !== undefined}
                            onClick={() => void download(file.id, file.name, 'video')}
                          >
                            {fileBusy === file.id ? t('im.videoLoading') : t('im.videoRetry')}
                          </Button>
                        ) : !videoPreviews[file.id] && !videoErrors[file.id] ? (
                          <span role="status">{t('im.videoLoading')}</span>
                        ) : null}
                        {videoErrors[file.id] ? (
                          <p role="alert">{t('im.videoUnavailable')}</p>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : undefined
              }
            >
              {external.event.attachments?.map((file) => (
                <div className="bh-external-source-attachment" key={file.id}>
                  {external.event.voice && file.mediaType?.startsWith('audio/') ? (
                    <div className="bh-external-source-audio">
                      {audioPreviews[file.id] ? (
                        <audio
                          controls
                          preload="metadata"
                          src={audioPreviews[file.id]}
                          aria-label={t('im.voiceAudioPlayer')}
                          onError={() =>
                            setAudioErrors((value) => ({
                              ...value,
                              [file.id]: true,
                            }))
                          }
                        />
                      ) : null}
                      {!audioPreviews[file.id] || audioErrors[file.id] ? (
                        <Button
                          variant="primary"
                          disabled={fileBusy !== undefined}
                          onClick={() => void download(file.id, 'voice.wav', 'audio')}
                        >
                          {fileBusy === file.id
                            ? t('im.voiceAudioPreparing')
                            : audioPreviews[file.id]
                              ? t('im.voiceAudioRetry')
                              : t('im.voiceAudioPrepare')}
                        </Button>
                      ) : null}
                      <p>{t('im.voiceAudioHint')}</p>
                      {audioErrors[file.id] ? (
                        <p role="alert">{t('im.voiceAudioUnavailable')}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="bh-external-source-file">
                    <span>
                      {file.name}
                      {file.sizeBytes !== undefined || file.mediaType ? (
                        <small>
                          {' '}
                          ·{' '}
                          {[
                            file.mediaType,
                            file.sizeBytes === undefined
                              ? undefined
                              : `${new Intl.NumberFormat().format(file.sizeBytes)} B`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      ) : null}
                    </span>
                    <Button
                      disabled={fileBusy !== undefined}
                      onClick={() => void download(file.id, file.name)}
                    >
                      {fileBusy === file.id
                        ? t('im.fileDownloading')
                        : t(external.event.voice ? 'im.voiceDownloadOriginal' : 'im.fileDownload')}
                    </Button>
                  </div>
                </div>
              ))}
              {fileError ? <p role="alert">{t('im.fileError')}</p> : null}
            </ExternalSourceContent>
          )}
        </PanelDialog>
      ) : null}
    </>
  );
}

function BotInboxGroup({
  name,
  flush,
  items,
  actions,
  t,
}: {
  name: string;
  flush?: boolean | undefined;
  items: BotAttentionItem[];
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const activeSignature = items
    .filter((item) => item.state !== 'handled' && item.state !== 'ignored')
    .map((item) => item.id + ':' + item.state)
    .sort()
    .join('|');
  const [expansion, setExpansion] = useState({
    signature: activeSignature,
    expanded: activeSignature !== '',
  });
  const expanded =
    activeSignature !== expansion.signature && activeSignature !== '' ? true : expansion.expanded;
  return (
    <details
      data-inbox-group=""
      open={expanded}
      onToggle={(event) =>
        setExpansion({
          signature: activeSignature,
          expanded: event.currentTarget.open,
        })
      }
      {...stylex.props(styles.inboxGroup, flush && styles.flushInboxGroup)}
    >
      <GroupHeading
        flush={flush}
        summary
        quiet
        label={name}
        title={name}
        expanded={expanded}
        count={<Tag tone="neutral">{items.length}</Tag>}
      />
      <SidebarCardList
        flush={flush}
        label={name}
        className={stylex.props(styles.inboxList, flush && styles.flushInboxList).className}
      >
        {INBOX_SECTIONS.flatMap((section) => inboxSections(items)[section]).map((item) => (
          <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
        ))}
      </SidebarCardList>
    </details>
  );
}

function BotInboxSection({
  section,
  flush,
  items,
  sourceLabel,
  spaced,
  actions,
  t,
}: {
  section: Exclude<InboxSection, 'active'>;
  flush?: boolean | undefined;
  spaced: boolean;
  items: BotAttentionItem[];
  sourceLabel: (item: BotAttentionItem) => string;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const [expanded, setExpanded] = useState(section !== 'done');
  const name = t(`inbox.section.${section}`);
  return (
    <details
      data-inbox-group=""
      data-section={section}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      {...stylex.props(
        styles.inboxGroup,
        spaced && styles.inboxSpaced,
        flush && styles.flushInboxGroup,
      )}
    >
      <GroupHeading
        flush={flush}
        summary
        quiet
        label={name}
        expanded={expanded}
        count={<Tag tone="neutral">{items.length}</Tag>}
      />
      <SidebarCardList
        flush={flush}
        label={name}
        className={stylex.props(styles.inboxList, flush && styles.flushInboxList).className}
      >
        {items.map((item) => (
          <BotInboxItemRow
            key={item.id}
            item={item}
            source={sourceLabel(item)}
            actions={actions}
            t={t}
          />
        ))}
      </SidebarCardList>
    </details>
  );
}

export function BotInboxEntry({
  actions,
  t,
  botSlug,
  flush,
}: ChannelSidebarEntryProps): ReactElement {
  const inbox = useClientStore((state) => state.botInbox);
  const bots = useClientStore((state) => state.bots, sameBotNames);
  const channels = useClientStore((state) => state.channels);
  const layout = useSyncExternalStore(
    subscribeInboxLayout,
    inboxLayoutSnapshot,
    inboxLayoutSnapshot,
  );
  const sourceName = (item: BotAttentionItem): string | undefined => {
    const channel = channels.find((channel) => channel.id === item.sourceChannelId);
    if (channel?.type === 'dm') {
      return bots.find((bot) => bot.slug === channel.botSlug)?.displayName ?? channel.name;
    }
    return item.sourceChannelName ?? channel?.name;
  };
  const sourceKey = (item: BotAttentionItem): string =>
    item.assignmentSessionId === undefined
      ? (item.sourceChannelId ??
        (item.externalOrigin === undefined
          ? `system:${item.reason}`
          : `external:${item.externalOrigin.platform}:${item.externalOrigin.conversationId}`))
      : `assignment:${item.assignmentSessionId}`;
  const sourceLabel = (item: BotAttentionItem): string =>
    item.assignmentTitle ??
    item.externalOrigin?.conversationName ??
    sourceName(item) ??
    item.sourceChannelId ??
    t(item.assignmentSessionId === undefined ? 'inbox.system' : 'inbox.assignment');
  const sections = inboxSections(inbox.items);
  const groups = new Map<string, { name: string; items: BotAttentionItem[] }>();
  for (const item of INBOX_SECTIONS.flatMap((section) => sections[section])) {
    const key = sourceKey(item);
    const group = groups.get(key) ?? { name: sourceLabel(item), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return (
    <>
      {inbox.status === 'loading' && inbox.items.length === 0 ? (
        <LoadingSkeleton kind="sidebar" label={t('inbox.loading')} />
      ) : null}
      {inbox.status === 'error' ? (
        <div className="bh-error" role="alert">
          {t('inbox.error', { error: inbox.error ?? '' })}
          <button type="button" onClick={() => botSlug && void actions.refreshBotInbox(botSlug)}>
            {t('inbox.retry')}
          </button>
        </div>
      ) : null}
      {inbox.status === 'ready' && inbox.items.length === 0 ? (
        <PanelEmptyState icon="inbox">{t('inbox.empty')}</PanelEmptyState>
      ) : null}
      {layout === 'time' ? (
        <>
          {sections.active.length === 0 ? null : (
            <SidebarCardList flush={flush} label={t('inbox.section.active')}>
              {sections.active.map((item) => (
                <BotInboxItemRow
                  key={item.id}
                  item={item}
                  source={sourceLabel(item)}
                  actions={actions}
                  t={t}
                />
              ))}
            </SidebarCardList>
          )}
          {(['snoozed', 'done'] as const).map((section) =>
            sections[section].length === 0 ? null : (
              <BotInboxSection
                flush={flush}
                key={section}
                section={section}
                spaced={
                  sections.active.length > 0 || (section === 'done' && sections.snoozed.length > 0)
                }
                items={sections[section]}
                sourceLabel={sourceLabel}
                actions={actions}
                t={t}
              />
            ),
          )}
        </>
      ) : (
        [...groups.entries()].map(([key, group]) => (
          <BotInboxGroup
            flush={flush}
            key={key}
            name={group.name}
            items={group.items}
            actions={actions}
            t={t}
          />
        ))
      )}
      {inbox.nextCursor !== undefined && botSlug !== undefined ? (
        <button
          type="button"
          className="bh-group-manage-button"
          onClick={() => void actions.loadMoreBotInbox(botSlug)}
        >
          {t('inbox.more')}
        </button>
      ) : null}
    </>
  );
}

export function BotInboxHeaderAction({ t }: ChannelSidebarEntryProps): ReactElement {
  const layout = useSyncExternalStore(
    subscribeInboxLayout,
    inboxLayoutSnapshot,
    inboxLayoutSnapshot,
  );
  return (
    <SidebarViewMenu
      label={t('inbox.menu')}
      items={[
        { type: 'label', id: 'layout-label', text: t('inbox.layout') },
        { id: 'time', label: t('inbox.layout.time') },
        { id: 'source', label: t('inbox.layout.source') },
      ]}
      selectedIds={[layout]}
      onSelect={(id) => setInboxLayout(id === 'source' ? 'source' : 'time')}
    />
  );
}

export function BotInboxBadge(): ReactElement | null {
  const count = useClientStore((state) => openInboxCount(state.botInbox.items));
  return count === 0 ? null : <Tag tone="neutral">{count}</Tag>;
}
