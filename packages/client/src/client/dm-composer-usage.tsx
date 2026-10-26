import { ActionButton, ActionGroup } from './ds/action-button.js';
import { useSessionMaintenance, sessionMaintenanceText } from './session-maintenance.js';
import { useId, useState, type CSSProperties, type ReactElement, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronRightOutlineRegular,
  IconCloseOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ProfileActivity, ProfileSessionUsage } from './bridge.js';
import { botNameSource, paintBotName, paintBotScale } from './bot-primary-color.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { compactTokenCount, profileTokenSummaryText } from './profile-token-summary.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { BotPromptView } from './bot-prompt-viewer.js';

export function DmComposerUsagePopover({
  bot,
  context,
  channelId,
  actions,
  activity,
  t,
  trigger,
  onClose,
  onDetails,
  onInspect,
}: {
  bot: BotSummary;
  context?: Awaited<ReturnType<BridgeActions['botContext']>> | undefined;
  channelId: string;
  actions: BridgeActions;
  activity: ProfileActivity | undefined;
  t: BotHarnessTranslate;
  trigger: RefObject<HTMLButtonElement>;
  onClose(): void;
  onDetails(): void;
  onInspect?(view: BotPromptView): void;
}): ReactElement {
  const titleId = useId();
  const maintenance = useSessionMaintenance(actions, channelId, bot.slug);
  const [result, setResult] = useState<ProfileSessionUsage>();
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      let active = true;
      const place = () => {
        const rect = trigger.current?.getBoundingClientRect();
        if (rect === undefined) return;
        const width = Math.min(360, window.innerWidth - 32);
        setPosition({
          width,
          left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
          bottom: Math.max(8, window.innerHeight - rect.top + 8),
        });
      };
      place();
      node.focus();
      void actions.profileSessionUsage(channelId).then(
        (value) => {
          if (!active) return;
          if (value.slug !== bot.slug) setFailed(true);
          else setResult(value);
        },
        () => {
          if (active) setFailed(true);
        },
      );
      const outside = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !node.contains(event.target) &&
          !trigger.current?.contains(event.target)
        )
          onClose();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        trigger.current?.focus();
      };
      document.addEventListener('pointerdown', outside);
      document.addEventListener('keydown', escape);
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, true);
      return () => {
        active = false;
        document.removeEventListener('pointerdown', outside);
        document.removeEventListener('keydown', escape);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
      };
    },
    [actions, channelId, bot.slug],
  );
  const source = botNameSource(bot);
  const rows = result?.rows ?? [];
  const knownTotal = rows.reduce(
    (total, row) =>
      total + (row.status === 'ready' || row.status === 'partial' ? (row.totalTokens ?? 0) : 0),
    0,
  );
  const sessionShare = (row: ProfileSessionUsage['rows'][number]) =>
    knownTotal > 0 &&
    row.totalTokens !== null &&
    (row.status === 'ready' || row.status === 'partial')
      ? Math.round((row.totalTokens / knownTotal) * 100)
      : undefined;
  const sessionCount = (row: ProfileSessionUsage['rows'][number]) => {
    if (row.status === 'unavailable') return t('composerContext.unavailable');
    if (row.totalTokens === null) return t('profile.usage.unknown');
    const count = compactTokenCount(row.totalTokens);
    return row.status === 'partial' ? t('composerContext.partial', { count }) : count;
  };
  return createPortal(
    <div
      ref={mount}
      className="bh-composer-usage-popover"
      data-bh-appearance-owned=""
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={position}
    >
      <div className="bh-composer-usage-head">
        <strong id={titleId}>{t('composerContext.usageTitle')}</strong>
        <button
          type="button"
          onClick={() => {
            onClose();
            trigger.current?.focus();
          }}
          aria-label={t('approval.cancel')}
        >
          <IconCloseOutlineRegular size={16} />
        </button>
      </div>
      <section
        className="bh-composer-usage-section"
        aria-label={t('composerContext.contextDetails')}
      >
        <h3>{t('composerContext.contextDetails')}</h3>
        {context === undefined ? (
          <p role="status">{t('composerContext.unavailable')}</p>
        ) : (
          <>
            {(
              [
                [t('composerContext.contextUsed'), context.usedTokens],
                [t('composerContext.contextCapacity'), context.contextWindow],
                [
                  t('composerContext.contextRemaining'),
                  context.usedTokens === null
                    ? null
                    : Math.max(0, context.contextWindow - context.usedTokens),
                ],
                [t('composerContext.contextThreshold'), Math.max(0, context.thresholdTokens)],
              ] as const
            ).map(([label, value]) => (
              <div className="bh-composer-usage-row" key={label}>
                <span>{label}</span>
                <strong>
                  {value === null ? t('profile.usage.unknown') : value.toLocaleString('en-US')}
                </strong>
              </div>
            ))}
            <div className="bh-composer-usage-row">
              <span>{t('composerContext.contextSource')}</span>
              <strong>
                {t(
                  context.capacitySource === 'model'
                    ? 'composerContext.capacityModel'
                    : 'composerContext.capacityEstimate',
                )}
              </strong>
            </div>
            <p className="bh-composer-usage-caption">{t('composerContext.contextHint')}</p>
          </>
        )}
      </section>
      {maintenance.available ? (
        <ActionGroup>
          <ActionButton
            icon="archive"
            busy={maintenance.pending === 'compact'}
            disabled={maintenance.pending !== undefined}
            onClick={() => void maintenance.run('compact')}
          >
            {t('composerContext.compactNow')}
          </ActionButton>
          <ActionButton
            icon="plus"
            busy={maintenance.pending === 'new-session'}
            disabled={maintenance.pending !== undefined}
            onClick={() => void maintenance.run('new-session')}
          >
            {t('composerCommand.newSession')}
          </ActionButton>
        </ActionGroup>
      ) : null}
      {onInspect === undefined ? null : (
        <ActionGroup>
          <ActionButton icon="terminal" onClick={() => onInspect('system-prompt')}>
            {t('composerContext.viewSystemPrompt')}
          </ActionButton>
          <ActionButton icon="message-square" onClick={() => onInspect('turn-input')}>
            {t('composerContext.viewTurnInput')}
          </ActionButton>
        </ActionGroup>
      )}
      {maintenance.notice ? (
        <p role="status" className="bh-composer-usage-caption">
          {sessionMaintenanceText(maintenance.notice, t)}
        </p>
      ) : null}
      <h3>{t('composerContext.cumulativeUsage')}</h3>
      <div className="bh-composer-usage-total">
        <span ref={(element) => paintBotName(element, source)}>{bot.displayName}</span>
        <strong>
          {t('composerContext.tokens', { count: profileTokenSummaryText(activity, t, true) })}
        </strong>
      </div>
      {failed ? (
        <p role="status">{t('composerContext.unavailable')}</p>
      ) : result === undefined ? (
        <p role="status">{t('composerContext.loading')}</p>
      ) : (
        <>
          {(['orchestrator', 'assignment'] as const).map((role) => (
            <section key={role} className="bh-composer-usage-section">
              <h3>
                {t(
                  role === 'orchestrator'
                    ? 'composerContext.currentSession'
                    : 'composerContext.recentAssignments',
                )}
              </h3>
              {rows.filter((row) => row.role === role).length === 0 ? (
                <p className="bh-composer-usage-caption">{t('composerContext.noSessions')}</p>
              ) : (
                rows
                  .filter((row) => row.role === role)
                  .map((row) => (
                    <div className="bh-composer-usage-session" key={row.sessionId}>
                      <div className="bh-composer-usage-row">
                        <ChannelSidebarIcon
                          name={role === 'orchestrator' ? 'bot' : 'list-checks'}
                          size={14}
                        />
                        <span title={row.label}>
                          {role === 'orchestrator' ? 'Orchestrator' : row.label}
                        </span>
                        <strong>
                          {sessionCount(row)}
                          {sessionShare(row) === undefined ? '' : ` 路 ${sessionShare(row)}%`}
                        </strong>
                      </div>
                      {sessionShare(row) === undefined ? null : (
                        <div
                          ref={(element) => paintBotScale(element, source)}
                          className="bh-composer-usage-meter"
                          role="meter"
                          aria-label={t('composerContext.sessionShare')}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={sessionShare(row)}
                        >
                          <span style={{ width: `${sessionShare(row)}%` }} />
                        </div>
                      )}
                    </div>
                  ))
              )}
            </section>
          ))}
        </>
      )}
      <div className="bh-composer-usage-footer">
        <button type="button" className="bh-composer-usage-details" onClick={onDetails}>
          <span>{t('composerContext.details')}</span>
          <IconChevronRightOutlineRegular size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
