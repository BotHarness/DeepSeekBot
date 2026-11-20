import { Icon } from '../../ds/icon.js';
import { QuoteIcon } from '../../quote-icon.js';
import { PointerMenu } from '../../ds/pointer-menu.js';
import { useRef, type ReactElement } from 'react';
import { AtSignIcon } from '../../at-sign-icon.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { ChannelMessage } from '../../store.js';
import { selectableMessage } from '../../message-selection-state.js';
import { useMountedResource } from '../../mounted-resource.js';
import { ReactionIcon } from '../../message-reactions.js';
import { bubbleStamp, fullTime, quotableMessage } from './message-labels.js';

export interface MessageMenuRequest {
  message: ChannelMessage;
  x: number;
  y: number;
  selection?: string;
}

export function MessageActionMenu({
  onQuote,
  onFeedback,
  onSelect,
  onReact,
  request,
  onClose,
  t,
}: {
  onQuote?(message: ChannelMessage, text?: string): void;
  onFeedback?(message: ChannelMessage): void;
  onSelect?(message: ChannelMessage): void;
  onReact?(request: MessageMenuRequest): void;
  request: MessageMenuRequest;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  const menuMount = useMountedResource<HTMLSpanElement>(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  return (
    <span ref={menuMount} hidden>
      <PointerMenu
        point={request}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={[
          ...(bubbleStamp(request.message) === undefined
            ? []
            : [
                {
                  type: 'label' as const,
                  id: 'time',
                  text: fullTime(request.message.at, t),
                },
              ]),
          ...(onQuote === undefined || !quotableMessage(request.message)
            ? []
            : [
                {
                  id: 'quote',
                  label:
                    request.selection === undefined
                      ? t('message.quote')
                      : t('message.quoteSelection'),
                  icon: <QuoteIcon />,
                },
              ]),
          ...(onReact === undefined
            ? []
            : [
                {
                  id: 'react',
                  label: t('message.react'),
                  icon: <ReactionIcon />,
                },
              ]),
          {
            id: 'copy',
            label: request.selection === undefined ? t('message.copy') : t('message.copySelection'),
            icon: <Icon name="copy" />,
          },
          ...(onSelect === undefined || !selectableMessage(request.message)
            ? []
            : [
                {
                  id: 'select',
                  label: t('message.select'),
                  icon: <Icon name="list-checks" />,
                },
              ]),
          ...(onFeedback === undefined || !selectableMessage(request.message)
            ? []
            : [
                {
                  id: 'feedback',
                  label: t('feedback.title'),
                  icon: <ReactionIcon />,
                },
              ]),
        ]}
        onSelect={(id) => {
          if (id === 'quote') onQuote?.(request.message, request.selection);
          else if (id === 'react') onReact?.(request);
          else if (id === 'feedback') onFeedback?.(request.message);
          else if (id === 'copy') {
            void navigator.clipboard?.writeText(request.selection ?? request.message.body);
          } else if (id === 'select') onSelect?.(request.message);
          onClose();
        }}
        onClose={onClose}
      />
    </span>
  );
}

export interface AvatarMenuRequest {
  botSlug: string;
  x: number;
  y: number;
}

export function BotAvatarMenu({
  request,
  canMention,
  onMessage,
  onMention,
  onProfile,
  onClose,
  t,
}: {
  request: AvatarMenuRequest;
  canMention: boolean;
  onMessage(botSlug: string): void;
  onMention(botSlug: string): void;
  onProfile(botSlug: string): void;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  return (
    <span hidden>
      <PointerMenu
        point={request}
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        items={[
          {
            id: 'message',
            label: t('message.avatar.message'),
            icon: <Icon name="message-square-plus" />,
          },
          ...(canMention
            ? [
                {
                  id: 'mention',
                  label: t('message.avatar.mention'),
                  icon: <AtSignIcon />,
                },
              ]
            : []),
          {
            id: 'profile',
            label: t('message.avatar.profile'),
            icon: <Icon name="user" />,
          },
        ]}
        onSelect={(id) => {
          if (id === 'message') onMessage(request.botSlug);
          else if (id === 'mention') onMention(request.botSlug);
          else if (id === 'profile') onProfile(request.botSlug);
          onClose();
        }}
        onClose={onClose}
      />
    </span>
  );
}
