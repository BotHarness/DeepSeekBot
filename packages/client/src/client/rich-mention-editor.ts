import type { AllBotPreview } from '../../../core/src/channels/all-bot-mention.js';
import type { SelectedMention } from './mentions.js';
import { referenceRuns, type SelectedChannelRef } from './channel-refs.js';
import type { BotSummary } from './store.js';
import { botNameSource, paintBotName } from './bot-primary-color.js';
import { attachmentReferenceRuns, type ComposerAttachmentReference } from './attachment-refs.js';

export interface MentionAvatarMount {
  target: HTMLElement;
  botSlug: string;
  name: string;
  src?: string | undefined;
}
export interface RichMentionDraft {
  value: string;
  mentions: SelectedMention[];
  channelRefs: SelectedChannelRef[];
}

function token(
  node: Node,
):
  | { kind: 'all-bots'; preview: AllBotPreview; label: string }
  | { kind: 'bot'; botSlug: string; label: string }
  | { kind: 'channel'; channelId: string; label: string }
  | undefined {
  if (!(node instanceof HTMLElement)) return undefined;
  const label = node.dataset.mentionLabel;
  if (label === undefined) return undefined;
  if (node.dataset.allBotPreview !== undefined) {
    try {
      return {
        kind: 'all-bots',
        label,
        preview: JSON.parse(node.dataset.allBotPreview) as AllBotPreview,
      };
    } catch {
      return undefined;
    }
  }
  const botSlug = node.dataset.botId;
  if (botSlug !== undefined) return { kind: 'bot', botSlug, label };
  const channelId = node.dataset.channelId;
  if (channelId !== undefined) return { kind: 'channel', channelId, label };
  return undefined;
}

function rawLength(node: Node): number {
  if (node instanceof HTMLBRElement && node.dataset.richPlaceholder !== undefined) return 0;
  if (node instanceof HTMLElement && node.dataset.attachmentText !== undefined)
    return node.dataset.attachmentText.length;
  const mention = token(node);
  if (mention !== undefined) return mention.label.length + 1;
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLBRElement) return 1;
  let length = 0;
  for (const child of node.childNodes) length += rawLength(child);
  return length;
}

function richTextNodes(document: Document, text: string): Node[] {
  return text.split('\n').flatMap((line, index) => {
    const nodes: Node[] = index === 0 ? [] : [document.createElement('br')];
    if (line.length > 0) nodes.push(document.createTextNode(line));
    return nodes;
  });
}

function syncTrailingLine(editor: HTMLElement): void {
  for (const placeholder of editor.querySelectorAll('br[data-rich-placeholder]'))
    placeholder.remove();
  while (editor.lastChild?.nodeType === Node.TEXT_NODE && editor.lastChild.textContent === '')
    editor.lastChild.remove();
  if (editor.lastChild instanceof HTMLBRElement) {
    const placeholder = editor.ownerDocument.createElement('br');
    placeholder.dataset.richPlaceholder = '';
    editor.append(placeholder);
  }
}

