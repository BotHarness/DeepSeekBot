import { GroupActivityRows } from './group-activity-rows.js';
import {
  composerSlashQuery,
  composerShortcutOptions,
  type ComposerContext,
  type ComposerSlashQuery,
  type ComposerShortcut,
} from './composer-shortcuts.js';
import type { AllBotPreview } from '../../../core/src/channels/all-bot-mention.js';
import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';

import {
  Button,
  FileTypeIcon,
  IconCheckOutlineRegular,
  IconCloseOutlineRegular,
  IconChevronDownOutlineRegular,
  IconPaperclipOutlineRegular,
  IconSendOutlineRegular,
  IconStopFillRegular,
  ImageLightbox,
  Tooltip,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { createPortal } from 'react-dom';
import type { PersonaBotSessionActivity } from '../../../core/src/state/tool-activity.js';

import {
  PersonaBotAvatar,
  PersonaBotFacepile,
  personaBotActivitySummary,
  personaBotPresentationSummary,
  type PersonaBotFacepileItem,
} from './avatar.js';
import {
  activeMentionQuery,
  deleteSelectedMention,
  rebaseMentions,
  selectMention,
  type MentionQuery,
  type SelectedMention,
} from './mentions.js';
import {
  insertRichPlainText,
  readRichMentionDraft,
  renderRichMentionDraft,
  richSelectionOffsets,
  sameRichMentionDraft,
  setRichSelection,
  type MentionAvatarMount,
} from './rich-mention-editor.js';
import { botNameSource, paintBotName } from './bot-primary-color.js';
import type { BotSummary, ChannelSummary } from './store.js';
import {
  activeChannelRefQuery,
  deleteSelectedChannelRef,
  rebaseChannelRefs,
  selectChannelRef,
  type ChannelRefQuery,
  type SelectedChannelRef,
} from './channel-refs.js';
import type { ChannelAttachmentRef } from './store.js';
import { deleteAttachmentReference, insertAttachmentReferences } from './attachment-refs.js';
import type { ComposerSendKey } from './composer-send-key.js';

function sessionLatestSummary(session: PersonaBotSessionActivity, t: BotHarnessTranslate): string {
  if (session.activity === undefined) return personaBotActivitySummary(session.state, undefined, t);
  const { sources: _sources, ...activity } = session.activity;
  return personaBotActivitySummary(session.state, activity, t);
}

export interface ChannelComposerActivity {
  presentation?: 'group' | undefined;
  items: readonly PersonaBotFacepileItem[];
  summary: string;
}

import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { SessionRoleIcon } from './session-role-icon.js';

export interface ChannelComposerStop {
  label?: string | undefined;
  stopping: boolean;
  notice?: string | undefined;
  onStop(): void;
}

export interface ChannelComposerUpload {
  id: string;
  file: File;
  status: 'uploading' | 'ready' | 'error';
  ref?: ChannelAttachmentRef;
  error?: string | undefined;
  fileAvailable?: boolean;
}

export interface ChannelComposerProps {
  context?: ComposerContext | undefined;
  sendKey?: ComposerSendKey | undefined;
  value: string;
  placeholder: string;
  sending: boolean;
  focusSignal?: number;
  attachments?: readonly ChannelComposerUpload[] | undefined;
  onAddFiles?(files: File[], selection?: { start: number; end: number }): number | void;
  onRetryAttachment?(id: string): void;
  onRemoveAttachment?(id: string): void;
  onActivityOverlayResize?(height: number): void;
  activity?: ChannelComposerActivity | undefined;
  activityConcealed?: boolean | undefined;
  allBotNotice?: string | undefined;
  stop?: ChannelComposerStop | undefined;
  allBotPreview?: AllBotPreview | undefined;
  mentionCandidates?: readonly BotSummary[] | undefined;
  mentions?: readonly SelectedMention[] | undefined;
  channelCandidates?: readonly ChannelSummary[] | undefined;
  channelRefs?: readonly SelectedChannelRef[] | undefined;
  reply?: { id: string; author: string; body: string } | undefined;
  t?: BotHarnessTranslate | undefined;
  onChange(value: string, mentions?: SelectedMention[], channelRefs?: SelectedChannelRef[]): void;
  onCancelReply?(): void;
  onRecall?(direction: 'older' | 'newer'): boolean;
  onSubmit(): void | Promise<void>;
}

const IMAGE_ATTACHMENT_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/iu;

function isImageAttachment(file: File): boolean {
  return (
    file.type.toLocaleLowerCase().startsWith('image/') || IMAGE_ATTACHMENT_EXTENSION.test(file.name)
  );
}

function AttachmentUploadStatus({
  item,
  t,
  onRetry,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement | null {
  if (item.status === 'uploading') {
    return <span className="bh-composer-upload-status">{t('composer.uploading')}</span>;
  }
  if (item.status !== 'error') return null;
  if (item.fileAvailable === false) {
    return (
      <span className="bh-composer-upload-status">{t('composer.draftAttachmentUnavailable')}</span>
    );
  }
  return (
    <button type="button" className="bh-composer-upload-retry" onClick={onRetry} title={item.error}>
      {t('composer.retryAttachment')}
    </button>
  );
}

function ComposerAttachmentCopy({
  item,
  t,
  onRetry,
}: {
  item: ChannelComposerUpload;
  t: BotHarnessTranslate;
  onRetry: () => void;
}): ReactElement {
  return (
    <span className="bh-composer-file-copy">
      <span className="bh-composer-attachment-name" title={item.file.name}>
        {item.file.name}
      </span>
      <span className="bh-composer-attachment-size">
        {item.status === 'ready' ? (
          fileSizeText(item.ref?.size ?? item.file.size)
        ) : (
          <AttachmentUploadStatus item={item} t={t} onRetry={onRetry} />
        )}
      </span>
    </span>
  );
}

function ComposerImageAttachment({
  item,
  ordinal,
  t,
  onRetry,
  onRemove,
  onReference,
  sending,
}: {
  item: ChannelComposerUpload;
  ordinal: number;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
  onReference: () => void;
  sending: boolean;
}): ReactElement {
  const [source, setSource] = useState<string>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const sourceMount = useMountedResource<HTMLDivElement>(() => {
    if (item.fileAvailable === false) {
      setSource(undefined);
      return;
    }
    if (typeof URL.createObjectURL !== 'function') return;
    const nextSource = URL.createObjectURL(item.file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [item.file]);
  const previewLabel = t('composer.previewAttachment', { name: item.file.name });

  return (
    <>
      <div
        ref={sourceMount}
        className="bh-composer-attachment-card bh-composer-image-attachment"
        data-status={item.status}
        data-attachment-card={item.id}
        aria-busy={item.status === 'uploading'}
      >
        <button
          type="button"
          className="bh-composer-attachment-reference bh-composer-image-reference"
          aria-label={t('composer.referenceAttachment', { name: item.file.name })}
          disabled={sending}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReference}
        >
          {ordinal}
        </button>
        <button
          type="button"
          className="bh-composer-image-preview"
          aria-label={previewLabel}
          aria-haspopup="dialog"
          disabled={source === undefined}
          onClick={() => setPreviewOpen(true)}
        >
          {source === undefined ? null : (
            <img src={source} alt={item.file.name} draggable={false} />
          )}
        </button>
        <ComposerAttachmentCopy item={item} t={t} onRetry={onRetry} />
        <button
          type="button"
          className="bh-composer-attachment-remove bh-composer-image-remove"
          aria-label={t('composer.removeAttachment', { name: item.file.name })}
          onClick={onRemove}
        >
          <IconCloseOutlineRegular size={14} />
        </button>
      </div>
      {previewOpen && source !== undefined ? (
        <ImageLightbox
          src={source}
          alt={item.file.name}
          labels={{ dialog: previewLabel, close: t('common.close') }}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}

function ComposerFileAttachment({
  item,
  ordinal,
  t,
  onRetry,
  onRemove,
  onReference,
  sending,
}: {
  item: ChannelComposerUpload;
  ordinal: number;
  t: BotHarnessTranslate;
  onRetry: () => void;
  onRemove: () => void;
  onReference: () => void;
  sending: boolean;
}): ReactElement {
  return (
    <div
      className="bh-composer-attachment-card bh-composer-file-attachment"
      data-status={item.status}
      data-attachment-card={item.id}
      aria-busy={item.status === 'uploading'}
    >
      <span className="bh-composer-file-icon" aria-hidden="true">
        <FileTypeIcon path={item.file.name} size={24} />
      </span>
      <ComposerAttachmentCopy item={item} t={t} onRetry={onRetry} />
      <button
        type="button"
        className="bh-composer-attachment-reference bh-composer-file-reference"
        aria-label={t('composer.referenceAttachment', { name: item.file.name })}
        disabled={sending}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onReference}
      >
        {ordinal}
      </button>
      <button
        type="button"
        className="bh-composer-attachment-remove"
        aria-label={t('composer.removeAttachment', { name: item.file.name })}
        onClick={onRemove}
      >
        <IconCloseOutlineRegular size={14} />
      </button>
    </div>
  );
}

export function shouldSubmitComposerKey(
  event: Pick<KeyboardEvent<HTMLElement>, 'key' | 'shiftKey' | 'nativeEvent'> &
    Partial<Pick<KeyboardEvent<HTMLElement>, 'ctrlKey' | 'metaKey'>>,
  sendKey: ComposerSendKey = 'enter',
): boolean {
  return (
    event.key === 'Enter' &&
    !event.shiftKey &&
    (sendKey === 'enter' || event.ctrlKey === true || event.metaKey === true) &&
    !event.nativeEvent.isComposing &&
    event.nativeEvent.keyCode !== 229
  );
}

export interface ComposerTextareaFit {
  expanded: boolean;
  height: number;
}

function compactComposerScrollHeight(element: HTMLElement, currentHeight: number): number {
  const composer = element.closest<HTMLElement>('.bh-composer');
  if (!composer?.classList.contains('bh-composer-with-footer')) return currentHeight;
  const style = getComputedStyle(composer);
  const left = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-left'));
  const right = Number.parseFloat(style.getPropertyValue('--bh-composer-compact-padding-right'));
  const compactWidth = composer.clientWidth - left - right;
  if (!Number.isFinite(compactWidth) || compactWidth <= 0) return currentHeight;

  const mirror = element.cloneNode(true) as HTMLElement;
  if (element instanceof HTMLTextAreaElement && mirror instanceof HTMLTextAreaElement)
    mirror.value = element.value;
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.width = compactWidth + 'px';
  mirror.style.height = '0px';
  mirror.style.minHeight = '0px';
  mirror.style.maxHeight = 'none';
  mirror.style.overflow = 'hidden';
  mirror.style.transition = 'none';
  composer.append(mirror);
  const compactHeight = mirror.scrollHeight;
  mirror.remove();
  return compactHeight;
}

export function fitComposerTextarea(
  element: Pick<HTMLElement, 'scrollHeight' | 'style'>,
  maxHeight = 144,
  singleLineHeight = 34,
): ComposerTextareaFit {
  element.style.height = '0px';
  const scrollHeight = element.scrollHeight;
  const height = Math.min(scrollHeight, maxHeight);
  element.style.height = `${height}px`;
  element.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  const compactHeight =
    scrollHeight <= singleLineHeight &&
    typeof HTMLElement !== 'undefined' &&
    element instanceof HTMLElement
      ? compactComposerScrollHeight(element, scrollHeight)
      : scrollHeight;
  return { expanded: compactHeight > singleLineHeight, height };
}

function PersonaBotActivityStatus({
  activity,
  concealed = false,
  t,
  onResize,
}: {
  activity: ChannelComposerActivity | undefined;
  concealed?: boolean | undefined;
  t: BotHarnessTranslate;
  onResize?: ((height: number) => void) | undefined;
}): ReactElement | null {
  const disclosure = useRef<HTMLDetailsElement | null>(null);
  const overlayMount = useMountedResource<HTMLDetailsElement>(
    (element) => {
      disclosure.current = element;
      if (onResize === undefined)
        return () => {
          disclosure.current = null;
        };
      onResize(element.getBoundingClientRect().height);
      const observer = new ResizeObserver(() => onResize(element.getBoundingClientRect().height));
      observer.observe(element);
      return () => {
        observer.disconnect();
        disclosure.current = null;
        onResize(0);
      };
    },
    [onResize],
  );
  if (activity === undefined || activity.items.length === 0) return null;

  return (
    <details
      ref={overlayMount}
      className="bh-composer-activity-status"
      data-concealed={concealed ? 'true' : undefined}
    >
      <summary className="bh-composer-activity-toggle">
        <PersonaBotFacepile
          t={t}
          className="bh-composer-activity-facepile"
          indicator={false}
          items={activity.items}
          renderAvatar={
            activity.presentation === 'group'
              ? (item, avatar) => {
                  const label =
                    item.name +
                    ' · ' +
                    personaBotPresentationSummary(
                      item.state ?? 'idle',
                      item.activity,
                      item.attention,
                      t,
                    );
                  return (
                    <Tooltip key={item.personaBotId} label={label} side="top" portal delayMs={350}>
                      <button
                        type="button"
                        className="bh-avatar-facepile-button"
                        aria-label={label}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (disclosure.current !== null)
                            disclosure.current.open = !disclosure.current.open;
                        }}
                      >
                        {avatar}
                      </button>
                    </Tooltip>
                  );
                }
              : undefined
          }
          size={28}
        />
        <span className="bh-composer-activity-summary" role="status" aria-live="polite">
          {activity.summary}
        </span>
        <IconChevronDownOutlineRegular className="bh-composer-activity-chevron" size={14} />
      </summary>
      <ul className="bh-composer-activity-details" aria-label={activity.summary}>
        {activity.presentation === 'group' ? (
          <GroupActivityRows items={activity.items} t={t} />
        ) : (
          activity.items.flatMap((item) =>
            item.sessions !== undefined
              ? item.sessions.map((session) => {
                  const roleLabel = t(`activity.source.${session.role}`);
                  const label =
                    session.role === 'orchestrator'
                      ? roleLabel
                      : (session.name ?? t('activity.session.untitled'));
                  const latest = sessionLatestSummary(session, t);
                  return (
                    <li className="bh-composer-activity-session" key={session.id}>
                      {activity.items.length > 1 && (
                        <PersonaBotAvatar
                          personaBotId={item.personaBotId}
                          name={item.name}
                          src={item.src}
                          appearance={item.appearance}
                          avatarSeed={item.avatarSeed}
                          state={session.state}
                          size={20}
                          t={t}
                        />
                      )}
                      <SessionRoleIcon role={session.role} label={roleLabel} />
                      <span className="bh-composer-activity-source-label" title={label}>
                        {label}
                      </span>
                      <span
                        className="bh-composer-activity-session-latest"
                        role="status"
                        title={latest}
                      >
                        {latest}
                      </span>
                      <time dateTime={new Date(session.at).toISOString()}>
                        {new Date(session.at).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </li>
                  );
                })
              : [
                  <li className="bh-composer-activity-session" key={item.personaBotId}>
                    {activity.items.length > 1 && (
                      <PersonaBotAvatar
                        personaBotId={item.personaBotId}
                        name={item.name}
                        src={item.src}
                        appearance={item.appearance}
                        avatarSeed={item.avatarSeed}
                        state={item.state}
                        size={20}
                        t={t}
                      />
                    )}
                    <span className="bh-composer-activity-session-latest">
                      {personaBotActivitySummary(item.state ?? 'idle', item.activity, t)}
                    </span>
                  </li>,
                ],
          )
        )}
      </ul>
    </details>
  );
}

export function ChannelComposer({
  context,
  sendKey = 'enter',
  value,
  placeholder,
  sending,
  focusSignal = 0,
  attachments = [],
  onAddFiles,
  onRetryAttachment,
  onRemoveAttachment,
  onActivityOverlayResize,
  activity,
  activityConcealed = false,
  allBotNotice,
  stop,
  allBotPreview,
  mentionCandidates = [],
  mentions = [],
  channelCandidates = [],
  channelRefs = [],
  reply,
  t = zhTranslate,
  onChange,
  onCancelReply,
  onRecall,
  onSubmit,
}: ChannelComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const richRef = useRef<HTMLDivElement | null>(null);
  const requestedCaret = useRef<number | undefined>(undefined);
  const renderedAvatarKey = useRef('');
  const [avatarMounts, setAvatarMounts] = useState<MentionAvatarMount[]>([]);
  const [attachmentMounts, setAttachmentMounts] = useState<
    Array<{ target: HTMLElement; name: string }>
  >([]);
  const savedFileSelection = useRef<{ start: number; end: number } | undefined>(undefined);
  const selectionOffsets = (): { start: number; end: number } | undefined => {
    if (richRef.current !== null) return richSelectionOffsets(richRef.current);
    const textarea = textareaRef.current;
    return textarea === null
      ? undefined
      : { start: textarea.selectionStart, end: textarea.selectionEnd };
  };
  const rich =
    attachments.length > 0 ||
    allBotPreview !== undefined ||
    mentionCandidates.length > 0 ||
    mentions.length > 0 ||
    channelCandidates.length > 0 ||
    channelRefs.length > 0;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | undefined>();
  const [channelQuery, setChannelQuery] = useState<ChannelRefQuery | undefined>();
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<ComposerSlashQuery>();
  const slashTarget = useRef<string | undefined>(undefined);
  const [shortcutIndex, setShortcutIndex] = useState(0);
  const shortcutOptions = composerShortcutOptions(
    context?.shortcuts ?? [],
    slashTarget.current === context?.target ? slashQuery : undefined,
  );
  const hasShortcutArgument =
    slashTarget.current === context?.target &&
    slashQuery?.argument !== undefined &&
    context?.shortcuts.some(
      (shortcut) => shortcut.id === slashQuery.filter && shortcut.choices !== undefined,
    ) === true;
  const clearShortcut = (): void => {
    if (slashQuery === undefined) return;
    const next = value.slice(0, slashQuery.start) + value.slice(slashQuery.end);
    requestedCaret.current = slashQuery.start;
    onChange(
      next,
      rebaseMentions(value, next, mentions),
      rebaseChannelRefs(value, next, channelRefs),
    );
    setSlashQuery(undefined);
  };
  const chooseShortcut = (shortcut: ComposerShortcut): void => {
    if (shortcut.disabled) return;
    clearShortcut();
    shortcut.run();
  };
  const botCandidates =
    mentionQuery === undefined
      ? []
      : mentionCandidates
          .filter(
            (bot) =>
              !bot.paused &&
              !bot.deleted &&
              (bot.displayName
                .toLocaleLowerCase()
                .includes(mentionQuery.query.toLocaleLowerCase()) ||
                bot.slug.toLocaleLowerCase().includes(mentionQuery.query.toLocaleLowerCase())),
          )
          .slice(0, 8);
  const allBotLabel = t('composer.allBots');
  const offerAll =
    allBotPreview !== undefined &&
    mentionQuery !== undefined &&
    !mentions.some((item) => item.kind === 'all-bots') &&
    [allBotLabel.toLocaleLowerCase(), 'all', '所有'].some((name) =>
      name.includes(mentionQuery.query.toLocaleLowerCase()),
    );
  const candidates: Array<BotSummary | { preview: AllBotPreview }> = offerAll
    ? [{ preview: allBotPreview }, ...botCandidates]
    : botCandidates;
  const channelOptions =
    channelQuery === undefined
      ? []
      : channelCandidates
          .filter((channel) =>
            channel.name.toLocaleLowerCase().includes(channelQuery.query.toLocaleLowerCase()),
          )
          .slice(0, 8);
  const chooseChannel = (channel: ChannelSummary): void => {
    if (channelQuery === undefined) return;
    const selected = selectChannelRef(value, channelRefs, channelQuery, channel.id, channel.name);
    onChange(selected.value, rebaseMentions(value, selected.value, mentions), selected.refs);
    setChannelQuery(undefined);
    requestedCaret.current = selected.caret;
    requestAnimationFrame(() => {
      const editor = richRef.current;
      if (editor !== null) {
        editor.focus();
        setRichSelection(editor, selected.caret);
      }
    });
  };
  const chooseMention = (bot: BotSummary | { preview: AllBotPreview }): void => {
    if (mentionQuery === undefined) return;
    if ('preview' in bot && bot.preview.recipients.length === 0) return;
    const selected =
      'preview' in bot
        ? selectMention(value, mentions, mentionQuery, '', allBotLabel)
        : selectMention(value, mentions, mentionQuery, bot.slug, bot.displayName);
    if ('preview' in bot)
      selected.mentions = selected.mentions.map((item) =>
        item.botSlug === ''
          ? {
              kind: 'all-bots',
              label: item.label,
              start: item.start,
              end: item.end,
              preview: bot.preview,
            }
          : item,
      );
    onChange(
      selected.value,
      selected.mentions,
      rebaseChannelRefs(value, selected.value, channelRefs),
    );
    setMentionQuery(undefined);
    requestedCaret.current = selected.caret;
    requestAnimationFrame(() => {
      const editor = richRef.current;
      if (editor !== null) {
        editor.focus();
        setRichSelection(editor, selected.caret);
      } else {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(selected.caret, selected.caret);
      }
    });
  };
  const addFilesAtSelection = (files: File[], selection = selectionOffsets()): void => {
    const caret = onAddFiles?.(files, selection);
    if (caret === undefined) return;
    requestedCaret.current = caret;
    requestAnimationFrame(() => {
      richRef.current?.focus();
      if (richRef.current !== null) setRichSelection(richRef.current, caret);
    });
  };
  const handleFilePaste = (event: ClipboardEvent<HTMLElement>): boolean => {
    const clipboard = event.clipboardData;
    const files = Array.from(clipboard.files);
    const unmatchedFiles = [...files];
    for (const item of Array.from(clipboard.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file === null) continue;
      const existingIndex = unmatchedFiles.findIndex(
        (existing) =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.type === file.type &&
          existing.lastModified === file.lastModified,
      );
      if (existingIndex < 0) files.push(file);
      else unmatchedFiles.splice(existingIndex, 1);
    }
    if (files.length === 0 || onAddFiles === undefined || sending) return false;
    event.preventDefault();
    event.stopPropagation();
    addFilesAtSelection(files);
    return true;
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fit, setFit] = useState<ComposerTextareaFit & { animateFirstExpand: boolean }>({
    expanded: false,
    height: 34,
    animateFirstExpand: false,
  });
  const hasFooter = fit.expanded || reply !== undefined || attachments.length > 0;

  const syncTextarea = useCallback((element: HTMLElement): void => {
    const nextFit = fitComposerTextarea(element);
    setFit((current) => {
      if (current.expanded === nextFit.expanded && current.height === nextFit.height) {
        return current;
      }
      return {
        ...nextFit,
        animateFirstExpand: !current.expanded && nextFit.expanded,
      };
    });
  }, []);

  const avatarKey = mentions
    .map((mention) => {
      const bot = mentionCandidates.find((candidate) => candidate.slug === mention.botSlug);
      return [mention.botSlug, bot?.displayName, bot?.avatar, botNameSource(bot)].join(':');
    })
    .join('|');
  const attachmentKey = attachments
    .map((item) =>
      [
        item.id,
        item.status,
        item.ref?.fileId,
        item.ref?.hash,
        item.ref?.size,
        item.file.name,
        item.file.size,
      ].join(':'),
    )
    .join('|');
  const renderedAttachmentKey = useRef('');
  const referenceAttachment = (item: ChannelComposerUpload): void => {
    const selected = insertAttachmentReferences(value, [item], selectionOffsets());
    requestedCaret.current = selected.caret;
    onChange(
      selected.value,
      rebaseMentions(value, selected.value, mentions),
      rebaseChannelRefs(value, selected.value, channelRefs),
    );
    setMentionQuery(undefined);
    setChannelQuery(undefined);
    requestAnimationFrame(() => {
      richRef.current?.focus();
      if (richRef.current !== null) setRichSelection(richRef.current, selected.caret);
    });
  };
  const richMount = useMountedResource<HTMLDivElement>(
    (editor) => {
      richRef.current = editor;
      const current = readRichMentionDraft(editor);
      if (
        sameRichMentionDraft(current, value, mentions, channelRefs) &&
        renderedAvatarKey.current === avatarKey &&
        renderedAttachmentKey.current === attachmentKey
      )
        return () => {
          richRef.current = null;
        };
      const caret =
        requestedCaret.current ??
        (editor.ownerDocument.activeElement === editor
          ? richSelectionOffsets(editor)?.end
          : undefined);
      const mounts = renderRichMentionDraft(
        editor,
        value,
        mentions,
        mentionCandidates,
        channelRefs,
        attachments,
      );
      setAvatarMounts(mounts);
      setAttachmentMounts(
        Array.from(editor.querySelectorAll<HTMLElement>('[data-attachment-icon]')).flatMap(
          (target) => {
            const item = attachments.find(
              (candidate) => candidate.id === target.dataset.attachmentIcon,
            );
            return item === undefined ? [] : [{ target, name: item.file.name }];
          },
        ),
      );
      renderedAvatarKey.current = avatarKey;
      renderedAttachmentKey.current = attachmentKey;
      requestedCaret.current = undefined;
      if (caret !== undefined) setRichSelection(editor, Math.min(caret, value.length));
      syncTextarea(editor);
      return () => {
        richRef.current = null;
      };
    },
    [
      value,
      mentions,
      channelRefs,
      mentionCandidates,
      channelCandidates,
      avatarKey,
      attachmentKey,
      syncTextarea,
    ],
  );
  const textareaMount = useMountedResource<HTMLTextAreaElement>(
    (element) => {
      textareaRef.current = element;
      setAvatarMounts((current) => (current.length === 0 ? current : []));
      setAttachmentMounts((current) => (current.length === 0 ? current : []));
      syncTextarea(element);
      return () => {
        textareaRef.current = null;
      };
    },
    [syncTextarea, value],
  );
  const replyId = reply?.id;
  const bodyMount = useMountedResource<HTMLDivElement>(
    (body) => {
      const element = body.querySelector<HTMLElement>('.bh-composer-input');
      if (replyId !== undefined || focusSignal > 0) element?.focus();
      if (focusSignal > 0 && element !== null && element === richRef.current)
        setRichSelection(element, readRichMentionDraft(element).value.length);
      else if (focusSignal > 0 && element instanceof HTMLTextAreaElement)
        element.setSelectionRange(element.value.length, element.value.length);
      if (element === null || typeof ResizeObserver === 'undefined') return;

      let width = element.clientWidth;
      const observer = new ResizeObserver(([entry]) => {
        const nextWidth = entry?.contentRect.width;
        if (nextWidth === undefined || nextWidth === width) return;
        width = nextWidth;
        syncTextarea(element);
      });
      observer.observe(element);
      return () => observer.disconnect();
    },
    [syncTextarea, rich, replyId, focusSignal],
  );

  const emitRichChange = (editor: HTMLDivElement): void => {
    if (editor.innerHTML === '<br>') editor.replaceChildren();
    const next = readRichMentionDraft(editor);
    syncTextarea(editor);
    onChange(next.value, next.mentions, next.channelRefs);
    const caret = richSelectionOffsets(editor)?.end ?? next.value.length;
    slashTarget.current = context?.target;
    setSlashQuery(context === undefined ? undefined : composerSlashQuery(next.value, caret));
    setShortcutIndex(0);
    setMentionQuery(activeMentionQuery(next.value, caret, next.mentions));
    setChannelQuery(activeChannelRefQuery(next.value, caret, next.channelRefs));
    setActiveMentionIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (
      hasShortcutArgument &&
      shortcutOptions.length === 0 &&
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      return;
    }
    if (shortcutOptions.length > 0 && !event.nativeEvent.isComposing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearShortcut();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setShortcutIndex(
          (current) =>
            (current + (event.key === 'ArrowDown' ? 1 : -1) + shortcutOptions.length) %
            shortcutOptions.length,
        );
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const shortcut = shortcutOptions[shortcutIndex % shortcutOptions.length];
        if (shortcut !== undefined) chooseShortcut(shortcut);
        return;
      }
    }
    const input = event.currentTarget;
    const selection =
      input instanceof HTMLTextAreaElement
        ? { start: input.selectionStart, end: input.selectionEnd }
        : richSelectionOffsets(input);
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.nativeEvent.isComposing &&
      selection !== undefined
    ) {
      const deleted = deleteAttachmentReference(value, attachments, selection, event.key);
      if (deleted !== undefined) {
        event.preventDefault();
        requestedCaret.current = deleted.caret;
        onChange(
          deleted.value,
          rebaseMentions(value, deleted.value, mentions),
          rebaseChannelRefs(value, deleted.value, channelRefs),
        );
        setMentionQuery(undefined);
        setChannelQuery(undefined);
        return;
      }
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.nativeEvent.isComposing &&
      selection !== undefined
    ) {
      const deleted = deleteSelectedMention(
        value,
        mentions,
        selection.start,
        selection.end,
        event.key,
      );
      if (deleted !== undefined) {
        event.preventDefault();
        requestedCaret.current = deleted.caret;
        onChange(
          deleted.value,
          deleted.mentions,
          rebaseChannelRefs(value, deleted.value, channelRefs),
        );
        setMentionQuery(undefined);
        setChannelQuery(undefined);
        if (input instanceof HTMLTextAreaElement)
          requestAnimationFrame(() => input.setSelectionRange(deleted.caret, deleted.caret));
        return;
      }
    }
    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !event.nativeEvent.isComposing &&
      selection !== undefined
    ) {
      const deleted = deleteSelectedChannelRef(
        value,
        channelRefs,
        selection.start,
        selection.end,
        event.key,
      );
      if (deleted !== undefined) {
        event.preventDefault();
        requestedCaret.current = deleted.caret;
        onChange(deleted.value, rebaseMentions(value, deleted.value, mentions), deleted.refs);
        setMentionQuery(undefined);
        setChannelQuery(undefined);
        return;
      }
    }
    if (channelQuery !== undefined && channelOptions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + channelOptions.length) %
            channelOptions.length,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        chooseChannel(channelOptions[activeMentionIndex] ?? channelOptions[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setChannelQuery(undefined);
        return;
      }
    }
    if (mentionQuery !== undefined && candidates.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        chooseMention(candidates[activeMentionIndex] ?? candidates[0]!);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(undefined);
        return;
      }
    }
    if (event.key === 'Escape' && reply !== undefined) {
      event.preventDefault();
      onCancelReply?.();
      return;
    }
    if (
      input instanceof HTMLDivElement &&
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229 &&
      !shouldSubmitComposerKey(event, sendKey)
    ) {
      event.preventDefault();
      insertRichPlainText(input, '\n');
      emitRichChange(input);
      return;
    }
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      !event.nativeEvent.isComposing &&
      !event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      onRecall?.(event.key === 'ArrowUp' ? 'older' : 'newer') === true
    ) {
      event.preventDefault();
      return;
    }
    if (!shouldSubmitComposerKey(event, sendKey)) return;
    if (mentions.some((item) => item.kind === 'all-bots' && item.preview.recipients.length === 0)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    void onSubmit();
  };

  return (
    <div className="bh-composer-shell" data-bh-tour="composer">
      {allBotNotice === undefined ? null : (
        <div className="bh-muted" role="status">
          {allBotNotice}
        </div>
      )}
      {stop?.notice === undefined ? null : (
        <div className="bh-muted" role="status">
          {stop.notice}
        </div>
      )}
      {channelQuery !== undefined && channelOptions.length > 0 ? (
        <div className="bh-mention-picker" role="listbox" aria-label="Reference a Group Channel">
          {channelOptions.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
              role="option"
              aria-selected={index === activeMentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseChannel(candidate)}
            >
              <span className="bh-mention-option-copy">
                <strong>#{candidate.name}</strong>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {shortcutOptions.length === 0 ? null : (
        <div
          className="bh-composer-shortcuts"
          role="menu"
          aria-label={t('composerContext.actions')}
        >
          {shortcutOptions.map((shortcut, index) => (
            <button
              key={shortcut.key ?? shortcut.id}
              ref={(node) => {
                if (index === shortcutIndex % shortcutOptions.length)
                  node?.scrollIntoView?.({ block: 'nearest' });
              }}
              type="button"
              role="menuitem"
              disabled={shortcut.disabled}
              aria-label={
                shortcut.reason === undefined
                  ? shortcut.label
                  : `${shortcut.label} · ${shortcut.reason}`
              }
              data-active={index === shortcutIndex % shortcutOptions.length ? 'true' : undefined}
              data-selected={shortcut.selected ? 'true' : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseShortcut(shortcut)}
            >
              <span className="bh-composer-shortcut-label">
                {shortcut.icon}
                {shortcut.label}
                {shortcut.reason === undefined ? null : <small> · {shortcut.reason}</small>}
              </span>
              {shortcut.key === undefined ? (
                <small>/{shortcut.id}</small>
              ) : shortcut.selected ? (
                <IconCheckOutlineRegular size={16} />
              ) : null}
            </button>
          ))}
        </div>
      )}
      {mentionQuery !== undefined && candidates.length > 0 ? (
        <div className="bh-mention-picker" role="listbox" aria-label="Mention a PersonaBot">
          {candidates.map((candidate, index) =>
            'preview' in candidate ? (
              <button
                key="all-bots"
                type="button"
                className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
                role="option"
                aria-selected={index === activeMentionIndex}
                disabled={candidate.preview.recipients.length === 0}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseMention(candidate)}
              >
                <span className="bh-mention-option-copy">
                  <strong>@{allBotLabel}</strong>
                  <small>{t('composer.allBotsScope')}</small>
                </span>
                <small className="bh-mention-option-id">
                  {t('composer.allBotsCount', { count: candidate.preview.recipients.length })}
                </small>
              </button>
            ) : (
              <button
                key={candidate.slug}
                type="button"
                className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
                role="option"
                aria-selected={index === activeMentionIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseMention(candidate)}
              >
                <PersonaBotAvatar
                  personaBotId={candidate.slug}
                  name={candidate.displayName}
                  src={candidate.avatar}
                  appearance={candidate.appearance}
                  avatarSeed={candidate.avatarSeed}
                  size={28}
                  indicator={false}
                  t={t}
                />
                <span className="bh-mention-option-copy">
                  <strong ref={(element) => paintBotName(element, botNameSource(candidate))}>
                    {candidate.displayName}
                  </strong>
                  {candidate.roles.length > 0 ? <small>{candidate.roles.join(' · ')}</small> : null}
                </span>
              </button>
            ),
          )}
        </div>
      ) : null}
      <PersonaBotActivityStatus
        activity={activity}
        concealed={activityConcealed}
        t={t}
        onResize={onActivityOverlayResize}
      />
      <div
        className={`bh-composer ${fit.expanded ? 'bh-composer-expanded' : 'bh-composer-compact'}${fit.animateFirstExpand ? ' bh-composer-first-expand' : ''}${reply === undefined ? '' : ' bh-composer-replying'}${hasFooter ? ' bh-composer-with-footer' : ''}`}
        data-layout={fit.expanded ? 'expanded' : 'compact'}
        style={{ '--bh-composer-body-height': `${fit.height}px` } as CSSProperties}
      >
        {reply === undefined ? null : (
          <div className="bh-composer-reply">
            <div className="bh-composer-reply-copy">
              <span className="bh-composer-reply-author">
                {t('message.replyingTo', { author: reply.author })}
              </span>
              <span className="bh-composer-reply-body">{reply.body}</span>
            </div>
            <button
              type="button"
              className="bh-composer-reply-cancel"
              aria-label={t('message.replyCancel')}
              onClick={onCancelReply}
            >
              &times;
            </button>
          </div>
        )}
        {attachments.length > 0 ? (
          <div className="bh-composer-attachments" aria-live="polite">
            {attachments.map((item, index) =>
              isImageAttachment(item.file) ? (
                <ComposerImageAttachment
                  key={item.id}
                  item={item}
                  ordinal={index + 1}
                  t={t}
                  onRetry={() => onRetryAttachment?.(item.id)}
                  onRemove={() => onRemoveAttachment?.(item.id)}
                  onReference={() => referenceAttachment(item)}
                  sending={sending}
                />
              ) : (
                <ComposerFileAttachment
                  key={item.id}
                  item={item}
                  ordinal={index + 1}
                  t={t}
                  onRetry={() => onRetryAttachment?.(item.id)}
                  onRemove={() => onRemoveAttachment?.(item.id)}
                  onReference={() => referenceAttachment(item)}
                  sending={sending}
                />
              ),
            )}
          </div>
        ) : null}
        <div ref={bodyMount} className="bh-composer-body">
          {rich ? (
            <div
              ref={richMount}
              className="bh-composer-input bh-composer-rich-input"
              role="textbox"
              aria-label={placeholder}
              aria-multiline="true"
              aria-disabled={sending}
              data-placeholder={placeholder}
              contentEditable={!sending}
              suppressContentEditableWarning
              onClick={(event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const badge = target.closest<HTMLElement>('[data-attachment-id]');
                if (badge === null) return;
                const card = Array.from(
                  event.currentTarget
                    .closest('.bh-composer')
                    ?.querySelectorAll<HTMLElement>('[data-attachment-card]') ?? [],
                ).find((item) => item.dataset.attachmentCard === badge.dataset.attachmentId);
                card?.querySelector<HTMLButtonElement>('button')?.focus();
              }}
              onInput={(event) => emitRichChange(event.currentTarget)}
              onPasteCapture={(event) => {
                if (handleFilePaste(event)) return;
                event.preventDefault();
                insertRichPlainText(
                  event.currentTarget,
                  event.clipboardData.getData('text/plain').replace(/\r\n?/gu, '\n'),
                );
                emitRichChange(event.currentTarget);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const text = event.dataTransfer.getData('text/plain');
                if (text.length > 0) {
                  insertRichPlainText(event.currentTarget, text.replace(/\r\n?/gu, '\n'));
                  emitRichChange(event.currentTarget);
                }
              }}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <textarea
              ref={textareaMount}
              className="bh-composer-input"
              rows={1}
              placeholder={placeholder}
              value={value}
              disabled={sending}
              onChange={(event) => {
                syncTextarea(event.currentTarget);
                const next = event.target.value;
                slashTarget.current = context?.target;
                setSlashQuery(
                  context === undefined
                    ? undefined
                    : composerSlashQuery(next, event.currentTarget.selectionStart),
                );
                setShortcutIndex(0);
                const nextMentions = rebaseMentions(value, next, mentions);
                const nextRefs = rebaseChannelRefs(value, next, channelRefs);
                onChange(next, nextMentions, nextRefs);
                setMentionQuery(
                  activeMentionQuery(next, event.currentTarget.selectionStart, nextMentions),
                );
                setChannelQuery(
                  activeChannelRefQuery(next, event.currentTarget.selectionStart, nextRefs),
                );
                setActiveMentionIndex(0);
              }}
              onPasteCapture={(event) => {
                handleFilePaste(event);
              }}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
        {avatarMounts.map((mount, index) =>
          createPortal(
            <PersonaBotAvatar
              personaBotId={mount.botSlug}
              name={mount.name}
              src={mount.src}
              appearance={mount.appearance}
              avatarSeed={mount.avatarSeed}
              size={16}
              indicator={false}
              t={t}
            />,
            mount.target,
            `${mount.botSlug}-${index}`,
          ),
        )}
        {attachmentMounts.map((mount, index) =>
          createPortal(
            <FileTypeIcon path={mount.name} size={16} />,
            mount.target,
            `attachment-${index}`,
          ),
        )}
        <input
          ref={fileInputRef}
          className="bh-composer-file-input"
          type="file"
          multiple
          aria-label={t('composer.addAttachment')}
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0)
              addFilesAtSelection(files, savedFileSelection.current ?? selectionOffsets());
            savedFileSelection.current = undefined;
          }}
        />
        <button
          type="button"
          className="bh-composer-add-file"
          aria-label={t('composer.addAttachment')}
          disabled={sending || attachments.length >= 10}
          onMouseDown={() => {
            savedFileSelection.current = selectionOffsets();
          }}
          onClick={() => {
            savedFileSelection.current ??= selectionOffsets();
            fileInputRef.current?.click();
          }}
        >
          <IconPaperclipOutlineRegular size={16} />
        </button>
        <div className="bh-composer-footer">
          {stop?.label !== undefined &&
          value.trim().length === 0 &&
          attachments.length === 0 &&
          shortcutOptions.length === 0 ? (
            <Tooltip label={stop.label} side="top" portal delayMs={350}>
              <Button
                className="bh-send-btn bh-stop-btn"
                variant="primary"
                size="sm"
                icon={<IconStopFillRegular size={14} />}
                aria-label={stop.stopping ? t('composer.stopping') : stop.label}
                aria-busy={stop.stopping || undefined}
                disabled={stop.stopping}
                onClick={stop.onStop}
              />
            </Tooltip>
          ) : (
            <Button
              className="bh-send-btn"
              variant="primary"
              size="sm"
              icon={<IconSendOutlineRegular size={16} />}
              aria-label={sending ? t('message.sending') : t('composer.send')}
              disabled={
                (value.trim().length === 0 && attachments.length === 0) ||
                sending ||
                mentions.some(
                  (item) => item.kind === 'all-bots' && item.preview.recipients.length === 0,
                ) ||
                attachments.length > 10 ||
                attachments.some((item) => item.status !== 'ready')
              }
              onClick={() => {
                if (shortcutOptions.length > 0) {
                  const shortcut = shortcutOptions[shortcutIndex % shortcutOptions.length];
                  if (shortcut !== undefined) chooseShortcut(shortcut);
                } else if (!hasShortcutArgument) void onSubmit();
              }}
            />
          )}
        </div>
      </div>
      {context?.content}
    </div>
  );
}
