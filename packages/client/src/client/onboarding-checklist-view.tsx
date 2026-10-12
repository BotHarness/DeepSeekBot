import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { onboardingFor, type OnboardingController } from './onboarding.js';
import {
  CHECKLIST_ITEMS,
  CHECKLIST_NEEDS_CONVERSATION,
  CHECKLIST_TIER,
  checklistDone,
  checklistSettled,
  type ChecklistItem,
  type ChecklistTier,
} from './onboarding-checklist.js';
import { store } from './store.js';

const LAUNCHER_SELECTOR = '[data-bh-onboarding-launcher]';

function ProgressRing({ done, total }: { done: number; total: number }): ReactElement {
  const radius = 7;
  const length = 2 * Math.PI * radius;
  return (
    <svg className="bh-onboarding-ring" viewBox="0 0 18 18" width="18" height="18" aria-hidden>
      <circle className="bh-onboarding-ring-track" cx="9" cy="9" r={radius} />
      <circle
        className="bh-onboarding-ring-value"
        cx="9"
        cy="9"
        r={radius}
        strokeDasharray={length}
        strokeDashoffset={length * (1 - done / total)}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

export function OnboardingLauncher({
  actions,
  t,
  placement,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  placement: 'row' | 'header';
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  if (state.receipt === undefined) return null;
  const total = CHECKLIST_ITEMS.length;
  const done = checklistDone(state.evidence);
  const label = t('onboarding.launcher.progress', { done: String(done), total: String(total) });
  return (
    <span
      className="bh-onboarding-launcher"
      data-bh-onboarding-launcher={placement}
      data-settled={checklistSettled(state.receipt, state.evidence) ? 'true' : 'false'}
      data-open={state.checklistOpen ? 'true' : 'false'}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-expanded={state.checklistOpen}
      aria-label={label}
      title={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.checklistOpen) controller.closeChecklist();
        else controller.openChecklist();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        if (state.checklistOpen) controller.closeChecklist();
        else controller.openChecklist();
      }}
    >
      <ProgressRing done={done} total={total} />
    </span>
  );
}

interface Position {
  placement: 'anchored' | 'sheet';
  left?: number;
  top?: number;
}

function anchorPosition(): Position {
  if (typeof document === 'undefined') return { placement: 'sheet' };
  for (const node of document.querySelectorAll<HTMLElement>(LAUNCHER_SELECTOR)) {
    if (node.getBoundingClientRect().width === 0) continue;
    if (node.dataset['bhOnboardingLauncher'] !== 'row') continue;
    const rect = (node.closest('nav') ?? node).getBoundingClientRect();
    const width = 340;
    const left = Math.min(rect.right + 12, window.innerWidth - width - 12);
    const top = Math.max(12, Math.min(rect.top - 12, window.innerHeight - 520));
    return { placement: 'anchored', left, top };
  }
  return { placement: 'sheet' };
}

function itemAction(
  item: ChecklistItem,
  controller: OnboardingController,
  t: BotHarnessTranslate,
): (() => void) | undefined {
  const target = controller.target();
  if (target === undefined) return undefined;
  switch (item) {
    case 'model':
      return () => {
        controller.closeChecklistForAction();
        controller.chooseModel(target.channelId, target.slug);
      };
    case 'conversation':
      return () => void controller.focusConversation();
    case 'memory':
      return () => void controller.openExperience('memory');
    case 'im':
      return () => void controller.openExperience('im');
    case 'schedule':
      return () => {
        let timeZone: string | undefined;
        try {
          timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
        } catch {}
        controller.closeChecklistForAction();
        void controller.request(
          target.channelId,
          timeZone ? t('onboarding.dailyBody', { timeZone }) : t('onboarding.dailyUnknownBody'),
        );
      };
    case 'companion':
      return () => controller.summonCompanion();
  }
}

const TIERS: readonly ChecklistTier[] = ['required', 'recommended', 'extra'];

export function OnboardingChecklist({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [position, setPosition] = useState<Position>({ placement: 'sheet' });
  const [page, setPage] = useState<number | undefined>(undefined);
  const mount = useMountedResource<HTMLDivElement>(
    (panel) => {
      setPosition(anchorPosition());
      const reposition = (): void => setPosition(anchorPosition());
      const onPointerDown = (event: PointerEvent): void => {
        const target = event.target as Element | null;
        if (target === null || panel.contains(target) || target.closest(LAUNCHER_SELECTOR)) return;
        if (target.closest('[role="dialog"]')) return;
        controller.closeChecklist();
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') controller.closeChecklist();
      };
      window.addEventListener('resize', reposition);
      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('keydown', onKeyDown);
      return () => {
        setPage(undefined);
        window.removeEventListener('resize', reposition);
        document.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('keydown', onKeyDown);
      };
    },
    [controller],
  );
  if (!state.checklistOpen || state.receipt === undefined || typeof document === 'undefined')
    return null;
  const evidence = state.evidence;
  const completed = state.receipt.completed;
  const total = CHECKLIST_ITEMS.length;
  const done = checklistDone(evidence);
  const busy = state.busy || client.conversation.sending;
  const itemState = (item: ChecklistItem): 'done' | 'locked' | 'todo' =>
    evidence?.[item] === true
      ? 'done'
      : CHECKLIST_NEEDS_CONVERSATION.has(item) && !completed
        ? 'locked'
        : 'todo';
  const renderItem = (item: ChecklistItem): ReactElement => {
    const status = itemState(item);
    const action = itemAction(item, controller, t);
    return (
      <li key={item} className="bh-onboarding-checklist-item" data-item={item} data-state={status}>
        <span className="bh-onboarding-checklist-mark" aria-hidden>
          {status === 'done' ? (
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : null}
        </span>
        <span className="bh-onboarding-checklist-text">
          <span className="bh-onboarding-checklist-name">
            {t(`onboarding.checklist.${item}.title` as BotHarnessKey)}
          </span>
          <span className="bh-note">
            {status === 'locked'
              ? t('onboarding.checklist.locked')
              : t(`onboarding.checklist.${item}.hint` as BotHarnessKey)}
          </span>
        </span>
        {status === 'done' ? (
          <span className="bh-onboarding-checklist-status">{t('onboarding.checklist.done')}</span>
        ) : (
          <Button
            variant="outline"
            disabled={status === 'locked' || busy || action === undefined}
            onClick={action}
          >
            {t(`onboarding.checklist.${item}.action` as BotHarnessKey)}
          </Button>
        )}
      </li>
    );
  };
  const compact = position.placement === 'sheet';
  const nextIndex = Math.max(
    0,
    CHECKLIST_ITEMS.findIndex((item) => itemState(item) === 'todo'),
  );
  const index = Math.min(page ?? nextIndex, total - 1);
  const pageItem = CHECKLIST_ITEMS[index]!;
  return createPortal(
    <div
      ref={mount}
      className="bh-root bh-onboarding-checklist"
      role="dialog"
      aria-label={t('onboarding.checklist.title')}
      data-placement={position.placement}
      style={
        position.placement === 'anchored' ? { left: position.left, top: position.top } : undefined
      }
    >
      <header className="bh-onboarding-checklist-header">
        <div className="bh-onboarding-checklist-heading">
          <strong>{t('onboarding.checklist.title')}</strong>
          {compact ? null : <span className="bh-note">{t('onboarding.checklist.subtitle')}</span>}
        </div>
        <button
          type="button"
          className="bh-onboarding-checklist-close"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={() => controller.closeChecklist()}
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>
      <div
        className="bh-onboarding-checklist-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('onboarding.checklist.progress', {
          done: String(done),
          total: String(total),
        })}
      >
        <span style={{ width: `${(done / total) * 100}%` }} />
      </div>
      {compact ? (
        <section className="bh-onboarding-checklist-tier" data-page={pageItem}>
          <h3>
            {t(`onboarding.checklist.tier.${CHECKLIST_TIER[pageItem]}` as BotHarnessKey)}
            {' · '}
            {t('onboarding.checklist.page', {
              current: String(index + 1),
              total: String(total),
            })}
          </h3>
          <ul>{renderItem(pageItem)}</ul>
        </section>
      ) : (
        TIERS.map((tier) => (
          <section key={tier} className="bh-onboarding-checklist-tier">
            <h3>{t(`onboarding.checklist.tier.${tier}` as BotHarnessKey)}</h3>
            <ul>
              {CHECKLIST_ITEMS.filter((item) => CHECKLIST_TIER[item] === tier).map(renderItem)}
            </ul>
          </section>
        ))
      )}
      <p className="bh-note bh-onboarding-checklist-exit">
        {t(compact ? 'onboarding.checklist.exitHintMobile' : 'onboarding.checklist.exitHint')}
      </p>
      <footer className="bh-onboarding-checklist-footer">
        {compact ? (
          <span className="bh-onboarding-checklist-pager">
            <button
              type="button"
              className="bh-onboarding-checklist-close"
              aria-label={t('onboarding.checklist.prev')}
              title={t('onboarding.checklist.prev')}
              disabled={index === 0}
              onClick={() => setPage(index - 1)}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className="bh-onboarding-checklist-dots" aria-hidden>
              {CHECKLIST_ITEMS.map((item, dot) => (
                <span key={item} data-state={itemState(item)} data-current={dot === index} />
              ))}
            </span>
            <button
              type="button"
              className="bh-onboarding-checklist-close"
              aria-label={t('onboarding.checklist.next')}
              title={t('onboarding.checklist.next')}
              disabled={index === total - 1}
              onClick={() => setPage(index + 1)}
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </span>
        ) : null}
        <Button variant="ghost" onClick={() => controller.skipTutorial()}>
          {t('onboarding.checklist.skip')}
        </Button>
        <Button variant="outline" onClick={() => void controller.startTour()}>
          {t('onboarding.checklist.tour')}
        </Button>
      </footer>
    </div>,
    document.body,
  );
}

const ENTERED_KEY = 'botharness/onboarding/bot-mode-entered';

export function markBotModeEntered(): void {
  try {
    localStorage.setItem(ENTERED_KEY, '1');
  } catch {}
}

function botModeEntered(): boolean {
  try {
    return localStorage.getItem(ENTERED_KEY) !== null;
  } catch {
    return true;
  }
}

export function OnboardingEnterHint({ t }: { t: BotHarnessTranslate }): ReactElement | null {
  if (botModeEntered()) return null;
  return (
    <span className="bh-onboarding-enter" title={t('onboarding.enter.hint')}>
      <span className="bh-onboarding-enter-dot" aria-hidden />
      {t('onboarding.enter.title')}
    </span>
  );
}
