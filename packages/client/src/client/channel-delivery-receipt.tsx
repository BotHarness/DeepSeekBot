import { useId, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { PersonaBotAvatar } from './avatar.js';
import { humanLabel } from './actor-names.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import type { ChannelHumanMember, BotSummary, ChannelMessage } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { color } from './ds/tokens.stylex.js';

type Delivery = NonNullable<ChannelMessage['deliveries']>[number];
type DeliveryState = Delivery['state'] | 'human-read' | 'human-unread';
type Recipient =
  | { kind: 'bot'; botSlug: string; state: Delivery['state'] }
  | { kind: 'human'; humanId: string; displayName: string; state: 'human-read' | 'human-unread' };

const STATE_ORDER: readonly DeliveryState[] = [
  'handled',
  'running',
  'observed',
  'pending',
  'ignored',
  'retryable',
  'needs-repair',
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
  'human-read': color.success,
  'human-unread': color.muted,
};

function stateLabel(state: DeliveryState, t: BotHarnessTranslate): string {
  return t(('message.delivery.' + state) as BotHarnessKey);
}

export function ChannelDeliveryReceipt({
  message,
  bots,
  humanMembers = [],
  t,
}: {
  message: ChannelMessage;
  bots: readonly BotSummary[];
  humanMembers?: readonly ChannelHumanMember[];
  t: BotHarnessTranslate;
}): ReactElement | null {
  const authorSlug = message.author.kind === 'bot' ? message.author.slug : undefined;
  const deliveries = (message.deliveries ?? []).filter(
    (delivery) => delivery.botSlug !== authorSlug,
  );
  const recipients: Recipient[] = [
    ...deliveries.map((delivery) => ({ kind: 'bot' as const, ...delivery })),
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

  if (recipients.length === 0 || message.pending === true || message.streaming === true)
    return null;

  let offset = 0;
  const allRecipients = recipients.length;
  const sectors = groups.map(({ state, recipients }) => {
    const length = (recipients.length / allRecipients) * 360;
    const sector = { state, length, offset };
    offset += length;
    return sector;
  });
  const separator = Math.min(1.6, Math.max(0.8, (360 / allRecipients) * 0.04));
  const pieBackground =
    sectors.length === 1
      ? STATE_COLOR[sectors[0]!.state]
      : `conic-gradient(from 0deg, ${sectors
          .flatMap(({ state, length, offset: start }, index) => {
            const end = start + length;
            const fillEnd = index === sectors.length - 1 ? end : end - separator;
            const fill = STATE_COLOR[state];
            return index === sectors.length - 1
              ? [`${fill} ${start}deg ${end}deg`]
              : [`${fill} ${start}deg ${fillEnd}deg`, `transparent ${fillEnd}deg ${end}deg`];
          })
          .join(', ')})`;

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
        <span className="bh-delivery-badge" aria-hidden="true">
          <span className="bh-delivery-pie" style={{ background: pieBackground }} />
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
                        return (
                          <li key={'bot:' + recipient.botSlug} title={name}>
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
