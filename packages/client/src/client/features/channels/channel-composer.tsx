import { Icon } from '../../ds/icon.js';
import { Note } from '../../ds/note.js';
import { ComposerControl, ComposerTextarea, composer } from '../../ds/chat-chrome.js';
import { IconButton } from '../../ds/icon-button.js';
import { HiddenFileInput } from '../../ds/input.js';
import { hooked } from '../../ds/hooked.js';
import { QuoteChip, QuoteChipList } from '../../ds/quote-chip.js';
import { MAX_DRAFT_QUOTES, type ComposerQuote } from '../../composer-draft-store.js';
import { hasVisibleText } from '../../../../../core/src/channels/message-preview.js';
import {
  composerShortcutOptions,
  type ComposerContext,
  type ComposerSlashQuery,
  type ComposerShortcut,
} from '../../composer-shortcuts.js';
import type { AllBotPreview } from '../../../../../core/src/channels/all-bot-mention.js';
import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { PersonaBotAvatar } from '../../avatar.js';
import { rebaseMentions, type MentionQuery, type SelectedMention } from '../../mentions.js';
import type { MentionAvatarMount } from '../../rich-mention-editor.js';
import type { BotSummary, ChannelSummary } from '../../store.js';
import {
  rebaseChannelRefs,
  type ChannelRefQuery,
  type SelectedChannelRef,
} from '../../channel-refs.js';
import type { ComposerSendKey } from '../../composer-send-key.js';
import {
  rankSkillEntries,
  skillOwnerKey,
  type SkillCatalogEntry,
} from '../../../../../core/src/skills/entries.js';
import type { SelectedSkill, SkillQuery } from '../../skill-refs.js';
import { chipSkill, useSkillPeek, type SkillDocument } from '../../skill-preview.js';
import {
  rankSessionOptions,
  type ComposerSessionOption,
  type SessionQuery,
} from '../../session-refs.js';
import { hasSessionMentions } from '../../session-links.js';
import { ASSIGNMENT_SESSION_ICON, ChannelSidebarIcon } from '../../channel-sidebar-icon.js';
import { MenuRowButton } from '../../ds/menu-row-button.js';
import * as stylex from '@stylexjs/stylex';
import { ink, space, style } from '../../ds/tobs.stylex.js';
import { zhTranslate, type BotHarnessTranslate } from '../../locale.js';
import type { DictationMic, VoiceDictationPort } from '../../composer-dictation.js';
import {
  ComposerMicButton,
  composerVoicePlaceholder,
  composerVoiceStatus,
  useComposerVoice,
} from '../../composer-voice.js';
import { useMountedResource } from '../../mounted-resource.js';
import {
  NO_QUOTES,
  NONE,
  matchingSkills,
  composerChipBots,
  matchingBots,
  matchingChannels,
  composerAvatarKey,
  composerAttachmentKey,
} from './composer-suggestions.js';
import {
  readComposerSelection,
  clearComposerShortcut,
  selectComposerSession,
  selectComposerSkill,
  selectComposerChannel,
  selectComposerMention,
  insertComposerFiles,
  pasteComposerFiles,
  measureComposerInput,
  queueComposerMeasurement,
  mountRichComposer,
  mountPlainComposer,
  observeComposerOverlay,
  mountComposerBody,
  insertComposerAttachment,
  updateRichComposerDraft,
  openComposerChip,
  pasteRichComposerText,
  dropRichComposerText,
  updatePlainComposerDraft,
} from './composer-editor.js';
import type { ComposerTextareaFit } from './composer-input-layout.js';
import { handleComposerKeyDown } from './composer-keyboard.js';
import type { ChannelComposerUpload } from './composer-types.js';
import { renderComposerAttachments, renderComposerAttachmentIcon } from './composer-attachments.js';
import {
  renderComposerChannelOptions,
  renderComposerMentionOptions,
} from './composer-mention-options.js';

const sessionStyles = stylex.create({
  modelControl: { display: 'flex', minWidth: 0, flexShrink: 1 },
  footer: {
    gap: space.x2,
    maxWidth: `calc(100% - ${style.controlHeightSmall} - ${space.x8})`,
  },
  title: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'center',
    gap: space.x2,
    flexShrink: 1,
    minWidth: 0,
  },
  icon: { display: 'inline-flex', flexShrink: 0, color: ink.secondary },
  clip: { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  owner: { flexGrow: 0, flexShrink: 1, flexBasis: 'auto', color: ink.secondary },
});

