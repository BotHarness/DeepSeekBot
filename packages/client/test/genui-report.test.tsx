// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GenuiError,
  initialGenuiView,
  parseGenuiReport,
  type GenuiView,
} from '../../core/src/channels/genui.js';
import { comparisonReport } from '../../core/test/fixtures/genui-report.js';
import {
  GenuiReportCard,
  genuiVisibleRows,
  genuiChartBars,
  type GenuiActions,
} from '../src/client/genui-report.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; children: ReactNode }) =>
    createElement('button', props, children),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
  IconRefreshOutlineRegular: () => null,
}));

const report = parseGenuiReport(comparisonReport);
const english: BotHarnessTranslate = (key, params) => {
  const value: unknown = Reflect.get(en, key);
  return (typeof value === 'string' ? value : key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? name),
  );
};
let container: HTMLDivElement;
let root: Root;
let actions: GenuiActions;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  actions = {
    genuiView: vi.fn(async () => ({ version: 0, state: initialGenuiView() })),
    saveGenuiView: vi.fn(async (_channel, _message, _snapshot, expectedVersion, state) => ({
      version: expectedVersion + 1,
      state,
    })),
    sendGenuiReply: vi.fn(async () => undefined),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
async function render(
  channelId = 'dm-ada',
  nextReport = report,
  nextActions: GenuiActions | undefined = actions,
  t = english,
) {
  await act(async () =>
    root.render(
      createElement(GenuiReportCard, {
        report: nextReport,
        channelId,
        messageId: 'report-1',
        ...(nextActions ? { actions: nextActions } : {}),
        t,
      }),
    ),
  );
}
function button(label: string): HTMLButtonElement {
  const element = [...container.querySelectorAll('button')].find(
    (node) => node.textContent === label,
  );
  if (!element) throw new Error(`Missing button: ${label}`);
  return element;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function select(name: string) {
  const checkbox = container.querySelector(`input[aria-label="Select ${name}"]`);
  if (!(checkbox instanceof HTMLInputElement)) throw new Error(`Missing checkbox: ${name}`);
  await act(async () => checkbox.click());
}
async function filter(value: string) {
  const input = container.querySelector('input[aria-label="Filter report"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Missing filter');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function debounce() {
  await act(async () => vi.advanceTimersByTimeAsync(601));
}

it('contains a renderer failure without removing surrounding ordinary message content', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement('p', null, 'Ordinary report summary'),
          createElement(GenuiReportCard, {
            report,
            channelId: 'dm-ada',
            messageId: 'report-1',
            t: () => {
              throw new Error('synthetic renderer failure');
            },
          }),
        ),
      ),
    );
    expect(container.textContent).toBe('Ordinary report summary');
  } finally {
    errors.mockRestore();
  }
});

