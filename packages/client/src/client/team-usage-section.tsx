import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeCall } from './bridge.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsSection } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { formatTokenCount } from './profile-cards-builtins.js';
import {
  loadMemberUsage,
  USAGE_PERIODS,
  type MemberUsageView,
  type UsagePeriod,
  type UsageTotals,
} from './team-usage.js';

const styles = stylex.create({
  list: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  total: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  bots: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: space.x3,
    rowGap: space.x1,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; period: UsagePeriod; view: MemberUsageView };

function tokens(t: BotHarnessTranslate, totals: UsageTotals): string {
  if (totals.totalTokens === null) return t('team.usage.unknown');
  const value = formatTokenCount(totals.totalTokens);
  return totals.partial ? t('team.usage.partial', { value }) : value;
}

export function TeamUsageSection({
  call,
  t,
}: {
  call: BridgeCall;
  t: BotHarnessTranslate;
}): ReactElement {
  const [period, setPeriod] = useState<UsagePeriod>('week');
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    setLoad({ state: 'loading' });
    loadMemberUsage(call, period, controller.signal)
      .then((view) => {
        if (!controller.signal.aborted) setLoad({ state: 'ready', period, view });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'failed' });
      });
    return () => controller.abort();
  }, [call, period]);
  return (
    <SettingsSection title={t('team.usage.title')}>
      <SettingsRow
        rootRef={mount}
        title={t('team.usage.period')}
        data={{ 'data-team-row': 'usage-period' }}
        control={
          <Select
            label={t('team.usage.period')}
            value={period}
            options={USAGE_PERIODS.map((range) => ({
              value: range,
              label: t(`overviewUsage.period.${range}`),
            }))}
            onChange={setPeriod}
          />
        }
      />
      {load.state === 'loading' ? (
        <Note>{t('team.usage.loading')}</Note>
      ) : load.state === 'failed' ? (
        <Note tone="danger">{t('team.usage.failed')}</Note>
      ) : load.view.members.length === 0 ? (
        <Note>{t('team.usage.empty')}</Note>
      ) : (
        <div {...stylex.props(styles.list)} role="list" aria-label={t('team.usage.title')}>
          {load.view.members.map((member) => (
            <div role="listitem" key={member.humanId} data-team-usage={member.humanId}>
              <SettingsRow
                title={member.displayName}
                description={member.deleted ? t('team.usage.deleted') : undefined}
                control={<span {...stylex.props(styles.total)}>{tokens(t, member.totals)}</span>}
              >
                {member.bots.length === 0 ? null : (
                  <ul {...stylex.props(styles.bots)}>
                    {member.bots.map((bot) => (
                      <li key={bot.slug}>{`${bot.displayName} ${tokens(t, bot.totals)}`}</li>
                    ))}
                  </ul>
                )}
              </SettingsRow>
            </div>
          ))}
        </div>
      )}
      {load.state === 'ready' && load.view.legacy ? <Note>{t('team.usage.legacy')}</Note> : null}
    </SettingsSection>
  );
}
