import type { BotHarnessTranslate } from './locale.js';
import { NARROW_CHANNEL_SIDEBAR_QUERY } from './channel-sidebar-layout.js';
import { channelSidebarPrefs, channelSidebarScopeKey } from './channel-sidebar-prefs.js';
import { hostAcknowledgements } from './host-acknowledgements.js';
import { startInternalTour, type InternalTourSpec } from './internal-tour.js';

const SEEN_KEY = 'botharness/onboarding/sessions-seen';
const PENDING_KEY = 'botharness/onboarding/sessions-tour';
const RETURN_KEY = 'botharness/onboarding/sessions-return';
const PENDING_TTL_MS = 10 * 60_000;
const BOT_STEPS = 2;
const DSH_STEPS = 2;

export const SESSIONS_TAB_SELECTOR =
  '[data-bh-tour="channel-sidebar"] [role="tab"][data-tab-id="conversation"]';
export const SESSIONS_LIST_SELECTOR = '[data-bh-tour="channel-sidebar"] [data-sessions]';
export const SESSIONS_ROW_SELECTOR =
  '[data-bh-tour="channel-sidebar"] [data-sessions] button.bh-session-row:not(:disabled)';
export const SESSION_RETURN_SELECTOR = '.bh-session-return-action';

const SEEN_ACK = 'onboarding-sessions';

export function sessionsTourSeen(): boolean {
  const acks = hostAcknowledgements();
  if (acks !== undefined) return acks.value(SEEN_ACK, SEEN_KEY) !== undefined;
  try {
    return localStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

export function markSessionsTourSeen(): void {
  const acks = hostAcknowledgements();
  if (acks !== undefined) {
    acks.record(SEEN_ACK, '1', SEEN_KEY);
    return;
  }
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {}
}

export function sessionsSidebarNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_CHANNEL_SIDEBAR_QUERY).matches
    : false;
}

export function setSessionsTourPending(shownSteps: number | undefined): void {
  try {
    if (shownSteps === undefined) sessionStorage.removeItem(PENDING_KEY);
    else sessionStorage.setItem(PENDING_KEY, `${Date.now()}:${shownSteps}`);
  } catch {}
}

export function takeSessionsTourPending(now = Date.now()): number | undefined {
  try {
    const value = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    const [at, shown] = (value ?? '').split(':').map(Number);
    if (at === undefined || shown === undefined || !Number.isFinite(at) || !Number.isFinite(shown))
      return undefined;
    return now - at < PENDING_TTL_MS ? shown : undefined;
  } catch {
    return undefined;
  }
}

export function takeSessionsTourReturn(): boolean {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return value !== null;
  } catch {
    return false;
  }
}

function setReturn(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, '1');
  } catch {}
}

export function revealSessions(botSlug: string): void {
  const scopeKey = channelSidebarScopeKey('personabot', '', botSlug);
  channelSidebarPrefs.setSidebarCollapsed(scopeKey, false);
  channelSidebarPrefs.setSelectedTab(scopeKey, 'conversation');
  channelSidebarPrefs.setEntryExpanded(scopeKey, 'sessions', true);
}

export function botSessionsTourSteps(t: BotHarnessTranslate): InternalTourSpec[] {
  return [
    {
      selector: SESSIONS_TAB_SELECTOR,
      fallback: SESSIONS_LIST_SELECTOR,
      title: t('onboarding.tour.sessions.list.title'),
      description: t('onboarding.tour.sessions.list.hint'),
    },
    {
      selector: SESSIONS_ROW_SELECTOR,
      title: t('onboarding.tour.sessions.row.title'),
      description: t('onboarding.tour.sessions.row.hint'),
    },
  ];
}

export function dshSessionsTourSteps(
  t: BotHarnessTranslate,
  sessionId: string,
): InternalTourSpec[] {
  return [
    {
      selector: `[role="tree"] [data-row-key=${JSON.stringify(`session:${sessionId}`)}]`,
      fallback: '[role="tree"]',
      title: t('onboarding.tour.sessions.tree.title'),
      description: t('onboarding.tour.sessions.tree.hint'),
    },
    {
      selector: SESSION_RETURN_SELECTOR,
      title: t('onboarding.tour.sessions.back.title'),
      description: t('onboarding.tour.sessions.back.hint'),
    },
  ];
}

export function startBotSessionsTour(
  t: BotHarnessTranslate,
  options: { onClosed(): void; onSkip(): void },
): () => void {
  setSessionsTourPending(BOT_STEPS);
  return startInternalTour(botSessionsTourSteps(t), {
    closeLabel: t('common.close'),
    skipLabel: t('onboarding.skip'),
    previousLabel: t('onboarding.tour.previous'),
    nextLabel: t('onboarding.tour.next'),
    doneLabel: t('onboarding.tour.sessions.open'),
    doneIcon: 'next',
    progress: { offset: 0, total: BOT_STEPS + DSH_STEPS },
    onClosed: () => {
      setSessionsTourPending(undefined);
      options.onClosed();
    },
    onFinished: () => {
      document.querySelector<HTMLButtonElement>(SESSIONS_ROW_SELECTOR)?.click();
    },
    onSkip: () => {
      setSessionsTourPending(undefined);
      options.onSkip();
    },
  });
}

export function startDshSessionsTour(
  t: BotHarnessTranslate,
  sessionId: string,
  shownSteps: number,
  returnToBot: () => void,
): () => void {
  const steps = dshSessionsTourSteps(t, sessionId);
  if (document.querySelector(steps[0]!.selector) === null)
    document
      .querySelector<HTMLElement>(
        '[role="tree"] [data-row-key="workspace:"][aria-expanded="false"]',
      )
      ?.click();
  return startInternalTour(steps, {
    closeLabel: t('common.close'),
    previousLabel: t('onboarding.tour.previous'),
    nextLabel: t('onboarding.tour.next'),
    doneLabel: t('onboarding.tour.sessions.back.done'),
    progress: { offset: shownSteps },
    onClosed: () => {},
    onFinished: () => {
      setReturn();
      returnToBot();
    },
    onSkip: () => {},
  });
}
