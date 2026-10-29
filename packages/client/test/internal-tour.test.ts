// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { en } from '../src/client/locale.js';
import {
  resolveTourSteps,
  startInternalTour,
  type InternalTourOptions,
} from '../src/client/internal-tour.js';

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await vi.advanceTimersByTimeAsync(100);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function options(overrides: Partial<InternalTourOptions> = {}): InternalTourOptions {
  return {
    closeLabel: 'Close',
    skipLabel: en['onboarding.skip'],
    previousLabel: 'Previous',
    nextLabel: 'Next',
    doneLabel: 'Done',
    onClosed: vi.fn(),
    onFinished: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

it('keeps only anchors that exist in the document', () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const topbar = document.createElement('section');
  topbar.setAttribute('data-bh-tour', 'topbar');
  document.body.append(roster, topbar);
  const steps = resolveTourSteps(document, [
    { selector: '[data-onboarding-welcome]', title: 'Welcome', description: 'w' },
    { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
    { selector: '[data-bh-tour="topbar"]', title: 'Header', description: 'h' },
  ]);
  expect(steps.map((step) => step.title)).toEqual(['Roster', 'Header']);
  expect(steps[0]!.element.getAttribute('data-bh-tour')).toBe('roster');
});

it('drives a multi-step tour with progress, labels and a skip action', async () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const composer = document.createElement('button');
  composer.setAttribute('data-bh-tour', 'composer');
  document.body.append(roster, composer);
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'Conversations' },
      { selector: '[data-bh-tour="composer"]', title: 'Message box', description: 'Type here' },
      { selector: '[data-bh-tour="missing"]', title: 'Missing', description: 'Skipped' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Roster');
  expect(document.querySelector('.driver-popover-progress-text')?.textContent).toContain('/');
  expect(document.querySelector('.driver-popover-close-btn')?.getAttribute('aria-label')).toBe(
    'Close',
  );
  const skip = document.querySelector<HTMLButtonElement>('.bh-internal-tour-skip');
  expect(skip?.textContent).toBe('Skip');
  skip?.click();
  expect(tourOptions.onSkip).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('advances on mask clicks and finishes on the last step without closing or skipping', async () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const composer = document.createElement('button');
  composer.setAttribute('data-bh-tour', 'composer');
  document.body.append(roster, composer);
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'Conversations' },
      { selector: '[data-bh-tour="composer"]', title: 'Message box', description: 'Type here' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  const mask = document.querySelector('.driver-overlay path');
  expect(mask).not.toBeNull();
  mask!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Message box');
  expect(tourOptions.onClosed).not.toHaveBeenCalled();
  expect(tourOptions.onSkip).not.toHaveBeenCalled();
  expect(tourOptions.onFinished).not.toHaveBeenCalled();
  mask!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(50);
  expect(tourOptions.onFinished).toHaveBeenCalledOnce();
  expect(tourOptions.onClosed).not.toHaveBeenCalled();
  expect(tourOptions.onSkip).not.toHaveBeenCalled();
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('renders icon navigation with localized names and a text-only skip action', async () => {
  const first = document.createElement('div');
  first.id = 'first';
  const last = document.createElement('div');
  last.id = 'last';
  document.body.append(first, last);
  stop = startInternalTour(
    [
      { selector: '#first', title: 'First', description: 'First step' },
      { selector: '#last', title: 'Last', description: 'Last step' },
    ],
    options({
      previousLabel: '上一步',
      nextLabel: '下一步',
      doneLabel: '完成',
      skipLabel: '跳过教程',
    }),
  );
  await vi.advanceTimersByTimeAsync(50);
  const previous = document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!;
  const next = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!;
  expect(previous.getAttribute('aria-label')).toBe('上一步');
  expect(previous.title).toBe('上一步');
  expect(previous.textContent).toBe('');
  expect(previous.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  expect(previous.classList.contains('driver-popover-btn-disabled')).toBe(true);
  expect(next.getAttribute('aria-label')).toBe('下一步');
  expect(next.title).toBe('下一步');
  expect(next.textContent).toBe('');
  const nextPath = next.querySelector('path')?.getAttribute('d');
  expect(nextPath).toBeTruthy();
  const skip = document.querySelector<HTMLButtonElement>('.bh-internal-tour-skip')!;
  expect(skip.textContent).toBe('跳过教程');
  expect(skip.querySelector('svg')).toBeNull();
  next.click();
  await vi.advanceTimersByTimeAsync(50);
  const done = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!;
  expect(done.getAttribute('aria-label')).toBe('完成');
  expect(done.title).toBe('完成');
  expect(done.textContent).toBe('');
  expect(done.querySelector('path')?.getAttribute('d')).not.toBe(nextPath);
  document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn')!.click();
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-next-btn')?.getAttribute('aria-label')).toBe(
    '下一步',
  );
});

it('waits for the first anchor before driving the tour', async () => {
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-onboarding-welcome]', title: 'Welcome', description: 'w' },
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover')).toBeNull();
  const welcome = document.createElement('div');
  welcome.setAttribute('data-onboarding-welcome', '');
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  document.body.append(welcome, roster);
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Welcome');
});

it('pauses and restores the original control when Escape dismisses the tour', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const tourOptions = options();
  stop = startInternalTour([{ selector: 'button', title: 'A', description: 'a' }], tourOptions);
  await vi.advanceTimersByTimeAsync(50);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(escape);
  await vi.advanceTimersByTimeAsync(50);
  expect(escape.defaultPrevented).toBe(true);
  expect(tourOptions.onClosed).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  const afterDismiss = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(afterDismiss);
  expect(afterDismiss.defaultPrevented).toBe(false);
});

it('finishes through the Done action on the last step', async () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const composer = document.createElement('div');
  composer.setAttribute('data-bh-tour', 'composer');
  document.body.append(roster, composer);
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
      { selector: '[data-bh-tour="composer"]', title: 'Message box', description: 'm' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')?.click();
  await vi.advanceTimersByTimeAsync(50);
  const done = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn');
  expect(done?.getAttribute('aria-label')).toBe('Done');
  done?.click();
  await vi.advanceTimersByTimeAsync(50);
  expect(tourOptions.onFinished).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('pauses when a real dialog appears instead of covering it', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  const tourOptions = options();
  stop = startInternalTour([{ selector: 'button', title: 'A', description: 'a' }], tourOptions);
  await vi.advanceTimersByTimeAsync(50);
  const dialog = document.createElement('section');
  dialog.setAttribute('role', 'dialog');
  Object.defineProperty(dialog, 'getClientRects', { value: () => [new DOMRect(0, 0, 200, 80)] });
  document.body.append(dialog);
  await vi.advanceTimersByTimeAsync(50);
  expect(tourOptions.onClosed).toHaveBeenCalledOnce();
  expect(dialog.isConnected).toBe(true);
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('falls back to a wider anchor and can end on a forward action without a skip', async () => {
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  document.body.append(tree);
  const tourOptions = options({ doneLabel: 'Take me there', doneIcon: 'next' });
  delete tourOptions.skipLabel;
  stop = startInternalTour(
    [
      {
        selector: '[role="tree"] [data-row-key="session:s1"]',
        fallback: '[role="tree"]',
        title: 'Also in DSH',
        description: 'Tree',
      },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(4100);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Also in DSH');
  expect(document.querySelector('.driver-active-element')).toBe(tree);
  const done = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')!;
  expect(done.getAttribute('aria-label')).toBe('Take me there');
  expect(done.classList.contains('bh-internal-tour-done')).toBe(false);
  expect(document.querySelector('.bh-internal-tour-skip')).toBeNull();
});

it('closes instead of waiting forever when no anchor appears', async () => {
  const tourOptions = options();
  stop = startInternalTour(
    [{ selector: '[data-sessions]', title: 'Sessions', description: 'List' }],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(4100);
  expect(document.querySelector('.driver-popover')).toBeNull();
  expect(tourOptions.onClosed).toHaveBeenCalledOnce();
});

it('reports a missing anchor as an interruption when the caller asks', async () => {
  const tourOptions = options({ onInterrupted: vi.fn() });
  stop = startInternalTour(
    [{ selector: '[data-sessions]', title: 'Sessions', description: 'List' }],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(4100);
  expect(tourOptions.onInterrupted).toHaveBeenCalledOnce();
  expect(tourOptions.onClosed).not.toHaveBeenCalled();
});

it('continues step numbering when one walkthrough spans two tours', async () => {
  const row = document.createElement('div');
  row.setAttribute('data-bh-tour', 'roster');
  document.body.append(row);
  stop = startInternalTour(
    [{ selector: '[data-bh-tour="roster"]', title: 'Back', description: 'b' }],
    options({ progress: { offset: 2, total: 4 } }),
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-progress-text')?.textContent).toBe('3 / 4');
});
