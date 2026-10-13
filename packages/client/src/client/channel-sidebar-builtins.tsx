import type { ExternalSource } from '../../../core/src/messaging/inbound.js';
import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  Button,
  IconEllipsisOutlineRegular,
  IconChevronDownOutlineRegular,
  Input,
  Menu,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BotModePrefs } from './bot-mode-prefs.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import { ModelPresetProfile } from './model-preset-profile.js';
import { modelPlanOf, rememberModelPlan, subscribeModelPlans } from './model-plan-store.js';
import type { ModelPlanStateView, ModelPlanView } from './bridge.js';
import { AssignmentConcurrencySetting } from './assignment-concurrency-setting.js';
import { channelSettings } from './channel-settings-state.js';
import { useMountedResource } from './mounted-resource.js';
import { WakePolicyBadge, WakePolicyEntry } from './wake-policy-entry.js';
import {
  ExternalConnectorsAttention,
  ExternalConnectorsEntry,
  ExternalIdentitiesEntry,
} from './external-entries.js';
import {
  GroupConnectorsAttention,
  GroupConnectorsEntry,
  GroupWakePolicyEntry,
  isGroupConversation,
} from './group-entries.js';
import { useClientState } from './bot-sidebar.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarTab,
} from './channel-sidebar.js';
import { formatRelativeTime } from './labels.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { MemoryEntry } from './memory-entry.js';
import { MemoryRecovery } from './memory-recovery.js';
import { cachedMemory, invalidateMemory } from './memory-read-cache.js';
import { MemoryFilesEntry } from './memory-files-entry.js';
import { Modal } from './modal.js';
import { ExternalSourceContent } from './external-source-content.js';
import { externalPlatformLabel, externalSenderLabel } from './bridge-source-label.js';
import { GroupAvatarCropModal } from './group-avatar-crop.js';
import { MembersEntry, MembersHeaderAction } from './group-member-controls.js';
import { GroupWorkEntry } from './group-work-entry.js';
import { PrivateAccountsSection } from './private-accounts-section.js';
import { BotSchedulesEntry, BotSchedulesHeaderAction, ScheduleDialog } from './schedules-entry.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import {
  SessionsEntry,
  SessionsHeaderAction,
  type NativeSessionCatalog,
} from './sessions-entry.js';
import { SidebarViewMenu } from './sidebar-view-menu.js';
import { channelSidebarPrefs } from './channel-sidebar-prefs.js';
import { memoryViewSnapshot, setMemoryView, subscribeMemoryView } from './memory-view-prefs.js';
import { inboxLayoutSnapshot, setInboxLayout, subscribeInboxLayout } from './inbox-view-prefs.js';
import {
  INBOX_SECTIONS,
  inboxSections,
  openInboxCount,
  type InboxSection,
} from './inbox-sections.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotAttentionItem, ChannelSummary } from './store.js';

const inactiveSubscribe = (): (() => void) => () => {};

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
    return 'list-checks';
  if (item.externalOrigin !== undefined) return 'globe';
  if (item.authorKind === 'human') return 'user';
  if (item.authorKind === 'bot') return 'bot';
  return 'inbox';
}

function GroupManagementEntry(props: ChannelSidebarEntryProps): ReactElement {
  const group = useClientState().conversation.channel;
  if (group?.type !== 'group') return <></>;
  return <GroupManagementForChannel key={group.id} {...props} group={group} />;
}

