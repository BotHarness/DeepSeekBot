import type { ChannelAttachmentRef } from './store.js';
import { rebaseMentions, type SelectedMention } from './mentions.js';
import { rebaseChannelRefs, type SelectedChannelRef } from './channel-refs.js';

export interface ComposerAttachmentReference {
  id: string;
  file: Pick<File, 'name' | 'size'>;
  ref?: ChannelAttachmentRef;
  status: 'uploading' | 'ready' | 'error';
}

export interface AttachmentReferenceRun {
  text: string;
  start: number;
  end: number;
  attachment?: ComposerAttachmentReference;
}

function attachmentIdentity(item: ComposerAttachmentReference): string {
  return item.ref?.fileId ?? item.ref?.hash ?? 'file:' + item.id;
}

export function messageAttachmentReferences(
  refs: readonly ChannelAttachmentRef[],
): ComposerAttachmentReference[] {
  return refs.map((ref) => ({
    id: ref.fileId ?? ref.hash,
    file: { name: ref.name, size: ref.size },
    ref,
    status: 'ready',
  }));
}

export function attachmentReferenceLabels(
  value: string,
  refs: readonly ChannelAttachmentRef[],
): string {
  return attachmentReferenceRuns(value, messageAttachmentReferences(refs))
    .map((run) => run.attachment?.file.name ?? run.text)
    .join('');
}

export function attachmentReferenceText(item: ComposerAttachmentReference): string {
  const identity = attachmentIdentity(item);
  const name = item.file.name.replace(/[\r\n]/gu, ' ').replace(/[\\\[\]]/gu, '\\$&');
  return `[${name}](attachment:${encodeURIComponent(identity)})`;
}

export function attachmentReferenceRuns(
  value: string,
  attachments: readonly ComposerAttachmentReference[],
): AttachmentReferenceRun[] {
  const matches: AttachmentReferenceRun[] = [];
  for (const match of value.matchAll(/\[((?:\\.|[^\]\\])*)\]\(attachment:([^\s)]+)\)/gu)) {
    let identity: string;
    try {
      identity = decodeURIComponent(match[2]!);
    } catch {
      continue;
    }
    const attachment = attachments.find((item) => attachmentIdentity(item) === identity);
    if (attachment === undefined) continue;
    matches.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      attachment,
    });
  }
  const runs: AttachmentReferenceRun[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor)
      runs.push({ text: value.slice(cursor, match.start), start: cursor, end: match.start });
    runs.push(match);
    cursor = match.end;
  }
  if (cursor < value.length)
    runs.push({ text: value.slice(cursor), start: cursor, end: value.length });
  return runs;
}

export function insertAttachmentReferences(
  value: string,
  attachments: readonly ComposerAttachmentReference[],
  selection = { start: value.length, end: value.length },
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const text = attachments.map(attachmentReferenceText).join(' ');
  const leading = start > 0 && !/\s/u.test(value[start - 1]!) ? ' ' : '';
  const inserted = leading + text + ' ';
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    caret: start + inserted.length,
  };
}

export function removeAttachmentReferences(
  value: string,
  item: ComposerAttachmentReference,
  mentions: readonly SelectedMention[] = [],
  channelRefs: readonly SelectedChannelRef[] = [],
): { value: string; mentions: SelectedMention[]; channelRefs: SelectedChannelRef[] } {
  let draft = { value, mentions: [...mentions], channelRefs: [...channelRefs] };
  for (const run of attachmentReferenceRuns(value, [item]).reverse()) {
    if (run.attachment === undefined) continue;
    const next = draft.value.slice(0, run.start) + draft.value.slice(run.end);
    draft = {
      value: next,
      mentions: rebaseMentions(draft.value, next, draft.mentions),
      channelRefs: rebaseChannelRefs(draft.value, next, draft.channelRefs),
    };
  }
  return draft;
}

export function deleteAttachmentReference(
  value: string,
  attachments: readonly ComposerAttachmentReference[],
  selection: { start: number; end: number },
  key: 'Backspace' | 'Delete',
): { value: string; caret: number } | undefined {
  const target = attachmentReferenceRuns(value, attachments).find((run) => {
    if (run.attachment === undefined) return false;
    const trailingEnd = value[run.end] === ' ' ? run.end + 1 : run.end;
    if (selection.start !== selection.end)
      return selection.start < trailingEnd && selection.end > run.start;
    return key === 'Backspace'
      ? selection.start > run.start && selection.start <= trailingEnd
      : selection.start >= run.start && selection.start < run.end;
  });
  if (target === undefined) return undefined;
  const start = Math.min(selection.start, target.start);
  const end = Math.max(selection.end, target.end + (value[target.end] === ' ' ? 1 : 0));
  return { value: value.slice(0, start) + value.slice(end), caret: start };
}