export type ComposerMentionCandidate = BotSummary | { preview: AllBotPreview };

export type ComposerSkillOption = SkillCatalogEntry & {
  bot?: BotSummary | undefined;
};

export interface ChannelComposerProps {
  modelControl?: React.ReactNode;
  onOverlayResize?: ((timeline: HTMLElement) => void) | undefined;
  context?: ComposerContext | undefined;
  sendKey?: ComposerSendKey | undefined;
  value: string;
  placeholder: string;
  label?: string | undefined;
  holdPlaceholder?: string | undefined;
  dictation?: VoiceDictationPort | undefined;
  dictating?: { current: boolean } | undefined;
  dictationMic?: DictationMic | undefined;
  sending: boolean;
  disabled?: boolean;
  focusSignal?: number;
  attachments?: readonly ChannelComposerUpload[] | undefined;
  onAddFiles?(files: File[], selection?: { start: number; end: number }): number | void;
  onRetryAttachment?(id: string): void;
  onRemoveAttachment?(id: string): void;
  allBotNotice?: string | undefined;
  allBotPreview?: AllBotPreview | undefined;
  mentionCandidates?: readonly BotSummary[] | undefined;
  mentions?: readonly SelectedMention[] | undefined;
  channelCandidates?: readonly ChannelSummary[] | undefined;
  channelRefs?: readonly SelectedChannelRef[] | undefined;
  skillOptions?: readonly ComposerSkillOption[] | undefined;
  skills?: readonly SelectedSkill[] | undefined;
  readSkill?: ((name: string, owner: string) => Promise<SkillDocument>) | undefined;
  sessionOptions?: readonly ComposerSessionOption[] | undefined;
  onSessionMenu?: (() => void) | undefined;
  reply?: { id: string; author: string; body: string } | undefined;
  quotes?: readonly ComposerQuote[] | undefined;
  t?: BotHarnessTranslate | undefined;
  onChange(
    value: string,
    mentions?: SelectedMention[],
    channelRefs?: SelectedChannelRef[],
    skills?: SelectedSkill[],
  ): void;
  onCancelReply?(): void;
  onRemoveQuote?(quote: ComposerQuote): void;
  onQuoteNote?(quote: ComposerQuote, note: string): void;
  onRecall?(direction: 'older' | 'newer'): boolean;
  onSubmit(): void | Promise<void>;
  onStop?: (() => void) | undefined;
}

