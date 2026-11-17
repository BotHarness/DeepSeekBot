import * as stylex from '@stylexjs/stylex';
import type { ReactElement } from 'react';
import type { ChannelModelSwitch } from '../../../core/src/channels/model-switch.js';
import { PersonaBotAvatar } from './avatar.js';
import { joinClass } from './ds/class-name.js';
import { font } from './ds/tobs.stylex.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

const styles = stylex.create({
  line: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    maxWidth: '100%',
    marginBlock: space.x2,
    marginInline: 'auto',
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderRadius: radius.sm,
    color: color.muted,
    fontSize: text.metaSize,
    whiteSpace: 'nowrap',
  },
  fixed: { flex: 'none' },
  route: { flex: 'none', fontFamily: font.familyMono, fontSize: text.metaSize },
  to: { color: color.fg },
  reason: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
});

const routeOf = (route: ChannelModelSwitch['from']) => `${route.provider}/${route.model}`;

export function modelSwitchReason(record: ChannelModelSwitch, t: BotHarnessTranslate): string {
  if (record.reason === 'returned') return t('modelSwitch.returned');
  if (record.until === undefined)
    return t(
      record.reason === 'credential'
        ? 'modelSwitch.credential'
        : record.reason === 'rate-limit'
          ? 'modelSwitch.rateLimit'
          : 'modelSwitch.quota',
    );
  const until = new Date(record.until).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return t(
    record.reason === 'credential'
      ? 'modelSwitch.credentialUntil'
      : record.reason === 'rate-limit'
        ? 'modelSwitch.rateLimitUntil'
        : 'modelSwitch.quotaUntil',
    { until },
  );
}

export function ModelSwitchLine({
  messageId,
  record,
  bots,
  t,
}: {
  messageId: string;
  record: ChannelModelSwitch;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === record.botSlug);
  const name = bot?.displayName ?? record.botName;
  const reason = modelSwitchReason(record, t);
  return (
    <div className="bh-memory-commit-row">
      <div
        {...stylex.props(styles.line)}
        data-model-switch=""
        data-message-id={messageId}
        title={`${routeOf(record.from)} → ${routeOf(record.to)} · ${reason}`}
      >
        <span className={joinClass('bh-bot-dm-action-bot', stylex.props(styles.fixed).className)}>
          <span className="bh-bot-dm-action-avatar" aria-hidden="true">
            <PersonaBotAvatar
              t={t}
              personaBotId={record.botSlug}
              name={name}
              src={bot?.avatar}
              appearance={bot?.appearance}
              avatarSeed={bot?.avatarSeed}
              size={16}
              indicator={false}
              still
            />
          </span>
          <span className="bh-bot-dm-action-name">{name}</span>
        </span>
        <span {...stylex.props(styles.fixed)}>{t('modelSwitch.switched')}</span>
        <span {...stylex.props(styles.route)}>{routeOf(record.from)}</span>
        <span aria-hidden="true" {...stylex.props(styles.fixed)}>
          →
        </span>
        <span {...stylex.props(styles.route, styles.to)}>{routeOf(record.to)}</span>
        <span {...stylex.props(styles.reason)}>{reason}</span>
      </div>
    </div>
  );
}
