import { reactable, type ConversationMessage } from '../../host/conversation';
import { t } from '../strings';
import type { BubbleGroup } from './bubble-shape';
import type { Rect } from './menu-placement';
import { separatorLabel } from './message-groups';

export type ActivityMenuLink = { label?: string; onOpen?: () => void };
export type MessageMenuTarget = {
  message: ConversationMessage;
  anchor: Rect;
  group: BubbleGroup;
  activity?: ActivityMenuLink;
  actions?: { feedback(): void; select(): void };
};

export type MessageMenuAction = {
  key: 'copy' | 'share' | 'open' | 'feedback' | 'select';
  label: string;
};

export type MessageActionsProps = {
  target: MessageMenuTarget | undefined;
  readOnly?: boolean;
  onClose(): void;
  onReact(message: ConversationMessage, emoji: string, active: boolean): void;
  onCopy(text: string): void;
  onShareText(text: string): void;
};

export function messageMenuActions(
  message: ConversationMessage,
  activity?: ActivityMenuLink,
  reporting = false,
): MessageMenuAction[] {
  const extra: MessageMenuAction[] =
    reporting && message.delivery === 'committed'
      ? [
          { key: 'feedback', label: t.feedback.title },
          { key: 'select', label: t.feedback.select },
        ]
      : [];
  if (message.body.trim() === '') return extra;
  return [
    ...(activity?.onOpen === undefined || activity.label === undefined
      ? []
      : [{ key: 'open' as const, label: activity.label }]),
    { key: 'copy', label: t.copy },
    { key: 'share', label: t.shareText },
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
    onShareText(text: string): void;
    onOpen(): void;
    onFeedback?: (() => void) | undefined;
    onSelect?: (() => void) | undefined;
  },
): void {
  if (action.key === 'open') handlers.onOpen();
  else if (action.key === 'copy') handlers.onCopy(message.body);
  else if (action.key === 'feedback') handlers.onFeedback?.();
  else if (action.key === 'select') handlers.onSelect?.();
  else handlers.onShareText(message.body);
}