describe('trusted report controls', () => {
  it('positions signed bars around zero and bounds even extreme finite values', () => {
    expect(genuiChartBars([-1, 0, 1])).toEqual([
      { left: 0, width: 50, origin: 50 },
      { left: 50, width: 0, origin: 50 },
      { left: 50, width: 50, origin: 50 },
    ]);
    expect(genuiChartBars([-Number.MAX_VALUE, Number.MAX_VALUE])).toEqual([
      { left: 0, width: 50, origin: 50 },
      { left: 50, width: 50, origin: 50 },
    ]);
    expect(genuiChartBars([0])).toEqual([{ left: 0, width: 0, origin: 0 }]);
  });
  it('keeps an unsaved draft through card remount and resets it through the CAS owner', async () => {
    await render();
    await filter('Beta');
    await act(async () => root.render(null));
    await render();
    expect(
      container.querySelector<HTMLInputElement>('input[aria-label="Filter report"]')?.value,
    ).toBe('Beta');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenLastCalledWith(
      'dm-ada',
      'report-1',
      report.snapshotId,
      0,
      expect.objectContaining({ filter: 'Beta' }),
    );
    await click('Reset view');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenLastCalledWith(
      'dm-ada',
      'report-1',
      report.snapshotId,
      1,
      initialGenuiView(),
    );
  });

  it('retains unresolved submission identity through card remount', async () => {
    vi.mocked(actions.sendGenuiReply).mockRejectedValueOnce(new Error('Response lost'));
    await render();
    await select('Alpha');
    await click('Continue with selection');
    const firstId = vi.mocked(actions.sendGenuiReply).mock.calls[0]?.[2];
    await act(async () => root.render(null));
    await render();
    await click('Continue with selection');
    expect(vi.mocked(actions.sendGenuiReply).mock.calls[1]?.[2]).toBe(firstId);
  });

  it('renders the bounded catalog as escaped DOM and exposes observed time', async () => {
    await render(
      'dm-ada',
      parseGenuiReport({ ...comparisonReport, title: '<img src=x onerror=alert(1)>' }),
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('h3')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(container.querySelector('time')?.dateTime).toBe(report.observedAt);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.textContent).toContain('Options3');
    expect(actions.saveGenuiView).not.toHaveBeenCalled();
  });

  it('keeps selections stable across filtering, numeric sorting, details, and chart view', async () => {
    await render();
    await select('Alpha');
    await click('Score');
    expect([...container.querySelectorAll('tbody tr')].map((row) => row.textContent)).toEqual([
      'Beta5Details',
      'Alpha8Details',
      'Gamma9Details',
    ]);
    await click('Score');
    expect(container.querySelector('th[aria-sort="descending"]')?.textContent).toBe('Score');
    await filter('Beta');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    await click('Chart');
    expect(container.querySelector('ul')?.textContent).toContain('Beta: 5');
    expect(container.querySelector('table')).not.toBeNull();
    await click('Details');
    expect(container.textContent).toContain('Synthetic option Beta.');
    expect(actions.sendGenuiReply).not.toHaveBeenCalled();
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    expect(actions.saveGenuiView).toHaveBeenLastCalledWith(
      'dm-ada',
      'report-1',
      report.snapshotId,
      0,
      {
        filter: 'Beta',
        sortColumnId: 'score',
        sortDirection: 'desc',
        view: 'chart',
        selectedIds: ['alpha'],
        expandedId: 'beta',
      },
    );
    await click('Continue with selection');
    expect(actions.sendGenuiReply).toHaveBeenCalledWith(
      'dm-ada',
      expect.any(String),
      expect.stringMatching(/^human-[a-f0-9-]{36}$/),
      {
        messageId: 'report-1',
        snapshotId: report.snapshotId,
        selectedIds: ['alpha'],
        intent: 'continue',
      },
    );
  });

  it('does not save on mount or reload on a same-snapshot prop refresh', async () => {
    await render();
    await debounce();
    expect(actions.saveGenuiView).not.toHaveBeenCalled();
    await filter('Gamma');
    await render('dm-ada', structuredClone(report));
    expect(actions.genuiView).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')?.value).toBe('Gamma');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
  });

  it('retains a conflict draft and requires explicit save after fetching the new version', async () => {
    vi.mocked(actions.saveGenuiView).mockRejectedValueOnce(
      new GenuiError('genui-view-conflict', 'Conflict'),
    );
    await render();
    await filter('Alpha');
    await debounce();
    expect(container.textContent).toContain('changed elsewhere');
    await filter('Beta');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    vi.mocked(actions.genuiView).mockResolvedValue({
      version: 4,
      state: { ...initialGenuiView(), filter: 'Gamma' },
    });
    await click('Keep my draft');
    expect(container.querySelector('input')?.value).toBe('Beta');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    await click('Save my view');
    expect(actions.saveGenuiView).toHaveBeenLastCalledWith(
      'dm-ada',
      'report-1',
      report.snapshotId,
      4,
      expect.objectContaining({ filter: 'Beta' }),
    );
  });

  it('reloads saved state only when explicitly chosen after a conflict', async () => {
    vi.mocked(actions.saveGenuiView).mockRejectedValueOnce(
      new GenuiError('genui-view-conflict', 'Conflict'),
    );
    await render();
    await filter('Alpha');
    await debounce();
    vi.mocked(actions.genuiView).mockResolvedValue({
      version: 2,
      state: { ...initialGenuiView(), filter: 'Gamma' },
    });
    await click('Load saved view');
    expect(container.querySelector('input')?.value).toBe('Gamma');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    expect(actions.sendGenuiReply).not.toHaveBeenCalled();
  });

  it('keeps changes made during save and serializes the next bounded autosave', async () => {
    let finish: ((view: GenuiView) => void) | undefined;
    vi.mocked(actions.saveGenuiView).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    await filter('Alpha');
    await debounce();
    await filter('Beta');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish?.({ version: 1, state: { ...initialGenuiView(), filter: 'Alpha' } }),
    );
    expect(container.querySelector('input')?.value).toBe('Beta');
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(2);
    expect(actions.saveGenuiView).toHaveBeenLastCalledWith(
      'dm-ada',
      'report-1',
      report.snapshotId,
      1,
      expect.objectContaining({ filter: 'Beta' }),
    );
  });

  it('reuses the submission ID after an uncertain send and prevents duplicate in-flight actions', async () => {
    let reject: ((error: Error) => void) | undefined;
    vi.mocked(actions.sendGenuiReply).mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectSend) => {
          reject = rejectSend;
        }),
    );
    await render();
    await select('Alpha');
    await click('Continue with selection');
    await click('Continue with selection');
    await click('Refresh report');
    expect(actions.sendGenuiReply).toHaveBeenCalledTimes(1);
    await act(async () => reject?.(new Error('Connection lost')));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Retry reuses');
    await click('Continue with selection');
    const calls = vi.mocked(actions.sendGenuiReply).mock.calls;
    expect(calls[0]?.[2]).toBe(calls[1]?.[2]);
    await click('Continue with selection');
    expect(actions.sendGenuiReply).toHaveBeenCalledTimes(2);
    await select('Beta');
    await click('Continue with selection');
    expect(vi.mocked(actions.sendGenuiReply).mock.calls[2]?.[2]).not.toBe(calls[0]?.[2]);
  });

  it('refreshes only through a Human message and does not mutate the snapshot', async () => {
    await render();
    expect(button('Continue with selection').disabled).toBe(true);
    await click('Refresh report');
    expect(actions.sendGenuiReply).toHaveBeenCalledWith(
      'dm-ada',
      expect.stringContaining('new snapshot'),
      expect.any(String),
      {
        messageId: 'report-1',
        snapshotId: report.snapshotId,
        selectedIds: [],
        intent: 'refresh',
      },
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(actions.saveGenuiView).not.toHaveBeenCalled();
  });

  it('cancels pending autosave and ignores stale load on channel change', async () => {
    await render();
    await filter('Alpha');
    let finish: ((view: GenuiView) => void) | undefined;
    vi.mocked(actions.genuiView).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render('dm-other');
    expect(button('Refresh report').disabled).toBe(true);
    await debounce();
    expect(actions.saveGenuiView).not.toHaveBeenCalled();
    await render('dm-third');
    await act(async () =>
      finish?.({ version: 9, state: { ...initialGenuiView(), filter: 'Beta' } }),
    );
    expect(container.querySelector('input')?.value).toBe('');
    await click('Refresh report');
    expect(actions.sendGenuiReply).toHaveBeenCalledWith(
      'dm-third',
      expect.any(String),
      expect.any(String),
      expect.any(Object),
    );
  });

  it('makes a read failure retryable without triggering a mutation', async () => {
    vi.mocked(actions.genuiView).mockRejectedValueOnce(new Error('Offline'));
    await render();
    expect(container.textContent).toContain('could not load');
    expect(button('Refresh report').disabled).toBe(true);
    await click('Load saved view');
    expect(actions.genuiView).toHaveBeenCalledTimes(2);
    expect(actions.saveGenuiView).not.toHaveBeenCalled();
    expect(actions.sendGenuiReply).not.toHaveBeenCalled();
  });

  it('retains a failed autosave draft without an automatic retry loop', async () => {
    vi.mocked(actions.saveGenuiView).mockRejectedValueOnce(new Error('Offline'));
    await render();
    await filter('Alpha');
    await debounce();
    await debounce();
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(1);
    expect(container.querySelector('input')?.value).toBe('Alpha');
    await click('Save my view');
    expect(actions.saveGenuiView).toHaveBeenCalledTimes(2);
  });

  it('provides concise Chinese control labels', async () => {
    await render('dm-ada', report, actions, zhTranslate);
    expect(button('继续处理').disabled).toBe(true);
    expect(container.querySelector('input[aria-label="筛选报告"]')).not.toBeNull();
  });

  it('caps selection at twenty stable identities without sending a message', async () => {
    const manyRows = parseGenuiReport({
      ...comparisonReport,
      rows: Array.from({ length: 21 }, (_, index) => ({
        id: `row-${index}`,
        values: { name: `Row ${index}`, score: index },
      })),
    });
    await render('dm-ada', manyRows);
    for (let index = 0; index < 20; index++) await select(`Row ${index}`);
    const last = container.querySelector('input[aria-label="Select Row 20"]');
    expect(last instanceof HTMLInputElement && last.disabled).toBe(true);
    await select('Row 0');
    expect(last instanceof HTMLInputElement && last.disabled).toBe(false);
    await select('Row 20');
    await debounce();
    expect(vi.mocked(actions.saveGenuiView).mock.calls[0]?.[4].selectedIds).toEqual(
      Array.from({ length: 20 }, (_, index) => `row-${index + 1}`),
    );
    expect(actions.sendGenuiReply).not.toHaveBeenCalled();
  });

  it('bounds view computations to the accepted 100-row catalog and preserves the source order', () => {
    const bounded = parseGenuiReport({
      ...comparisonReport,
      rows: Array.from({ length: 100 }, (_, index) => ({
        id: `row-${index}`,
        values: { name: `Item ${index}`, score: 100 - index },
      })),
    });
    const state = { ...initialGenuiView(), sortColumnId: 'score' };
    expect(genuiVisibleRows(bounded, state)).toHaveLength(100);
    expect(genuiVisibleRows(bounded, state)[0]?.id).toBe('row-99');
    expect(bounded.rows[0]?.id).toBe('row-0');
  });
});
