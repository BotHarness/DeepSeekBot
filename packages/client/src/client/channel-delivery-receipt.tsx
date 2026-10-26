import { createContext, useContext, useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { PersonaBotAvatar } from './avatar.js';
import { humanLabel } from './actor-names.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import type { ChannelHumanMember, BotSummary, ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { color } from './ds/tokens.stylex.js';

type Delivery = NonNullable<ChannelMessage['deliveries']>[number];
type BotState = Delivery['state'] | 'missing';
type DeliveryState = BotState | 'human-read' | 'human-unread';
type Recipient =
  | { kind: 'bot'; botSlug: string; state: BotState }
  | { kind: 'human'; humanId: string; displayName: string; state: 'human-read' | 'human-unread' };

const STATE_ORDER: readonly DeliveryState[] = [
  'handled',
  'running',
  'observed',
  'pending',
  'ignored',
  'retryable',
  'needs-repair',
  'missing',
  'human-read',
  'human-unread',
];

const STATE_COLOR: Readonly<Record<DeliveryState, string>> = {
  handled: color.success,
  running: color.accent,
  observed: color.fg,
  pending: color.muted,
  ignored: color.subtle,
  retryable: color.danger,
  'needs-repair': color.danger,
  missing: color.warning,
  'human-read': color.success,
  'human-unread': color.muted,
};

const STACK_LIMIT = 3;

export const DeliveryReceiptsVisible = createContext(false);

const readingSince = new Map<string, number>();

export function readingBots(messages: readonly ChannelMessage[]): Map<string, string[]> {
  const claimed = new Set<string>();
  const result = new Map<string, string[]>();
  const live = new Set<string>();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.pending === true || message.failed !== undefined) continue;
    const authorSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
    const readers = (message.deliveries ?? [])
      .filter(
        (delivery) =>
          delivery.state === 'running' &&
          delivery.botSlug !== authorSlug &&
          !claimed.has(delivery.botSlug),
      )
      .map((delivery) => delivery.botSlug);
    if (readers.length === 0) continue;
    for (const botSlug of readers) {
      claimed.add(botSlug);
      const key = message.id + ':' + botSlug;
      live.add(key);
      if (!readingSince.has(key)) readingSince.set(key, Date.now());
    }
    result.set(
      message.id,
      readers.sort(
        (left, right) =>
          (readingSince.get(message.id + ':' + right) ?? 0) -
          (readingSince.get(message.id + ':' + left) ?? 0),
      ),
    );
  }
  for (const key of readingSince.keys())
    if (!live.has(key) && messages.some((message) => key.startsWith(message.id + ':')))
      readingSince.delete(key);
  return result;
}

function StackedBotAvatar({
  botSlug,
  bots,
  size,
  ring,
  t,
}: {
  botSlug: string;
  bots: readonly BotSummary[];
  size: number;
  ring?: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === botSlug);
  return (
    <span
      className="bh-stack-avatar"
      style={ring === undefined ? undefined : { boxShadow: `0 0 0 1.5px ${ring}` }}
    >
      <PersonaBotAvatar
        personaBotId={botSlug}
        name={bot?.displayName ?? botSlug}
        src={bot?.avatar}
        appearance={bot?.appearance}
        avatarSeed={bot?.avatarSeed}
        size={size}
        indicator={false}
        nativeTitle={false}
        t={t}
      />
    </span>
  );
}