export function ChannelComposer({
  modelControl,
  context,
  sendKey = 'enter',
  value,
  placeholder: basePlaceholder,
  label,
  holdPlaceholder,
  dictation,
  dictating,
  dictationMic,
  sending,
  disabled = false,
  focusSignal = 0,
  attachments = NONE,
  onAddFiles,
  onRetryAttachment,
  onRemoveAttachment,
  allBotNotice,
  allBotPreview,
  mentionCandidates = NONE,
  mentions = NONE,
  channelCandidates = NONE,
  channelRefs = NONE,
  skillOptions = NONE,
  skills = NONE,
  readSkill,
  sessionOptions = [],
  onSessionMenu,
  reply,
  quotes = NO_QUOTES,
  t = zhTranslate,
  onChange,
  onCancelReply,
  onRemoveQuote,
  onQuoteNote,
  onRecall,
  onSubmit,
  onStop,
  onOverlayResize,
}: ChannelComposerProps): ReactElement {
  const locked = sending || disabled;
  const stops = onStop !== undefined && !hasVisibleText(value) && attachments.length === 0;
  const overlayResize = useRef(onOverlayResize);
  overlayResize.current = onOverlayResize;
  const skillPeek = useSkillPeek(t);
  const voice = useComposerVoice({
    port: dictation,
    value,
    disabled: locked,
    mic: dictationMic,
    selection: () => selectionOffsets(),
    apply: (next, caret) => {
      requestedCaret.current = caret;
      onChange(
        next,
        rebaseMentions(value, next, mentions),
        rebaseChannelRefs(value, next, channelRefs),
      );
    },
  });
  if (dictating !== undefined) dictating.current = voice.active;
  const placeholder = composerVoicePlaceholder(voice, basePlaceholder, holdPlaceholder, t);
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
    return readComposerSelection(richRef, textareaRef);
  };
  const rich =
    attachments.length > 0 ||
    allBotPreview !== undefined ||
    mentionCandidates.length > 0 ||
    mentions.length > 0 ||
    channelCandidates.length > 0 ||
    channelRefs.length > 0 ||
    skillOptions.length > 0 ||
    skills.length > 0 ||
    sessionOptions.length > 0 ||
    hasSessionMentions(value);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | undefined>();
  const [channelQuery, setChannelQuery] = useState<ChannelRefQuery | undefined>();
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [slashQuery, setSlashQuery] = useState<ComposerSlashQuery>();
  const [skillQuery, setSkillQuery] = useState<SkillQuery | undefined>();
  const [sessionQuery, setSessionQuery] = useState<SessionQuery | undefined>();
  const slashTarget = useRef<string | undefined>(undefined);
  const [shortcutIndex, setShortcutIndex] = useState(0);
  const shortcutOptions = composerShortcutOptions(
    context?.shortcuts ?? [],
    slashTarget.current === context?.target ? slashQuery : undefined,
  );
  const skillMatches = matchingSkills(skillQuery, skillOptions, rankSkillEntries);
  const sessionMatches =
    sessionQuery === undefined ? [] : rankSessionOptions(sessionOptions, sessionQuery.query);
  const menuLength = shortcutOptions.length + skillMatches.length + sessionMatches.length;
  const chipBots = composerChipBots(mentionCandidates, skillOptions, sessionOptions);
  const hasShortcutArgument =
    slashTarget.current === context?.target &&
    slashQuery?.argument !== undefined &&
    context?.shortcuts.some(
      (shortcut) => shortcut.id === slashQuery.filter && shortcut.choices !== undefined,
    ) === true;
  const clearShortcut = (): void => {
    clearComposerShortcut({
      slashQuery,
      value,
      requestedCaret,
      onChange,
      mentions,
      channelRefs,
      setSlashQuery,
    });
  };
  const chooseShortcut = (shortcut: ComposerShortcut): void => {
    if (locked || shortcut.disabled || voice.active) return;
    clearShortcut();
    setSkillQuery(undefined);
    setSessionQuery(undefined);
    shortcut.run();
  };
  const chooseSession = (option: ComposerSessionOption): void => {
    selectComposerSession({
      locked,
      sessionQuery,
      voice,
      value,
      option,
      onChange,
      mentions,
      channelRefs,
      skills,
      setSessionQuery,
      setSkillQuery,
      setSlashQuery,
      requestedCaret,
      richRef,
    });
  };
  const chooseSkill = (option: ComposerSkillOption): void => {
    selectComposerSkill({
      locked,
      skillQuery,
      voice,
      value,
      skills,
      option,
      onChange,
      mentions,
      channelRefs,
      setSkillQuery,
      setSlashQuery,
      setSessionQuery,
      requestedCaret,
      richRef,
    });
  };
  const botCandidates = matchingBots(mentionQuery, mentionCandidates);
  const allBotLabel = t('composer.allBots');
  const offerAll =
    allBotPreview !== undefined &&
    mentionQuery !== undefined &&
    !mentions.some((item) => item.kind === 'all-bots') &&
    [allBotLabel.toLocaleLowerCase(), 'all', '所有'].some((name) =>
      name.includes(mentionQuery.query.toLocaleLowerCase()),
    );
  const candidates: ComposerMentionCandidate[] = offerAll
    ? [{ preview: allBotPreview }, ...botCandidates]
    : botCandidates;
  const channelOptions = matchingChannels(channelQuery, channelCandidates);
  const chooseChannel = (channel: ChannelSummary): void => {
    selectComposerChannel({
      locked,
      channelQuery,
      voice,
      value,
      channelRefs,
      channel,
      onChange,
      mentions,
      setChannelQuery,
      requestedCaret,
      richRef,
    });
  };
  const chooseMention = (bot: ComposerMentionCandidate): void => {
    selectComposerMention({
      locked,
      mentionQuery,
      voice,
      bot,
      value,
      mentions,
      allBotLabel,
      onChange,
      channelRefs,
      setMentionQuery,
      requestedCaret,
      richRef,
      textareaRef,
    });
  };
  const addFilesAtSelection = (files: File[], selection = selectionOffsets()): void => {
    insertComposerFiles({ voice, onAddFiles, files, selection, requestedCaret, richRef });
  };
  const handleFilePaste = (event: ClipboardEvent<HTMLElement>): boolean => {
    return pasteComposerFiles({ voice, event, onAddFiles, locked, addFilesAtSelection });
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fit, setFit] = useState<ComposerTextareaFit & { animateFirstExpand: boolean }>({
    expanded: false,
    height: 34,
    animateFirstExpand: false,
  });
  const hasFooter =
    modelControl !== undefined ||
    fit.expanded ||
    reply !== undefined ||
    quotes.length > 0 ||
    attachments.length > 0;

  const syncTextarea = useCallback((element: HTMLElement): void => {
    measureComposerInput(element, setFit);
  }, []);
  const pendingFit = useRef<{ element: HTMLElement } | undefined>(undefined);
  const scheduleSync = useCallback(
    (element: HTMLElement): void => {
      queueComposerMeasurement(element, pendingFit, syncTextarea);
    },
    [syncTextarea],
  );

  const avatarKey = composerAvatarKey(mentions, skills, sessionOptions, chipBots);
  const attachmentKey = composerAttachmentKey(attachments);
  const renderedAttachmentKey = useRef('');
  const referenceAttachment = (item: ChannelComposerUpload): void => {
    insertComposerAttachment({
      voice,
      value,
      item,
      selectionOffsets,
      requestedCaret,
      onChange,
      mentions,
      channelRefs,
      setMentionQuery,
      setChannelQuery,
      richRef,
    });
  };
  const richMount = useMountedResource<HTMLDivElement>(
    (editor) => {
      return mountRichComposer({
        editor,
        richRef,
        value,
        mentions,
        channelRefs,
        skills,
        renderedAvatarKey,
        avatarKey,
        renderedAttachmentKey,
        attachmentKey,
        requestedCaret,
        chipBots,
        attachments,
        sessionOptions,
        setAvatarMounts,
        setAttachmentMounts,
        scheduleSync,
      });
    },
    [
      value,
      mentions,
      channelRefs,
      skills,
      mentionCandidates,
      channelCandidates,
      avatarKey,
      attachmentKey,
      scheduleSync,
    ],
  );
  const textareaMount = useMountedResource<HTMLTextAreaElement>(
    (element) => {
      return mountPlainComposer({
        element,
        textareaRef,
        requestedCaret,
        richRef,
        setAvatarMounts,
        setAttachmentMounts,
        scheduleSync,
      });
    },
    [scheduleSync, value],
  );
  const shellMount = useMountedResource<HTMLDivElement>((shell) => {
    return observeComposerOverlay(shell, overlayResize);
  }, []);
  const replyId = reply?.id;
  const bodyMount = useMountedResource<HTMLDivElement>(
    (body) => {
      return mountComposerBody({ body, replyId, focusSignal, richRef, scheduleSync });
    },
    [scheduleSync, rich, replyId, focusSignal],
  );

  const emitRichChange = (editor: HTMLDivElement): void => {
    updateRichComposerDraft({
      editor,
      scheduleSync,
      onChange,
      slashTarget,
      context,
      setSlashQuery,
      skillOptions,
      setSkillQuery,
      sessionOptions,
      onSessionMenu,
      sessionQuery,
      setSessionQuery,
      setShortcutIndex,
      setMentionQuery,
      setChannelQuery,
      setActiveMentionIndex,
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    handleComposerKeyDown({
      event,
      locked,
      voice,
      hasShortcutArgument,
      shortcutOptions,
      menuLength,
      clearShortcut,
      setSkillQuery,
      setSessionQuery,
      setShortcutIndex,
      shortcutIndex,
      chooseShortcut,
      skillMatches,
      chooseSkill,
      sessionMatches,
      chooseSession,
      value,
      attachments,
      requestedCaret,
      onChange,
      mentions,
      channelRefs,
      skills,
      setMentionQuery,
      setChannelQuery,
      channelQuery,
      channelOptions,
      setActiveMentionIndex,
      chooseChannel,
      activeMentionIndex,
      mentionQuery,
      candidates,
      chooseMention,
      reply,
      onCancelReply,
      sendKey,
      emitRichChange,
      onRecall,
      onSubmit,
      hasVisibleText,
    });
  };

  return (
    <div
      ref={shellMount}
      className="bh-composer-shell"
      data-bh-tour="composer"
      data-companion-avoid
    >
      {skillPeek.layer}
      {dictation === undefined ? null : (
        <span className="bh-sr-only" role="status" aria-live="polite">
          {composerVoiceStatus(voice, t) ?? ''}
        </span>
      )}
      {allBotNotice === undefined ? null : (
        <div className="bh-muted" role="status">
          {allBotNotice}
        </div>
      )}
      {channelQuery !== undefined && channelOptions.length > 0
        ? renderComposerChannelOptions({
            channelOptions,
            activeMentionIndex,
            chooseChannel,
            locked,
          })
        : null}
      {menuLength === 0 ? null : (
        <div
          className="bh-composer-shortcuts"
          role="menu"
          aria-label={t('composerContext.actions')}
        >
          {slashQuery?.argument !== undefined &&
          context?.shortcuts.find((item) => item.id === slashQuery.filter)?.scope ? (
            <div className="bh-note" role="presentation">
              {context.shortcuts.find((item) => item.id === slashQuery.filter)?.scope}
            </div>
          ) : null}
          {shortcutOptions.map((shortcut, index) => (
            <button
              key={shortcut.key ?? shortcut.id}
              ref={(node) => {
                if (index === shortcutIndex % menuLength)
                  node?.scrollIntoView?.({ block: 'nearest' });
              }}
              type="button"
              role="menuitem"
              disabled={locked || shortcut.disabled}
              aria-label={
                shortcut.reason === undefined
                  ? shortcut.label
                  : `${shortcut.label} · ${shortcut.reason}`
              }
              data-active={index === shortcutIndex % menuLength ? 'true' : undefined}
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
                <Icon name="check" size={16} />
              ) : null}
            </button>
          ))}
          {skillMatches.length === 0 ? null : (
            <div className="bh-composer-menu-section" role="presentation">
              {t('composer.skills')}
            </div>
          )}
          {skillMatches.map((option, offset) => {
            const index = shortcutOptions.length + offset;
            const owner =
              option.owner.kind === 'host'
                ? t('composer.skillHost')
                : option.owner.kind === 'workspace'
                  ? option.owner.name
                  : (option.bot?.displayName ?? option.owner.botSlug);
            return (
              <button
                key={`${skillOwnerKey(option.owner)}/${option.name}`}
                ref={(node) => {
                  if (index === shortcutIndex % menuLength)
                    node?.scrollIntoView?.({ block: 'nearest' });
                }}
                type="button"
                role="menuitem"
                className="bh-composer-skill-option"
                disabled={locked}
                aria-label={`/${option.name} · ${owner}`}
                data-active={index === shortcutIndex % menuLength ? 'true' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSkill(option)}
              >
                <span className="bh-composer-skill-owner" title={owner}>
                  {option.owner.kind === 'bot' ? (
                    <PersonaBotAvatar
                      personaBotId={option.owner.botSlug}
                      name={owner}
                      src={option.bot?.avatar}
                      appearance={option.bot?.appearance}
                      avatarSeed={option.bot?.avatarSeed}
                      size={20}
                      indicator={false}
                      t={t}
                    />
                  ) : option.owner.kind === 'workspace' ? (
                    <Icon name="folder-open" size={20} />
                  ) : (
                    <Icon name="sparkles" size={20} />
                  )}
                </span>
                <span className="bh-composer-skill-copy">
                  <strong>/{option.name}</strong>
                  {option.owner.kind === 'workspace' ? (
                    <span className="bh-composer-skill-source">{owner}</span>
                  ) : null}
                  <small>{option.description}</small>
                </span>
              </button>
            );
          })}
          {sessionMatches.length === 0 ? null : (
            <div className="bh-composer-menu-section" role="presentation">
              {t('composer.sessions')}
            </div>
          )}
          {sessionMatches.map((option, offset) => {
            const index = shortcutOptions.length + skillMatches.length + offset;
            const owner = option.bot?.displayName ?? option.botSlug;
            return (
              <MenuRowButton
                key={`${option.botSlug}/${option.sessionId}`}
                ref={(node) => {
                  if (index === shortcutIndex % menuLength)
                    node?.scrollIntoView?.({ block: 'nearest' });
                }}
                className="bh-composer-skill-option"
                data-session-option={option.sessionId}
                disabled={locked}
                aria-label={`${option.title} · ${owner}`}
                data-active={index === shortcutIndex % menuLength ? 'true' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseSession(option)}
              >
                <span className="bh-composer-skill-owner" title={owner}>
                  <PersonaBotAvatar
                    personaBotId={option.botSlug}
                    name={owner}
                    src={option.bot?.avatar}
                    appearance={option.bot?.appearance}
                    avatarSeed={option.bot?.avatarSeed}
                    size={20}
                    indicator={false}
                    t={t}
                  />
                </span>
                <span className="bh-composer-skill-copy">
                  <strong {...stylex.props(sessionStyles.title)}>
                    <span {...stylex.props(sessionStyles.icon)}>
                      <ChannelSidebarIcon name={ASSIGNMENT_SESSION_ICON} size={14} />
                    </span>
                    <span {...stylex.props(sessionStyles.clip)}>{option.title}</span>
                  </strong>
                  <small {...stylex.props(sessionStyles.owner)}>
                    {option.done ? t('composer.sessionDone', { name: owner }) : owner}
                  </small>
                </span>
              </MenuRowButton>
            );
          })}
        </div>
      )}
      {mentionQuery !== undefined && candidates.length > 0
        ? renderComposerMentionOptions({
            candidates,
            activeMentionIndex,
            chooseMention,
            locked,
            allBotLabel,
            t,
          })
        : null}
      <div
        {...hooked(
          `bh-composer ${fit.expanded ? 'bh-composer-expanded' : 'bh-composer-compact'}${fit.animateFirstExpand ? ' bh-composer-first-expand' : ''}${reply === undefined ? '' : ' bh-composer-replying'}${hasFooter ? ' bh-composer-with-footer' : ''}${voice.ready ? ' bh-composer-has-mic' : ''}`,
          composer.surface,
        )}
        data-layout={fit.expanded ? 'expanded' : 'compact'}
        data-dictation={voice.snapshot.status}
        style={
          {
            '--bh-composer-body-height': `${fit.height}px`,
            ...(hasFooter ? { '--bh-composer-padding': 'var(--bh-composer-footer-padding)' } : {}),
          } as CSSProperties
        }
      >
        {reply === undefined ? null : (
          <div className="bh-composer-reply">
            <div {...hooked('bh-composer-reply-copy', composer.quote)}>
              <span className="bh-composer-reply-author">
                {t('message.replyingTo', { author: reply.author })}
              </span>
              <span className="bh-composer-reply-body">{reply.body}</span>
            </div>
            <IconButton
              className="bh-composer-reply-cancel"
              size="inline"
              aria-label={t('message.replyCancel')}
              onClick={onCancelReply}
            >
              <Icon name="x" size={16} />
            </IconButton>
          </div>
        )}
        {quotes.length === 0 ? null : (
          <QuoteChipList label={t('message.quotes')}>
            {quotes.map((quote) => {
              const author = quote.author ?? t('message.replyUnavailable');
              return (
                <QuoteChip
                  key={`${quote.messageId}:${quote.text ?? ''}`}
                  author={author}
                  excerpt={quote.excerpt ?? quote.text ?? ''}
                  part={quote.text !== undefined}
                  note={quote.note ?? ''}
                  noteLabel={t('message.quoteNoteLabel', { author })}
                  notePlaceholder={t('message.quoteNote')}
                  removeLabel={t('message.quoteRemove', { author })}
                  disabled={locked}
                  onNoteChange={(note) => onQuoteNote?.(quote, note)}
                  onRemove={() => onRemoveQuote?.(quote)}
                />
              );
            })}
          </QuoteChipList>
        )}
        {quotes.length < MAX_DRAFT_QUOTES ? null : (
          <Note>{t('message.quoteLimit', { count: MAX_DRAFT_QUOTES })}</Note>
        )}
        {attachments.length > 0
          ? renderComposerAttachments({
              attachments,
              t,
              locked,
              voice,
              onRetryAttachment,
              onRemoveAttachment,
              referenceAttachment,
            })
          : null}
        <div
          ref={bodyMount}
          className="bh-composer-body"
          onPointerDown={voice.holdHandlers.onPointerDown}
          onContextMenu={voice.holdHandlers.onContextMenu}
        >
          {rich ? (
            <div
              ref={richMount}
              className="bh-composer-input bh-composer-rich-input"
              role="textbox"
              aria-label={label ?? basePlaceholder}
              aria-multiline="true"
              aria-disabled={locked}
              aria-readonly={voice.active || undefined}
              data-placeholder={placeholder}
              contentEditable={!locked && !voice.active}
              suppressContentEditableWarning
              onPointerOver={(event) => {
                const chip = chipSkill(event.target, skillOptions, t);
                if (chip === undefined) skillPeek.hide();
                else skillPeek.show(chip.peek, chip.element);
              }}
              onPointerLeave={skillPeek.hide}
              onMouseDown={(event) => {
                if (
                  readSkill !== undefined &&
                  chipSkill(event.target, skillOptions, t) !== undefined
                )
                  event.preventDefault();
              }}
              onClick={(event) => {
                openComposerChip({ event, skillOptions, t, readSkill, skillPeek });
              }}
              onInput={(event) => {
                if (!locked && !voice.active) emitRichChange(event.currentTarget);
              }}
              onPasteCapture={(event) => {
                pasteRichComposerText({ event, locked, voice, handleFilePaste, emitRichChange });
              }}
              onDrop={(event) => {
                dropRichComposerText(event, locked, voice, emitRichChange);
              }}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <ComposerTextarea
              ref={textareaMount}
              rows={1}
              placeholder={placeholder}
              aria-label={label ?? basePlaceholder}
              value={value}
              disabled={locked}
              readOnly={voice.active}
              onChange={(event) => {
                updatePlainComposerDraft({
                  event,
                  scheduleSync,
                  slashTarget,
                  context,
                  setSlashQuery,
                  setShortcutIndex,
                  sessionOptions,
                  onSessionMenu,
                  sessionQuery,
                  setSessionQuery,
                  value,
                  mentions,
                  channelRefs,
                  onChange,
                  setMentionQuery,
                  setChannelQuery,
                  setActiveMentionIndex,
                });
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
            mount.kind === 'workspace' ? (
              <Icon name="folder-open" size={16} />
            ) : (
              <PersonaBotAvatar
                personaBotId={mount.botSlug}
                name={mount.name}
                src={mount.src}
                appearance={mount.appearance}
                avatarSeed={mount.avatarSeed}
                size={16}
                indicator={false}
                t={t}
              />
            ),
            mount.target,
            `${mount.kind === 'workspace' ? `workspace:${mount.workspaceId}` : mount.botSlug}-${index}`,
          ),
        )}
        {attachmentMounts.map(renderComposerAttachmentIcon)}
        <HiddenFileInput
          ref={fileInputRef}
          className="bh-composer-file-input"
          aria-hidden
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
        <ComposerControl
          className="bh-composer-add-file"
          xstyle={composer.attachment}
          aria-label={t('composer.addAttachment')}
          disabled={locked || voice.active || attachments.length >= 10}
          onMouseDown={() => {
            savedFileSelection.current = selectionOffsets();
          }}
          onClick={() => {
            savedFileSelection.current ??= selectionOffsets();
            fileInputRef.current?.click();
          }}
        >
          <Icon name="paperclip" size={16} />
        </ComposerControl>
        {voice.mounts.map((mount, index) => (
          <span key={index} ref={mount} hidden />
        ))}

        <div {...hooked('bh-composer-footer', modelControl !== undefined && sessionStyles.footer)}>
          {modelControl === undefined ? null : (
            <div {...stylex.props(sessionStyles.modelControl)}>{modelControl}</div>
          )}
          {voice.ready ? <ComposerMicButton voice={voice} disabled={locked} t={t} /> : null}
          {stops ? (
            <ComposerControl
              className="bh-send-btn"
              primary
              data-composer-stop=""
              aria-label={t('sessions.stop')}
              disabled={disabled}
              onClick={onStop}
            >
              <Icon name="square" filled size={12} />
            </ComposerControl>
          ) : (
            <ComposerControl
              className="bh-send-btn"
              primary
              aria-label={sending ? t('message.sending') : t('composer.send')}
              disabled={
                (!hasVisibleText(value) && attachments.length === 0) ||
                locked ||
                voice.active ||
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
            >
              <Icon name="arrow-up" size={16} />
            </ComposerControl>
          )}
        </div>
      </div>
      {context?.content}
    </div>
  );
}
