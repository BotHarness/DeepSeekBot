import { composerSlashQuery, type ComposerSlashQuery } from '../../composer-shortcuts.js';
import type {
  ClipboardEvent,
  MutableRefObject,
  Dispatch,
  SetStateAction,
  ChangeEvent,
  MouseEvent,
  DragEvent,
} from 'react';
import {
  activeMentionQuery,
  rebaseMentions,
  selectMention,
  type MentionQuery,
  type SelectedMention,
} from '../../mentions.js';
import {
  insertRichPlainText,
  normalizeRichInput,
  readRichMentionDraft,
  renderRichMentionDraft,
  richSelectionOffsets,
  sameRichMentionDraft,
  setRichSelection,
  type MentionAvatarMount,
} from '../../rich-mention-editor.js';
import type { BotSummary, ChannelSummary } from '../../store.js';
import {
  activeChannelRefQuery,
  rebaseChannelRefs,
  selectChannelRef,
  type ChannelRefQuery,
  type SelectedChannelRef,
} from '../../channel-refs.js';
import { insertAttachmentReferences } from '../../attachment-refs.js';
import {
  activeSkillQuery,
  rebaseSkills,
  selectSkill,
  type SelectedSkill,
  type SkillQuery,
} from '../../skill-refs.js';
import { chipSkill, type useSkillPeek } from '../../skill-preview.js';
import {
  activeSessionQuery,
  selectSession,
  type ComposerSessionOption,
  type SessionQuery,
} from '../../session-refs.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { useComposerVoice } from '../../composer-voice.js';
import type { ComposerSkillOption, ChannelComposerProps } from '../../channel-composer.js';
import { type ComposerTextareaFit, fitComposerTextarea } from './composer-input-layout.js';
import type { ChannelComposerUpload } from './composer-types.js';

type Setter<T> = Dispatch<SetStateAction<T>>;

export function readComposerSelection(
  richRef: MutableRefObject<HTMLDivElement | null>,
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>,
): { start: number; end: number } | undefined {
  if (richRef.current !== null) return richSelectionOffsets(richRef.current);
  const textarea = textareaRef.current;
  return textarea === null
    ? undefined
    : { start: textarea.selectionStart, end: textarea.selectionEnd };
}

export function clearComposerShortcut({
  slashQuery,
  value,
  requestedCaret,
  onChange,
  mentions,
  channelRefs,
  setSlashQuery,
}: {
  slashQuery: ComposerSlashQuery | undefined;
  value: string;
  requestedCaret: MutableRefObject<number | undefined>;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  setSlashQuery: Setter<ComposerSlashQuery | undefined>;
}) {
  if (slashQuery === undefined) return;
  const next = value.slice(0, slashQuery.start) + value.slice(slashQuery.end);
  requestedCaret.current = slashQuery.start;
  onChange(
    next,
    rebaseMentions(value, next, mentions),
    rebaseChannelRefs(value, next, channelRefs),
  );
  setSlashQuery(undefined);
}

