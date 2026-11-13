import {
  reactable,
  type ConversationMessage,
  type MessageAttachment,
} from '../../host/conversation';
import { t } from '../strings';
import type { BubbleGroup } from './bubble-shape';
import type { Rect } from './menu-placement';
import { separatorLabel } from './message-groups';
import { messageSource } from './message-source';

export type ActivityMenuLink = { label?: string; onOpen?: () => void };
export type MessageMenuTarget = {
  message: ConversationMessage;
  anchor: Rect;
  group: BubbleGroup;
  activity?: ActivityMenuLink;
  actions?: { feedback(): void; select(): void };
};

export type MessageMenuAction =
  | { key: 'copy' | 'select-copy' | 'share' | 'open' | 'feedback' | 'select'; label: string }
  | { key: 'download'; label: string; attachment: MessageAttachment }
  | { key: 'attachments'; label: string; attachments: MessageAttachment[] };

export function actionId(action: MessageMenuAction): string {
  return action.key === 'download' ? `download:${action.attachment.key}` : action.key;
}

function downloads(message: ConversationMessage): MessageMenuAction[] {
  const audio = message.voice?.audio;
  return [...(audio === undefined ? [] : [audio]), ...message.attachments]
    .filter((attachment) => attachment.source !== undefined && attachment.cleared !== true)
    .map((attachment) => ({
      key: 'download' as const,
      label: t.shareFile(attachment.name),
      attachment,
    }));
}

export type MessageActionsProps = {
  target: MessageMenuTarget | undefined;
  readOnly?: boolean;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
  onSelectCopy?: ((message: ConversationMessage) => void) | undefined;
  onShareText(text: string): void;
  onShareAttachment?: ((attachment: MessageAttachment) => unknown) | undefined;
};

export function messageMenuActions(
  message: ConversationMessage,
  activity?: ActivityMenuLink,
  reporting = false,
  selectCopy = false,
  groupAttachments = false,
): MessageMenuAction[] {
  const extra: MessageMenuAction[] =
    reporting && message.delivery === 'committed'
      ? [
          { key: 'feedback', label: t.feedback.title },
          { key: 'select', label: t.feedback.select },
        ]
      : [];
  const availableFiles = activity === undefined ? downloads(message) : [];
  const files: MessageMenuAction[] =
    groupAttachments && availableFiles.length > 1
      ? [
          {
            key: 'attachments',
            label: t.downloadAttachments(availableFiles.length),
            attachments: availableFiles.flatMap((action) =>
              action.key === 'download' ? [action.attachment] : [],
            ),
          },
        ]
      : availableFiles;
  const source: MessageMenuAction[] =
    selectCopy && activity === undefined && messageSource(message).trim() !== ''
      ? [{ key: 'select-copy', label: t.selectCopy }]
      : [];
  if (message.body.trim() === '') return [...source, ...files, ...extra];
  return [
    ...(activity?.onOpen === undefined || activity.label === undefined
      ? []
      : [{ key: 'open' as const, label: activity.label }]),
    { key: 'copy', label: t.copy },
    ...source,
    { key: 'share', label: t.shareText },
    ...files,
    ...extra,
  ];
}

export function menuGroups(actions: MessageMenuAction[]): MessageMenuAction[][] {
  if (!actions.some((action) => action.key === 'open'))
    return actions.length === 0 ? [] : [actions];
  return [
    actions.filter((action) => action.key === 'copy'),
    actions.filter((action) => action.key !== 'copy'),
  ].filter((group) => group.length > 0);
}

export function menuTime(iso: string, now: Date): string {
  const label = separatorLabel(iso, now, t.yesterday);
  return label !== '' && new Date(iso).toDateString() === now.toDateString()
    ? `${t.today} ${label}`
    : label;
}

export function menuReactions(target: MessageMenuTarget, readOnly: boolean): boolean {
  return target.activity === undefined && !readOnly && reactable(target.message);
}

export function menuLabel(target: MessageMenuTarget): string {
  return target.activity === undefined ? t.messageActions : t.activityRow.actions;
}

export function dismissQueue(os: string) {
  let pending: (() => void) | undefined;
  return {
    after(run: () => void) {
      if (os === 'ios') pending = run;
      else run();
    },
    flush() {
      const run = pending;
      pending = undefined;
      run?.();
    },
  };
}

export function runAction(
  action: MessageMenuAction,
  message: ConversationMessage,
  handlers: {
    onCopy(text: string): void;
    onSelectCopy?: ((message: ConversationMessage) => void) | undefined;
    onShareText(text: string): void;
    onOpen(): void;
    onFeedback?: (() => void) | undefined;
    onSelect?: (() => void) | undefined;
    onShareAttachment?: ((attachment: MessageAttachment) => void) | undefined;
    onChooseAttachments?: ((attachments: MessageAttachment[]) => void) | undefined;
  },
): void {
  if (action.key === 'attachments') handlers.onChooseAttachments?.(action.attachments);
  else if (action.key === 'download') handlers.onShareAttachment?.(action.attachment);
  else if (action.key === 'open') handlers.onOpen();
  else if (action.key === 'copy') handlers.onCopy(message.body);
  else if (action.key === 'select-copy') handlers.onSelectCopy?.(message);
  else if (action.key === 'feedback') handlers.onFeedback?.();
  else if (action.key === 'select') handlers.onSelect?.();
  else handlers.onShareText(message.body);
}
