import type { ComposerShortcut } from '../../composer-shortcuts.js';
import type { KeyboardEvent, MutableRefObject, Dispatch, SetStateAction } from 'react';
import {
  deleteSelectedMention,
  rebaseMentions,
  type MentionQuery,
  type SelectedMention,
} from '../../mentions.js';
import { insertRichPlainText, richSelectionOffsets } from '../../rich-mention-editor.js';
import type { BotSummary, ChannelSummary } from '../../store.js';
import {
  deleteSelectedChannelRef,
  rebaseChannelRefs,
  type ChannelRefQuery,
  type SelectedChannelRef,
} from '../../channel-refs.js';
import { deleteAttachmentReference } from '../../attachment-refs.js';
import type { ComposerSendKey } from '../../composer-send-key.js';
import { rebaseSkills, type SelectedSkill, type SkillQuery } from '../../skill-refs.js';
import {
  deleteSessionReference,
  type ComposerSessionOption,
  type SessionQuery,
} from '../../session-refs.js';
import type { useComposerVoice } from '../../composer-voice.js';
import type { ComposerSkillOption, ChannelComposerProps } from '../../channel-composer.js';
import { shouldSubmitComposerKey } from './composer-input-layout.js';
import type { ChannelComposerUpload } from './composer-types.js';

type Setter<T> = Dispatch<SetStateAction<T>>;

export function handleComposerKeyDown({
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
}: {
  event: KeyboardEvent<HTMLElement>;
  locked: boolean;
  voice: Pick<ReturnType<typeof useComposerVoice>, 'active'>;
  hasShortcutArgument: boolean;
  shortcutOptions: readonly ComposerShortcut[];
  menuLength: number;
  clearShortcut: () => void;
  setSkillQuery: Setter<SkillQuery | undefined>;
  setSessionQuery: Setter<SessionQuery | undefined>;
  setShortcutIndex: Setter<number>;
  shortcutIndex: number;
  chooseShortcut: (shortcut: ComposerShortcut) => void;
  skillMatches: readonly ComposerSkillOption[];
  chooseSkill: (option: ComposerSkillOption) => void;
  sessionMatches: readonly ComposerSessionOption[];
  chooseSession: (option: ComposerSessionOption) => void;
  value: string;
  attachments: readonly ChannelComposerUpload[];
  requestedCaret: MutableRefObject<number | undefined>;
  onChange: ChannelComposerProps['onChange'];
  mentions: readonly SelectedMention[];
  channelRefs: readonly SelectedChannelRef[];
  skills: readonly SelectedSkill[];
  setMentionQuery: Setter<MentionQuery | undefined>;
  setChannelQuery: Setter<ChannelRefQuery | undefined>;
  channelQuery: ChannelRefQuery | undefined;
  channelOptions: readonly ChannelSummary[];
  setActiveMentionIndex: Setter<number>;
  chooseChannel: (channel: ChannelSummary) => void;
  activeMentionIndex: number;
  mentionQuery: MentionQuery | undefined;
  candidates: readonly (
    | BotSummary
    | { preview: NonNullable<ChannelComposerProps['allBotPreview']> }
  )[];
  chooseMention: (
    bot: BotSummary | { preview: NonNullable<ChannelComposerProps['allBotPreview']> },
  ) => void;
  reply: ChannelComposerProps['reply'];
  onCancelReply: ChannelComposerProps['onCancelReply'];
  sendKey: ComposerSendKey;
  emitRichChange: (editor: HTMLDivElement) => void;
  onRecall: ChannelComposerProps['onRecall'];
  onSubmit: ChannelComposerProps['onSubmit'];
  hasVisibleText: (value: string) => boolean;
}) {
  if (locked) return;
  if (voice.active && event.key === 'Enter') {
    event.preventDefault();
    return;
  }
  if (
    hasShortcutArgument &&
    shortcutOptions.length === 0 &&
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing
  ) {
    event.preventDefault();
    return;
  }
  if (menuLength > 0 && !event.nativeEvent.isComposing) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (shortcutOptions.length > 0) clearShortcut();
      setSkillQuery(undefined);
      setSessionQuery(undefined);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setShortcutIndex(
        (current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + menuLength) % menuLength,
      );
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const index = shortcutIndex % menuLength;
      const shortcut = shortcutOptions[index];
      if (shortcut !== undefined) chooseShortcut(shortcut);
      else {
        const option = skillMatches[index - shortcutOptions.length];
        if (option !== undefined) chooseSkill(option);
        else {
          const session = sessionMatches[index - shortcutOptions.length - skillMatches.length];
          if (session !== undefined) chooseSession(session);
        }
      }
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
    const deleted =
      deleteAttachmentReference(value, attachments, selection, event.key) ??
      deleteSessionReference(value, selection, event.key);
    if (deleted !== undefined) {
      event.preventDefault();
      requestedCaret.current = deleted.caret;
      onChange(
        deleted.value,
        rebaseMentions(value, deleted.value, mentions),
        rebaseChannelRefs(value, deleted.value, channelRefs),
        rebaseSkills(value, deleted.value, skills),
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
    !voice.active &&
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
  if (!hasVisibleText(value) && attachments.length === 0) {
    event.preventDefault();
    return;
  }
  if (mentions.some((item) => item.kind === 'all-bots' && item.preview.recipients.length === 0)) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  void onSubmit();
}