export function selectComposerSession({
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
}: {
  locked: boolean;
  sessionQuery: SessionQuery | undefined;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  value: string;
  option: ComposerSessionOption;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  skills: readonly SelectedSkill[];
  setSessionQuery: Setter<SessionQuery | undefined>;
  setSkillQuery: Setter<SkillQuery | undefined>;
  setSlashQuery: Setter<ComposerSlashQuery | undefined>;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (locked || sessionQuery === undefined || voice.active) return;
  const selected = selectSession(value, sessionQuery, option);
  onChange(
    selected.value,
    rebaseMentions(value, selected.value, mentions),
    rebaseChannelRefs(value, selected.value, channelRefs),
    rebaseSkills(value, selected.value, skills),
  );
  setSessionQuery(undefined);
  setSkillQuery(undefined);
  setSlashQuery(undefined);
  requestedCaret.current = selected.caret;
  requestAnimationFrame(() => {
    const editor = richRef.current;
    if (editor !== null) {
      editor.focus();
      setRichSelection(editor, selected.caret);
    }
  });
}

export function selectComposerSkill({
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
}: {
  locked: boolean;
  skillQuery: SkillQuery | undefined;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  value: string;
  skills: readonly SelectedSkill[];
  option: ComposerSkillOption;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  setSkillQuery: Setter<SkillQuery | undefined>;
  setSlashQuery: Setter<ComposerSlashQuery | undefined>;
  setSessionQuery: Setter<SessionQuery | undefined>;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (locked || skillQuery === undefined || voice.active) return;
  const selected = selectSkill(value, skills, skillQuery, option);
  onChange(
    selected.value,
    rebaseMentions(value, selected.value, mentions),
    rebaseChannelRefs(value, selected.value, channelRefs),
    selected.skills,
  );
  setSkillQuery(undefined);
  setSlashQuery(undefined);
  setSessionQuery(undefined);
  requestedCaret.current = selected.caret;
  requestAnimationFrame(() => {
    const editor = richRef.current;
    if (editor !== null) {
      editor.focus();
      setRichSelection(editor, selected.caret);
    }
  });
}

export function selectComposerChannel({
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
}: {
  locked: boolean;
  channelQuery: ChannelRefQuery | undefined;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  value: string;
  channelRefs: readonly SelectedChannelRef[];
  channel: ChannelSummary;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  setChannelQuery: Setter<ChannelRefQuery | undefined>;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (locked || channelQuery === undefined || voice.active) return;
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
}

export function selectComposerMention({
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
}: {
  locked: boolean;
  mentionQuery: MentionQuery | undefined;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  bot: BotSummary | { preview: NonNullable<ChannelComposerProps['allBotPreview']> };
  value: string;
  mentions: readonly SelectedMention[];
  allBotLabel: string;
  onChange: ChannelComposerProps['onChange'];
  channelRefs: readonly SelectedChannelRef[];
  setMentionQuery: Setter<MentionQuery | undefined>;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}) {
  if (locked || mentionQuery === undefined || voice.active) return;
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
}

export function insertComposerFiles({
  voice,
  onAddFiles,
  files,
  selection,
  requestedCaret,
  richRef,
}: {
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  onAddFiles: ChannelComposerProps['onAddFiles'];
  files: File[];
  selection: { start: number; end: number } | undefined;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (voice.active) return;
  const caret = onAddFiles?.(files, selection);
  if (caret === undefined) return;
  requestedCaret.current = caret;
  requestAnimationFrame(() => {
    richRef.current?.focus();
    if (richRef.current !== null) setRichSelection(richRef.current, caret);
  });
}

export function pasteComposerFiles({
  voice,
  event,
  onAddFiles,
  locked,
  addFilesAtSelection,
}: {
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  event: ClipboardEvent<HTMLElement>;
  onAddFiles: ChannelComposerProps['onAddFiles'];
  locked: boolean;
  addFilesAtSelection: (files: File[]) => void;
}): boolean {
  if (voice.active) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  const clipboard = event.clipboardData;
  const listed = Array.from(clipboard.files);
  const files =
    listed.length > 0
      ? listed
      : Array.from(clipboard.items).flatMap((item) => {
          const file = item.kind === 'file' ? item.getAsFile() : null;
          return file === null ? [] : [file];
        });
  if (files.length === 0 || onAddFiles === undefined || locked) return false;
  event.preventDefault();
  event.stopPropagation();
  addFilesAtSelection(files);
  return true;
}

export function measureComposerInput(
  element: HTMLElement,
  setFit: Setter<ComposerTextareaFit & { animateFirstExpand: boolean }>,
) {
  const nextFit = fitComposerTextarea(element);
  setFit((current) => {
    if (current.expanded === nextFit.expanded && current.height === nextFit.height) {
      return current;
    }
    return {
      ...nextFit,
      animateFirstExpand: current.expanded !== nextFit.expanded,
    };
  });
}

export function queueComposerMeasurement(
  element: HTMLElement,
  pendingFit: MutableRefObject<{ element: HTMLElement } | undefined>,
  syncTextarea: (element: HTMLElement) => void,
) {
  const pending = pendingFit.current;
  if (pending !== undefined) {
    pending.element = element;
    return;
  }
  const entry = { element };
  pendingFit.current = entry;
  requestAnimationFrame(() => {
    pendingFit.current = undefined;
    if (entry.element.isConnected) syncTextarea(entry.element);
  });
}

export function mountRichComposer({
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
}: {
  editor: HTMLDivElement;
  richRef: MutableRefObject<HTMLDivElement | null>;
  value: string;
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  skills: readonly SelectedSkill[];
  renderedAvatarKey: MutableRefObject<string>;
  avatarKey: string;
  renderedAttachmentKey: MutableRefObject<string>;
  attachmentKey: string;
  requestedCaret: MutableRefObject<number | undefined>;
  chipBots: readonly BotSummary[];
  attachments: readonly ChannelComposerUpload[];
  sessionOptions: readonly ComposerSessionOption[];
  setAvatarMounts: Setter<MentionAvatarMount[]>;
  setAttachmentMounts: Setter<Array<{ target: HTMLElement; name: string }>>;
  scheduleSync: (element: HTMLElement) => void;
}) {
  richRef.current = editor;
  const current = readRichMentionDraft(editor);
  if (
    sameRichMentionDraft(current, value, mentions, channelRefs, skills) &&
    renderedAvatarKey.current === avatarKey &&
    renderedAttachmentKey.current === attachmentKey
  )
    return () => {
      richRef.current = null;
    };
  const caret =
    requestedCaret.current ??
    (editor.ownerDocument.activeElement === editor ? richSelectionOffsets(editor)?.end : undefined);
  const mounts = renderRichMentionDraft(
    editor,
    value,
    mentions,
    chipBots,
    channelRefs,
    attachments,
    skills,
    sessionOptions,
  );
  setAvatarMounts(mounts);
  setAttachmentMounts(
    Array.from(editor.querySelectorAll<HTMLElement>('[data-attachment-icon]')).flatMap((target) => {
      const item = attachments.find((candidate) => candidate.id === target.dataset.attachmentIcon);
      return item === undefined ? [] : [{ target, name: item.file.name }];
    }),
  );
  renderedAvatarKey.current = avatarKey;
  renderedAttachmentKey.current = attachmentKey;
  requestedCaret.current = undefined;
  if (caret !== undefined) setRichSelection(editor, Math.min(caret, value.length));
  scheduleSync(editor);
  return () => {
    richRef.current = null;
  };
}

export function mountPlainComposer({
  element,
  textareaRef,
  requestedCaret,
  richRef,
  setAvatarMounts,
  setAttachmentMounts,
  scheduleSync,
}: {
  element: HTMLTextAreaElement;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  requestedCaret: MutableRefObject<number | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
  setAvatarMounts: Setter<MentionAvatarMount[]>;
  setAttachmentMounts: Setter<Array<{ target: HTMLElement; name: string }>>;
  scheduleSync: (element: HTMLElement) => void;
}) {
  textareaRef.current = element;
  const caret = requestedCaret.current;
  if (caret !== undefined && richRef.current === null) {
    requestedCaret.current = undefined;
    const at = Math.min(caret, element.value.length);
    element.setSelectionRange(at, at);
  }
  setAvatarMounts((current) => (current.length === 0 ? current : []));
  setAttachmentMounts((current) => (current.length === 0 ? current : []));
  scheduleSync(element);
  return () => {
    textareaRef.current = null;
  };
}

export function observeComposerOverlay(
  shell: HTMLDivElement,
  overlayResize: MutableRefObject<ChannelComposerProps['onOverlayResize']>,
) {
  const pane = shell.closest<HTMLElement>('.bh-chat-pane');
  const timeline = pane?.querySelector<HTMLElement>('.bh-chat-body') ?? null;
  if (pane === null || timeline === null || typeof ResizeObserver === 'undefined') return;
  let applied: number | undefined;
  const sync = (): void => {
    const shellBounds = shell.getBoundingClientRect();
    const overlay =
      shellBounds.height === 0
        ? 0
        : Math.max(0, Math.round(pane.getBoundingClientRect().bottom - shellBounds.top));
    if (overlay !== applied) {
      applied = overlay;
      timeline.style.setProperty('--bh-composer-overlay', String(overlay) + 'px');
    }
    overlayResize.current?.(timeline);
  };
  sync();
  const observer = new ResizeObserver(sync);
  observer.observe(shell);
  observer.observe(pane);
  return () => {
    observer.disconnect();
    timeline.style.removeProperty('--bh-composer-overlay');
  };
}

export function mountComposerBody({
  body,
  replyId,
  focusSignal,
  richRef,
  scheduleSync,
}: {
  body: HTMLDivElement;
  replyId: string | undefined;
  focusSignal: number;
  richRef: MutableRefObject<HTMLDivElement | null>;
  scheduleSync: (element: HTMLElement) => void;
}) {
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
    scheduleSync(element);
  });
  observer.observe(element);
  return () => observer.disconnect();
}

export function insertComposerAttachment({
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
}: {
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  value: string;
  item: ChannelComposerUpload;
  selectionOffsets: () => { start: number; end: number } | undefined;
  requestedCaret: MutableRefObject<number | undefined>;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  setMentionQuery: Setter<MentionQuery | undefined>;
  setChannelQuery: Setter<ChannelRefQuery | undefined>;
  richRef: MutableRefObject<HTMLDivElement | null>;
}) {
  if (voice.active) return;
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
}

export function updateRichComposerDraft({
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
}: {
  editor: HTMLDivElement;
  scheduleSync: (element: HTMLElement) => void;
  onChange: ChannelComposerProps['onChange'];
  slashTarget: MutableRefObject<string | undefined>;
  context: ChannelComposerProps['context'];
  setSlashQuery: Setter<ComposerSlashQuery | undefined>;
  skillOptions: readonly ComposerSkillOption[];
  setSkillQuery: Setter<SkillQuery | undefined>;
  sessionOptions: readonly ComposerSessionOption[];
  onSessionMenu: ChannelComposerProps['onSessionMenu'];
  sessionQuery: SessionQuery | undefined;
  setSessionQuery: Setter<SessionQuery | undefined>;
  setShortcutIndex: Setter<number>;
  setMentionQuery: Setter<MentionQuery | undefined>;
  setChannelQuery: Setter<ChannelRefQuery | undefined>;
  setActiveMentionIndex: Setter<number>;
}) {
  normalizeRichInput(editor);
  const next = readRichMentionDraft(editor);
  scheduleSync(editor);
  onChange(next.value, next.mentions, next.channelRefs, next.skills);
  const caret = richSelectionOffsets(editor)?.end ?? next.value.length;
  slashTarget.current = context?.target;
  const command = context === undefined ? undefined : composerSlashQuery(next.value, caret);
  setSlashQuery(
    command !== undefined &&
      next.skills.some((skill) => skill.start < command.end && skill.end > command.start)
      ? undefined
      : command,
  );
  setSkillQuery(
    skillOptions.length === 0 ? undefined : activeSkillQuery(next.value, caret, next.skills),
  );
  const nextSessionQuery =
    sessionOptions.length === 0 && onSessionMenu === undefined
      ? undefined
      : activeSessionQuery(next.value, caret);
  if (nextSessionQuery !== undefined && sessionQuery === undefined) onSessionMenu?.();
  setSessionQuery(nextSessionQuery);
  setShortcutIndex(0);
  setMentionQuery(activeMentionQuery(next.value, caret, next.mentions));
  setChannelQuery(activeChannelRefQuery(next.value, caret, next.channelRefs));
  setActiveMentionIndex(0);
}

export function openComposerChip({
  event,
  skillOptions,
  t,
  readSkill,
  skillPeek,
}: {
  event: MouseEvent<HTMLDivElement>;
  skillOptions: readonly ComposerSkillOption[];
  t: BotHarnessTranslate;
  readSkill: ChannelComposerProps['readSkill'];
  skillPeek: Pick<ReturnType<typeof useSkillPeek>, 'open'>;
}) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const chip = chipSkill(target, skillOptions, t);
  if (chip !== undefined && readSkill !== undefined) {
    skillPeek.open({
      ...chip.peek,
      load: () => readSkill(chip.peek.name, chip.ownerKey),
    });
    return;
  }
  const badge = target.closest<HTMLElement>('[data-attachment-id]');
  if (badge === null) return;
  const card = Array.from(
    event.currentTarget
      .closest('.bh-composer')
      ?.querySelectorAll<HTMLElement>('[data-attachment-card]') ?? [],
  ).find((item) => item.dataset.attachmentCard === badge.dataset.attachmentId);
  card?.querySelector<HTMLButtonElement>('button')?.focus();
}

export function pasteRichComposerText({
  event,
  locked,
  voice,
  handleFilePaste,
  emitRichChange,
}: {
  event: ClipboardEvent<HTMLDivElement>;
  locked: boolean;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  handleFilePaste: (event: ClipboardEvent<HTMLElement>) => boolean;
  emitRichChange: (editor: HTMLDivElement) => void;
}) {
  if (locked || voice.active) {
    event.preventDefault();
    return;
  }
  if (handleFilePaste(event)) return;
  event.preventDefault();
  insertRichPlainText(
    event.currentTarget,
    event.clipboardData.getData('text/plain').replace(/\r\n?/gu, '\n'),
  );
  emitRichChange(event.currentTarget);
}

export function dropRichComposerText(
  event: DragEvent<HTMLDivElement>,
  locked: boolean,
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>,
  emitRichChange: (editor: HTMLDivElement) => void,
) {
  event.preventDefault();
  if (locked || voice.active) return;
  const text = event.dataTransfer.getData('text/plain');
  if (text.length > 0) {
    insertRichPlainText(event.currentTarget, text.replace(/\r\n?/gu, '\n'));
    emitRichChange(event.currentTarget);
  }
}

export function updatePlainComposerDraft({
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
}: {
  event: ChangeEvent<HTMLTextAreaElement>;
  scheduleSync: (element: HTMLElement) => void;
  slashTarget: MutableRefObject<string | undefined>;
  context: ChannelComposerProps['context'];
  setSlashQuery: Setter<ComposerSlashQuery | undefined>;
  setShortcutIndex: Setter<number>;
  sessionOptions: readonly ComposerSessionOption[];
  onSessionMenu: ChannelComposerProps['onSessionMenu'];
  sessionQuery: SessionQuery | undefined;
  setSessionQuery: Setter<SessionQuery | undefined>;
  value: string;
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  onChange: ChannelComposerProps['onChange'];
  setMentionQuery: Setter<MentionQuery | undefined>;
  setChannelQuery: Setter<ChannelRefQuery | undefined>;
  setActiveMentionIndex: Setter<number>;
}) {
  scheduleSync(event.currentTarget);
  const next = event.target.value;
  slashTarget.current = context?.target;
  setSlashQuery(
    context === undefined
      ? undefined
      : composerSlashQuery(next, event.currentTarget.selectionStart),
  );
  setShortcutIndex(0);
  const nextSessionQuery =
    sessionOptions.length === 0 && onSessionMenu === undefined
      ? undefined
      : activeSessionQuery(next, event.currentTarget.selectionStart);
  if (nextSessionQuery !== undefined && sessionQuery === undefined) onSessionMenu?.();
  setSessionQuery(nextSessionQuery);
  const nextMentions = rebaseMentions(value, next, mentions);
  const nextRefs = rebaseChannelRefs(value, next, channelRefs);
  onChange(next, nextMentions, nextRefs);
  setMentionQuery(activeMentionQuery(next, event.currentTarget.selectionStart, nextMentions));
  setChannelQuery(activeChannelRefQuery(next, event.currentTarget.selectionStart, nextRefs));
  setActiveMentionIndex(0);
}