export function renderRichMentionDraft(
  editor: HTMLElement,
  value: string,
  mentions: readonly SelectedMention[],
  bots: readonly BotSummary[],
  refs: readonly SelectedChannelRef[] = [],
  attachments: readonly ComposerAttachmentReference[] = [],
): MentionAvatarMount[] {
  const document = editor.ownerDocument;
  const nodes: Node[] = [];
  const mounts: MentionAvatarMount[] = [];
  const named: Array<[HTMLElement, string | undefined]> = [];
  for (const run of referenceRuns(value, mentions, refs)) {
    if (run.mention === undefined && run.channelRef === undefined) {
      for (const part of attachmentReferenceRuns(run.text, attachments)) {
        if (part.attachment === undefined) {
          nodes.push(...richTextNodes(document, part.text));
          continue;
        }
        const item = part.attachment;
        const badge = document.createElement('span');
        badge.className = 'bh-inline-mention bh-composer-inline-attachment';
        badge.contentEditable = 'false';
        badge.dataset.attachmentText = part.text;
        badge.dataset.attachmentId = item.id;
        badge.dataset.status = item.status;
        badge.setAttribute('aria-busy', String(item.status === 'uploading'));
        badge.title = item.file.name;
        const icon = document.createElement('span');
        icon.dataset.attachmentIcon = item.id;
        icon.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        const ordinal = document.createElement('span');
        ordinal.className = 'bh-attachment-ordinal';
        ordinal.textContent = String(attachments.indexOf(item) + 1);
        label.className = 'bh-composer-inline-attachment-name';
        label.textContent = item.file.name;
        const size = document.createElement('span');
        size.className = 'bh-composer-inline-attachment-size';
        const bytes = item.ref?.size ?? item.file.size;
        size.textContent = bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`;
        badge.append(ordinal, icon, label, size);
        nodes.push(badge);
      }
      continue;
    }
    if (run.channelRef !== undefined) {
      const ref = run.channelRef;
      const badge = document.createElement('span');
      badge.className = 'bh-inline-mention bh-inline-mention-sent bh-composer-inline-mention';
      badge.contentEditable = 'false';
      badge.dataset.channelId = ref.channelId;
      badge.dataset.mentionLabel = ref.label;
      badge.textContent = '#' + ref.label;
      nodes.push(badge);
      continue;
    }
    const mention = run.mention;
    if (mention.kind === 'all-bots') {
      const badge = document.createElement('span');
      badge.className = 'bh-inline-mention bh-inline-mention-sent bh-composer-inline-mention';
      badge.contentEditable = 'false';
      badge.dataset.allBotPreview = JSON.stringify(mention.preview);
      badge.dataset.mentionLabel = mention.label;
      badge.textContent = '@' + mention.label + ' · ' + mention.preview.recipients.length;
      nodes.push(badge);
      continue;
    }
    const bot = bots.find((candidate) => candidate.slug === mention.botSlug);
    const badge = document.createElement('span');
    badge.className = 'bh-inline-mention bh-inline-mention-sent bh-composer-inline-mention';
    badge.contentEditable = 'false';
    badge.dataset.botId = mention.botSlug;
    badge.dataset.mentionLabel = mention.label;
    const avatar = document.createElement('span');
    avatar.className = 'bh-inline-mention-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = mention.label;
    badge.append(avatar, label);
    nodes.push(badge);
    named.push([label, botNameSource(bot)]);
    mounts.push({
      target: avatar,
      botSlug: mention.botSlug,
      name: bot?.displayName ?? mention.label,
      src: bot?.avatar,
    });
  }
  editor.replaceChildren(...nodes);
  syncTrailingLine(editor);
  for (const [label, source] of named) paintBotName(label, source);
  return mounts;
}

export function readRichMentionDraft(editor: HTMLElement): RichMentionDraft {
  let value = '';
  const mentions: SelectedMention[] = [];
  const channelRefs: SelectedChannelRef[] = [];
  const append = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.attachmentText !== undefined) {
      value += node.dataset.attachmentText;
      return;
    }
    const mention = token(node);
    if (mention !== undefined) {
      const start = value.length;
      value += (mention.kind === 'channel' ? '#' : '@') + mention.label;
      if (mention.kind === 'all-bots')
        mentions.push({
          kind: 'all-bots',
          preview: mention.preview,
          label: mention.label,
          start,
          end: value.length,
        });
      else if (mention.kind === 'bot')
        mentions.push({ botSlug: mention.botSlug, label: mention.label, start, end: value.length });
      else
        channelRefs.push({
          channelId: mention.channelId,
          label: mention.label,
          start,
          end: value.length,
        });
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      value += (node.textContent ?? '').replaceAll('\u00a0', ' ');
      return;
    }
    if (node instanceof HTMLBRElement) {
      if (node.dataset.richPlaceholder === undefined) value += '\n';
      return;
    }
    for (const child of node.childNodes) append(child);
  };
  for (const child of editor.childNodes) append(child);
  return { value, mentions, channelRefs };
}

export function sameRichMentionDraft(
  left: RichMentionDraft,
  value: string,
  mentions: readonly SelectedMention[],
  refs: readonly SelectedChannelRef[],
): boolean {
  return (
    left.value === value &&
    left.mentions.length === mentions.length &&
    left.mentions.every(
      (item, index) =>
        item.botSlug === mentions[index]?.botSlug &&
        JSON.stringify(item.preview) === JSON.stringify(mentions[index]?.preview) &&
        item.label === mentions[index]?.label &&
        item.start === mentions[index]?.start &&
        item.end === mentions[index]?.end,
    ) &&
    left.channelRefs.length === refs.length &&
    left.channelRefs.every(
      (item, index) =>
        item.channelId === refs[index]?.channelId &&
        item.label === refs[index]?.label &&
        item.start === refs[index]?.start &&
        item.end === refs[index]?.end,
    )
  );
}

function offsetAt(editor: HTMLElement, target: Node, offset: number): number {
  let count = 0;
  const visit = (node: Node): boolean => {
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE)
        count += Math.min(offset, node.textContent?.length ?? 0);
      else
        for (let index = 0; index < Math.min(offset, node.childNodes.length); index += 1)
          count += rawLength(node.childNodes[index]!);
      return true;
    }
    const mention = token(node);
    if (
      mention !== undefined ||
      (node instanceof HTMLElement && node.dataset.attachmentText !== undefined)
    ) {
      count += rawLength(node);
      return node.contains(target);
    }
    if (node.nodeType === Node.TEXT_NODE || node instanceof HTMLBRElement) {
      count += rawLength(node);
      return false;
    }
    for (const child of node.childNodes) if (visit(child)) return true;
    return false;
  };
  visit(editor);
  return count;
}

export function richSelectionOffsets(
  editor: HTMLElement,
): { start: number; end: number } | undefined {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null || selection.rangeCount === 0) return undefined;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer))
    return undefined;
  return {
    start: offsetAt(editor, range.startContainer, range.startOffset),
    end: offsetAt(editor, range.endContainer, range.endOffset),
  };
}

function pointAt(editor: HTMLElement, desired: number): { node: Node; offset: number } {
  let remaining = Math.max(0, desired);
  const visit = (parent: Node): { node: Node; offset: number } => {
    for (let index = 0; index < parent.childNodes.length; index += 1) {
      const child = parent.childNodes[index]!;
      const length = rawLength(child);
      if (remaining > length) {
        remaining -= length;
        continue;
      }
      if (child.nodeType === Node.TEXT_NODE)
        return { node: child, offset: Math.min(remaining, length) };
      if (
        token(child) !== undefined ||
        (child instanceof HTMLElement && child.dataset.attachmentText !== undefined) ||
        child instanceof HTMLBRElement
      )
        return { node: parent, offset: index + (remaining > 0 ? 1 : 0) };
      return visit(child);
    }
    return { node: parent, offset: parent.childNodes.length };
  };
  return visit(editor);
}

export function setRichSelection(editor: HTMLElement, start: number, end = start): void {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) return;
  const range = editor.ownerDocument.createRange();
  const from = pointAt(editor, start);
  const to = pointAt(editor, end);
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function insertRichPlainText(editor: HTMLElement, text: string): void {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) return;
  const range =
    selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).startContainer)
      ? selection.getRangeAt(0)
      : editor.ownerDocument.createRange();
  if (!editor.contains(range.startContainer)) {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const nodes = richTextNodes(editor.ownerDocument, text);
  const fragment = editor.ownerDocument.createDocumentFragment();
  fragment.append(...nodes);
  const last = nodes.at(-1);
  range.insertNode(fragment);
  if (last !== undefined) {
    if (last.nodeType === Node.TEXT_NODE) range.setStart(last, last.textContent?.length ?? 0);
    else range.setStartAfter(last);
  }
  syncTrailingLine(editor);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