export function MessageReading({
  readers,
  bots,
  t,
}: {
  readers: readonly string[];
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (readers.length === 0) return null;
  const names = readers
    .map((slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug)
    .join(t('message.reaction.separator'));
  const label = t('message.reading', { names });
  const shown = readers.slice(0, STACK_LIMIT);
  return (
    <span
      className="bh-reading"
      role="img"
      aria-label={label}
      title={label}
      data-message-reading=""
    >
      {shown.map((botSlug) => (
        <StackedBotAvatar key={botSlug} botSlug={botSlug} bots={bots} size={18} t={t} />
      ))}
      {readers.length > shown.length ? (
        <span className="bh-stack-more">+{readers.length - shown.length}</span>
      ) : null}
      <span className="bh-reading-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

function stateLabel(state: DeliveryState, t: BotHarnessTranslate): string {
  return t(('message.delivery.' + state) as BotHarnessKey);
}

export function ChannelDeliveryReceipt({
  message,
  bots,
  humanMembers = [],
  onOpenInbox,
  t,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
  humanMembers?: readonly ChannelHumanMember[];
  onOpenInbox?: ((target: { botSlug: string; missing: boolean }) => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const visible = useContext(DeliveryReceiptsVisible);
  const authorSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const deliveries = (message.deliveries ?? []).filter(
    (delivery) => delivery.botSlug !== authorSlug,
  );
  const admitted = new Set(deliveries.map((delivery) => delivery.botSlug));
  const missing =
    message.author.kind === 'human' && message.failed === undefined && message.unconfirmed !== true
      ? [...new Set((message.mentions ?? []).map((mention) => mention.botSlug))].filter(
          (botSlug) => !admitted.has(botSlug),
        )
      : [];
  const recipients: Recipient[] = [
    ...deliveries.map((delivery) => ({ kind: 'bot' as const, ...delivery })),
    ...missing.map((botSlug) => ({ kind: 'bot' as const, botSlug, state: 'missing' as const })),
    ...(message.author.kind === 'human'
      ? []
      : (message.humanReceipts ?? []).map((receipt) => ({
          kind: 'human' as const,
          humanId: receipt.humanId,
          displayName: receipt.displayName,
          state: receipt.state === 'read' ? ('human-read' as const) : ('human-unread' as const),
        }))),
  ];
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const signature = recipients
    .map(
      (recipient) =>
        (recipient.kind === 'bot' ? recipient.botSlug : recipient.humanId) + ':' + recipient.state,
    )
    .join('|');
  const groups = STATE_ORDER.flatMap((state) => {
    const members = recipients.filter((recipient) => recipient.state === state);
    return members.length === 0 ? [] : [{ state, recipients: members }];
  });
  const summary = groups
    .map(({ state, recipients }) => recipients.length + ' ' + stateLabel(state, t))
    .join(' · ');

  const panelMount = useMountedResource<HTMLDivElement>(
    (panel) => {
      panelRef.current = panel;
      const place = (): void => {
        const anchor = anchorRef.current?.getBoundingClientRect();
        const panel = panelRef.current;
        if (anchor === undefined || panel === null) return;
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const left = Math.max(
          8,
          Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8),
        );
        const below = anchor.bottom + 8;
        const top =
          below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 8);
        setPosition((previous) =>
          previous?.left === left && previous.top === top ? previous : { left, top },
        );
      };
      place();
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      panel.focus();
      const dismissOutside = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
        setOpen(false);
      };
      const dismissEscape = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        anchorRef.current?.focus();
      };
      document.addEventListener('pointerdown', dismissOutside);
      document.addEventListener('focusin', dismissOutside);
      window.addEventListener('keydown', dismissEscape);
      return () => {
        document.removeEventListener('pointerdown', dismissOutside);
        document.removeEventListener('focusin', dismissOutside);
        window.removeEventListener('keydown', dismissEscape);
        window.removeEventListener('scroll', place, true);
        window.removeEventListener('resize', place);
        panelRef.current = null;
      };
    },
    [signature],
  );

  if (!visible || recipients.length === 0 || message.pending === true || message.streaming === true)
    return null;

  const ordered = groups.flatMap((group) => group.recipients);
  const stacked = ordered.slice(0, STACK_LIMIT);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="bh-delivery-trigger"
        aria-label={t('message.delivery.label') + ': ' + summary}
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="bh-delivery-stack" aria-hidden="true">
          {stacked.map((recipient) =>
            recipient.kind === 'bot' ? (
              <StackedBotAvatar
                key={'bot:' + recipient.botSlug}
                botSlug={recipient.botSlug}
                bots={bots}
                size={16}
                ring={STATE_COLOR[recipient.state]}
                t={t}
              />
            ) : (
              <span
                key={'human:' + recipient.humanId}
                className="bh-stack-avatar bh-stack-human"
                style={{ boxShadow: `0 0 0 1.5px ${STATE_COLOR[recipient.state]}` }}
              >
                {humanLabel(
                  humanMembers.find((member) => member.humanId === recipient.humanId)
                    ?.displayName ?? recipient.displayName,
                  t,
                ).slice(0, 1)}
              </span>
            ),
          )}
          {ordered.length > stacked.length ? (
            <span className="bh-stack-more">+{ordered.length - stacked.length}</span>
          ) : null}
        </span>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelMount}
              id={panelId}
              role="dialog"
              aria-label={t('message.delivery.label')}
              tabIndex={-1}
              className="bh-delivery-panel"
              data-bh-appearance-owned=""
              style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position === null ? 'hidden' : 'visible',
              }}
            >
              <div className="bh-delivery-panel-summary">{summary}</div>
              <div className="bh-delivery-panel-groups">
                {groups.map(({ state, recipients }) => (
                  <section key={state} className="bh-delivery-panel-group">
                    <h3>
                      <span className={'bh-delivery-legend bh-delivery-legend-' + state} />
                      {recipients.length} {stateLabel(state, t)}
                    </h3>
                    <ul>
                      {recipients.map((recipient) => {
                        if (recipient.kind === 'human') {
                          const name = humanLabel(
                            humanMembers.find((member) => member.humanId === recipient.humanId)
                              ?.displayName ?? recipient.displayName,
                            t,
                          );
                          return (
                            <li key={'human:' + recipient.humanId} title={name}>
                              <span className="bh-delivery-human-avatar" aria-hidden="true">
                                {name.slice(0, 1)}
                              </span>
                              <span>{name}</span>
                            </li>
                          );
                        }
                        const bot = bots.find((candidate) => candidate.slug === recipient.botSlug);
                        const name = bot?.displayName ?? recipient.botSlug;
                        const content = (
                          <>
                            <PersonaBotAvatar
                              personaBotId={recipient.botSlug}
                              name={name}
                              src={bot?.avatar}
                              appearance={bot?.appearance}
                              avatarSeed={bot?.avatarSeed}
                              size={22}
                              indicator={false}
                              t={t}
                            />
                            <span>{name}</span>
                          </>
                        );
                        return (
                          <li key={'bot:' + recipient.botSlug} title={name}>
                            {onOpenInbox === undefined || bot === undefined ? (
                              content
                            ) : (
                              <button
                                type="button"
                                className="bh-delivery-bot"
                                aria-label={t('message.delivery.openInbox', { name })}
                                onClick={() => {
                                  setOpen(false);
                                  onOpenInbox({
                                    botSlug: recipient.botSlug,
                                    missing: recipient.state === 'missing',
                                  });
                                }}
                              >
                                {content}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