function GroupManagementForChannel({
  actions,
  t,
  group,
}: ChannelSidebarEntryProps & { group: ChannelSummary }): ReactElement {
  const [nameState, setNameState] = useState({ source: group.name, draft: group.name });
  if (nameState.source !== group.name) {
    setNameState({ source: group.name, draft: group.name });
  }
  const name = nameState.source === group.name ? nameState.draft : group.name;
  const [cropFile, setCropFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const apply = async (result: Promise<boolean>): Promise<boolean> => {
    setBusy(true);
    try {
      const ok = await result;
      setError(!ok);
      return ok;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bh-group-management">
      <div className="bh-group-setting">
        <div className="bh-group-invitations-title">{t('group.avatar')}</div>
        <div className="bh-group-avatar-setting">
          {group.avatar ? <img src={group.avatar} alt="" /> : <span aria-hidden="true">#</span>}
          <label className="bh-group-manage-button">
            {t('group.avatarChoose')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) setCropFile(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          {group.avatar ? (
            <button
              type="button"
              className="bh-group-manage-button"
              disabled={busy}
              onClick={() => void apply(actions.setGroupAvatar(group.id, null))}
            >
              {t('group.avatarRemove')}
            </button>
          ) : null}
        </div>
      </div>
      <form
        className="bh-group-setting"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== group.name) void apply(actions.renameChannel(group.id, name.trim()));
        }}
      >
        <label htmlFor="bh-group-name">{t('group.name')}</label>
        <div className="bh-group-setting-row">
          <Input
            id="bh-group-name"
            value={name}
            maxLength={120}
            onChange={(event) => setNameState({ source: group.name, draft: event.target.value })}
          />
          <button
            type="submit"
            className="bh-group-manage-button"
            disabled={busy || !name.trim() || name.trim() === group.name}
          >
            {t('group.save')}
          </button>
        </div>
      </form>
      {cropFile ? (
        <GroupAvatarCropModal
          file={cropFile}
          t={t}
          onClose={() => setCropFile(undefined)}
          onSave={(avatar) => apply(actions.setGroupAvatar(group.id, avatar))}
        />
      ) : null}
      {error ? (
        <div className="bh-error" role="alert">
          {t('members.error')}
        </div>
      ) : null}
    </div>
  );
}

function GroupManagementHeaderAction(props: ChannelSidebarEntryProps): ReactElement {
  return <GroupManagementHeaderForChannel key={props.channelId} {...props} />;
}

function GroupManagementHeaderForChannel({
  actions,
  t,
  channelId,
}: ChannelSidebarEntryProps): ReactElement {
  const group = useClientState().conversation.channel;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (group?.type !== 'group' || group.id !== channelId) return <></>;
  const items: readonly MenuEntry[] = [{ id: 'disband', label: t('members.delete') }];
  const disband = async (): Promise<void> => {
    setBusy(true);
    try {
      if (await actions.deleteGroupChannel(group.id)) setConfirmOpen(false);
      else setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Menu
        open={menuOpen}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={t('group.more')} side="bottom" delayMs={500}>
            <button
              type="button"
              className="bh-channel-sidebar-entry-action"
              aria-label={t('group.more')}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <IconEllipsisOutlineRegular size={16} />
            </button>
          </Tooltip>
        }
        items={items}
        onSelect={() => {
          setMenuOpen(false);
          setConfirmOpen(true);
        }}
        onClose={() => setMenuOpen(false)}
      />
      {confirmOpen ? (
        <Modal
          open
          onClose={() => setConfirmOpen(false)}
          closeLabel={t('common.close')}
          title={t('members.delete')}
          description={t('members.deleteConfirm', { name: group.name })}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void disband()}>
                {t('members.delete')}
              </Button>
            </>
          }
        >
          {error ? (
            <div className="bh-error" role="alert">
              {t('members.error')}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

function MembersBadge(): ReactElement {
  return <Tag tone="neutral">{useClientState().conversation.channel?.members.length ?? 0}</Tag>;
}

function BotInboxItemRow({
  item,
  source,
  actions,
  t,
}: {
  item: BotAttentionItem;
  source?: string | undefined;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const bots = useClientState().bots;
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
      const response = await fetch(
        '/api/botharness/attachment?' +
          new URLSearchParams({
            slug: item.botSlug,
            sourceEventId: item.id,
            attachmentId,
            ...(preview === 'audio' ? { representation: 'playback' } : {}),
          }),
        {
          credentials: 'same-origin',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
        },
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
                ? (bots.find((bot) => bot.slug === item.authorBotSlug)?.displayName ??
                  item.authorBotSlug ??
                  t('inbox.bot'))
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
          if (file.mediaType?.startsWith('image/')) await download(file.id, file.name, true);
          else if (source.event.video && file.mediaType?.startsWith('video/'))
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
    external?.event.attachments?.filter((file) => file.mediaType?.startsWith('image/')) ?? [];
  const videoAttachments = external?.event.video
    ? (external.event.attachments?.filter((file) => file.mediaType?.startsWith('video/')) ?? [])
    : [];
  const unavailable = !memoryChange && !item.sourceAvailable;
  const chips = [
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
      summary={summary || item.assignmentPurpose || t('inbox.system')}
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
        <Modal
          open
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
          className="bh-external-source-modal"
          closeLabel={t('common.close')}
        >
          <div ref={previewLifecycle}>
            {externalError ? (
              <p role="alert">{t('im.sourceError')}</p>
            ) : external === undefined ? (
              <p>{t('im.sourceLoading')}</p>
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
                                setVideoErrors((value) => ({ ...value, [file.id]: true }))
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
                              setAudioErrors((value) => ({ ...value, [file.id]: true }))
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
                          : t(
                              external.event.voice ? 'im.voiceDownloadOriginal' : 'im.fileDownload',
                            )}
                      </Button>
                    </div>
                  </div>
                ))}
                {fileError ? <p role="alert">{t('im.fileError')}</p> : null}
              </ExternalSourceContent>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function BotInboxGroup({
  name,
  items,
  actions,
  t,
}: {
  name: string;
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
      className="bh-inbox-group"
      open={expanded}
      onToggle={(event) =>
        setExpansion({ signature: activeSignature, expanded: event.currentTarget.open })
      }
    >
      <summary className="bh-inbox-group-head">
        <IconChevronDownOutlineRegular className="bh-inbox-group-chevron" size={14} />
        <span className="bh-inbox-group-name" title={name}>
          {name}
        </span>
        <Tag tone="neutral">{items.length}</Tag>
      </summary>
      <SidebarCardList label={name}>
        {INBOX_SECTIONS.flatMap((section) => inboxSections(items)[section]).map((item) => (
          <BotInboxItemRow key={item.id} item={item} actions={actions} t={t} />
        ))}
      </SidebarCardList>
    </details>
  );
}

function BotInboxSection({
  section,
  items,
  sourceLabel,
  actions,
  t,
}: {
  section: Exclude<InboxSection, 'active'>;
  items: BotAttentionItem[];
  sourceLabel: (item: BotAttentionItem) => string;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
}): ReactElement {
  const [expanded, setExpanded] = useState(section !== 'done');
  const name = t(`inbox.section.${section}`);
  return (
    <details
      className="bh-inbox-group bh-inbox-section"
      data-section={section}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="bh-inbox-group-head">
        <IconChevronDownOutlineRegular className="bh-inbox-group-chevron" size={14} />
        <span className="bh-inbox-group-name">{name}</span>
        <Tag tone="neutral">{items.length}</Tag>
      </summary>
      <SidebarCardList label={name}>
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
function BotInboxEntry({ actions, t, botSlug }: ChannelSidebarEntryProps): ReactElement {
  const state = useClientState();
  const inbox = state.botInbox;
  const layout = useSyncExternalStore(
    subscribeInboxLayout,
    inboxLayoutSnapshot,
    inboxLayoutSnapshot,
  );
  const sourceName = (item: BotAttentionItem): string | undefined => {
    const channel = state.channels.find((channel) => channel.id === item.sourceChannelId);
    if (channel?.type === 'dm') {
      return state.bots.find((bot) => bot.slug === channel.botSlug)?.displayName ?? channel.name;
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
    item.assignmentPurpose ??
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
        </div>
      ) : null}
      {layout === 'time' ? (
        <>
          {sections.active.length === 0 ? null : (
            <SidebarCardList label={t('inbox.section.active')}>
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
                key={section}
                section={section}
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
          <BotInboxGroup key={key} name={group.name} items={group.items} actions={actions} t={t} />
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

function BotInboxHeaderAction({ t }: ChannelSidebarEntryProps): ReactElement {
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

function MemoryViewTabs({ t, setExpanded }: ChannelSidebarEntryProps): ReactElement {
  const view = useSyncExternalStore(subscribeMemoryView, memoryViewSnapshot, memoryViewSnapshot);
  return (
    <span className="bh-memory-view-tabs" role="tablist" aria-label={t('memory.view.label')}>
      {(['graph', 'versions', 'branches'] as const).map((id) => (
        <Tooltip
          key={id}
          label={t(`memory.view.${id}Help`)}
          side="bottom"
          maxWidth={280}
          delayMs={300}
          portal
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => {
              setMemoryView(id);
              setExpanded?.(true);
            }}
          >
            {t(`memory.view.${id}`)}
          </button>
        </Tooltip>
      ))}
    </span>
  );
}

function MemoryHeaderAction({
  t,
  actions,
  channelId,
  refreshRevision,
}: ChannelSidebarEntryProps): ReactElement {
  const terminology = useSyncExternalStore(
    channelSidebarPrefs.subscribe,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
    () => channelSidebarPrefs.getSnapshot().memoryTerminology,
  );
  const [backups, setBackups] = useState(false);
  return (
    <>
      <SidebarViewMenu
        label={t('memory.menu')}
        items={[
          { type: 'label', id: 'terminology-label', text: t('memory.terminology') },
          { id: 'memory', label: t('memory.terms.memory') },
          { id: 'git', label: t('memory.terms.git') },
          { type: 'separator', id: 'backups-separator' },
          { id: 'backups', label: t('memory.backups.open') },
        ]}
        selectedIds={[terminology]}
        onSelect={(id) => {
          if (id === 'backups') setBackups(true);
          else channelSidebarPrefs.setMemoryTerminology(id === 'git' ? 'git' : 'memory');
        }}
      />
      {!backups ? null : (
        <Modal
          open
          onClose={() => setBackups(false)}
          closeLabel={t('common.close')}
          title={t('memory.backups.title')}
          description={t('memory.backups.intro')}
          className="bh-memory-backups-dialog"
        >
          <MemoryRecovery
            actions={actions}
            channelId={channelId}
            refreshRevision={refreshRevision}
            t={t}
            onRestored={() => invalidateMemory(cachedMemory(actions, channelId))}
          />
        </Modal>
      )}
    </>
  );
}

function BotInboxBadge(): ReactElement | null {
  const count = openInboxCount(useClientState().botInbox.items);
  return count === 0 ? null : <Tag tone="neutral">{count}</Tag>;
}

function ModelEntry({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <></>;
  return <ModelPresetProfile key={botSlug} slug={botSlug} actions={actions} t={t} />;
}

function useModelPlan(
  botSlug: string | undefined,
  actions: ChannelSidebarEntryProps['actions'],
): [ModelPlanView | null | undefined, (element: HTMLSpanElement | null) => void] {
  const plan = useSyncExternalStore(
    subscribeModelPlans,
    () => modelPlanOf(botSlug),
    () => modelPlanOf(botSlug),
  );
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (botSlug === undefined || modelPlanOf(botSlug) !== undefined) return;
    let active = true;
    void actions.modelPlanState(botSlug).then(
      (state: ModelPlanStateView | undefined) => {
        if (active) rememberModelPlan(botSlug, state?.plan);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [actions, botSlug, plan === undefined]);
  return [plan, mount];
}

function routeLabel(route: ModelPlanView['orchestrator'] | undefined): string {
  if (route === undefined) return '…';
  return route.reasoningEffort === undefined
    ? route.model
    : `${route.model} · ${route.reasoningEffort}`;
}

function ModelBadge({ botSlug, actions }: ChannelSidebarEntryProps): ReactElement {
  const [plan, mount] = useModelPlan(botSlug, actions);
  const route = plan?.orchestrator ?? undefined;
  return (
    <span ref={mount} className="bh-channel-sidebar-summary">
      {route === undefined ? null : <Tag tone="neutral">{routeLabel(route)}</Tag>}
    </span>
  );
}

function AssignmentLimitDialog({
  prefs,
  t,
  onClose,
}: {
  prefs: BotModePrefs;
  t: BotHarnessTranslate;
  onClose: () => void;
}): ReactElement {
  const snapshot = useSyncExternalStore(
    prefs.source.subscribe,
    prefs.source.getSnapshot,
    prefs.source.getSnapshot,
  );
  return (
    <Modal
      open
      title={t('assignmentLimit.title')}
      className="bh-assignment-limit-dialog"
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <AssignmentConcurrencySetting
        t={t}
        limit={snapshot.assignmentConcurrencyLimit}
        writable={snapshot.status === 'ready' && snapshot.mode === 'host'}
        save={(limit) => prefs.setAssignmentConcurrencyLimit(limit)}
        variant="dialog"
      />
    </Modal>
  );
}

function SessionsHeaderWithSettings({
  prefs,
  ...props
}: ChannelSidebarEntryProps & { prefs: BotModePrefs | undefined }): ReactElement {
  const { botSlug, actions, t } = props;
  const [plan, mount] = useModelPlan(botSlug, actions);
  const readLimit = () => prefs?.source.getSnapshot().assignmentConcurrencyLimit;
  const limit = useSyncExternalStore(
    prefs?.source.subscribe ?? inactiveSubscribe,
    readLimit,
    readLimit,
  );
  const [limitOpen, setLimitOpen] = useState(false);
  const extraItems: MenuEntry[] = [
    ...(botSlug === undefined
      ? []
      : [
          { type: 'separator' as const, id: 'model-separator' },
          { type: 'label' as const, id: 'model-label', text: t('entry.model') },
          {
            id: 'model:orchestrator',
            label: `${t('modelPreset.orchestrator')} · ${plan === null ? t('onboarding.inherit') : routeLabel(plan?.orchestrator)}`,
          },
          {
            id: 'model:assignment',
            label: `${t('modelPreset.assignment')} · ${plan === null ? t('onboarding.inherit') : routeLabel(plan?.assignmentDefault)}`,
          },
        ]),
    ...(prefs === undefined || limit === undefined
      ? []
      : [
          { type: 'separator' as const, id: 'limit-separator' },
          { type: 'label' as const, id: 'limit-label', text: t('assignmentLimit.title') },
          { id: 'limit:edit', label: t('sessions.limit.value', { count: limit }) },
        ]),
  ];
  return (
    <span ref={mount} className="bh-sessions-header-action">
      <SessionsHeaderAction
        {...props}
        extraItems={extraItems}
        onExtraSelect={(id) => {
          if (id === 'limit:edit') setLimitOpen(true);
          else channelSettings.open('model');
        }}
      />
      {limitOpen && prefs !== undefined ? (
        <AssignmentLimitDialog prefs={prefs} t={t} onClose={() => setLimitOpen(false)} />
      ) : null}
    </span>
  );
}

export function createChannelSidebarBuiltinTabs(
  t: BotHarnessTranslate,
): readonly ChannelSidebarTab[] {
  return [
    {
      id: 'conversation',
      icon: 'messages-square',
      label: t('tab.conversation'),
      order: 1,
      scope: 'personabot',
    },
    { id: 'memory', icon: 'files', label: t('tab.memory'), order: 2, scope: 'personabot' },
    { id: 'screen', icon: 'monitor', label: t('tab.screen'), order: 3, scope: 'personabot' },
  ];
}

export function createChannelSidebarBuiltins(
  t: BotHarnessTranslate,
  prefs?: BotModePrefs,
  nativeSessions: NativeSessionCatalog = {
    subscribe: inactiveSubscribe,
    getSnapshot: () => ({ ids: [], byId: {} }),
  },
): readonly ChannelSidebarEntry[] {
  function SessionsWithNative(props: ChannelSidebarEntryProps): ReactElement {
    const readLimit = () => prefs?.source.getSnapshot().assignmentConcurrencyLimit;
    const assignmentLimit = useSyncExternalStore(
      prefs?.source.subscribe ?? inactiveSubscribe,
      readLimit,
      readLimit,
    );
    return (
      <SessionsEntry {...props} nativeSessions={nativeSessions} assignmentLimit={assignmentLimit} />
    );
  }

  function WorkspaceGrantsWithPrefs(props: ChannelSidebarEntryProps): ReactElement {
    const developerMode = useSyncExternalStore(
      prefs?.source.subscribe ?? inactiveSubscribe,
      () => prefs?.source.getSnapshot().developerMode ?? false,
    );
    return <WorkspaceGrantsEntry {...props} developerMode={developerMode} />;
  }
  function SessionsHeader(props: ChannelSidebarEntryProps): ReactElement {
    return <SessionsHeaderWithSettings {...props} prefs={prefs} />;
  }
  function MemoryEvolutionEntry(props: ChannelSidebarEntryProps): ReactElement {
    return <MemoryEntry {...props} showFiles={false} />;
  }
  return [
    {
      id: 'memory-files',
      tab: 'memory',
      icon: 'files',
      label: t('entry.memoryFiles'),
      order: 5,
      scope: 'personabot',
      component: MemoryFilesEntry,
    },
    {
      id: 'memory-evolution',
      tab: 'memory',
      icon: 'git-branch',
      label: t('entry.memoryEvolution'),
      order: 6,
      scope: 'personabot',
      component: MemoryEvolutionEntry,
      headerAction: MemoryHeaderAction,
      headerLabel: t('entry.memory'),
      headerTabs: MemoryViewTabs,
    },
    {
      id: 'sessions',
      tab: 'conversation',
      icon: 'messages-square',
      label: t('entry.sessions'),
      order: 10,
      scope: 'personabot',
      component: SessionsWithNative,
      headerAction: SessionsHeader,
    },
    {
      id: 'bot-inbox',
      tab: 'conversation',
      icon: 'inbox',
      label: t('entry.botInbox'),
      order: 15,
      scope: 'personabot',
      component: BotInboxEntry,
      badge: BotInboxBadge,
      headerAction: BotInboxHeaderAction,
      visible: (state) =>
        state.botInbox.status === 'loading' ||
        state.botInbox.status === 'error' ||
        state.botInbox.items.length > 0,
    },
    {
      id: 'schedules',
      defaultHidden: true,
      icon: 'alarm-clock',
      label: t('entry.schedules'),
      order: 16,
      scope: 'personabot',
      component: BotSchedulesEntry,
      headerAction: BotSchedulesHeaderAction,
    },
    {
      id: 'workspace-grants',
      surface: 'settings',
      icon: 'folder-key',
      label: t('entry.workspaceGrants'),
      order: 20,
      scope: 'personabot',
      component: WorkspaceGrantsWithPrefs,
    },
    {
      id: 'model',
      surface: 'settings',
      icon: 'cpu',
      label: t('entry.model'),
      order: 25,
      scope: 'personabot',
      component: ModelEntry,
      badge: ModelBadge,
    },
    {
      id: 'wake-policy',
      surface: 'settings',
      icon: 'bell-ring',
      label: t('entry.wakePolicy'),
      order: 26,
      scope: 'personabot',
      component: WakePolicyEntry,
      badge: WakePolicyBadge,
    },
    {
      id: 'external-identities',
      surface: 'settings',
      icon: 'id-card',
      label: t('entry.externalIdentities'),
      order: 27,
      scope: 'personabot',
      component: ExternalIdentitiesEntry,
    },
    {
      id: 'external-connectors',
      surface: 'settings',
      icon: 'plug',
      label: t('entry.externalConnectors'),
      order: 28,
      scope: 'personabot',
      component: ExternalConnectorsEntry,
      attention: ExternalConnectorsAttention,
    },
    {
      id: 'private-accounts',
      surface: 'settings',
      icon: 'shield-check',
      label: t('entry.privateAccounts'),
      order: 29,
      scope: 'personabot',
      component: PrivateAccountsSection,
    },
    {
      id: 'group-work',
      icon: 'list-checks',
      label: t('entry.groupWork'),
      order: 5,
      scope: 'channel',
      component: GroupWorkEntry,
    },
    {
      id: 'members',
      icon: 'users',
      label: t('entry.members'),
      order: 10,
      scope: 'channel',
      component: MembersEntry,
      headerAction: MembersHeaderAction,
      badge: MembersBadge,
    },
    {
      id: 'group-wake-policy',
      surface: 'settings',
      icon: 'bell-ring',
      label: t('entry.wakePolicy'),
      order: 12,
      scope: 'channel',
      component: GroupWakePolicyEntry,
      visible: isGroupConversation,
    },
    {
      id: 'group-external-connectors',
      surface: 'settings',
      icon: 'plug',
      label: t('entry.externalConnectors'),
      order: 14,
      scope: 'channel',
      component: GroupConnectorsEntry,
      attention: GroupConnectorsAttention,
      visible: isGroupConversation,
    },
    {
      id: 'group-management',
      surface: 'settings',
      icon: 'settings-2',
      label: t('entry.groupManagement'),
      order: 20,
      scope: 'channel',
      component: GroupManagementEntry,
      headerAction: GroupManagementHeaderAction,
      visible: (state) => state.conversation.channel?.type === 'group',
    },
  ];
}
