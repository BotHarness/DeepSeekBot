import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('pauses actions and screenshots under Browser Pause while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    expect(h.provider.isTakeover('bot-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.org' }, execution('browser_open')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    await expect(
      h.state.definitions.get('browser_screenshot')!.execute({}, execution('browser_screenshot')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(JSON.stringify(observed)).toContain('Hello world');
    h.provider.setTakeover('bot-a', false);
    await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(h.runtime.captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['browser_click', { ref: 'e1' }],
    ['browser_click', { x: 10, y: 10 }],
    ['browser_type', { ref: 'e1', text: 'changed' }],
    ['browser_press_key', { key: 'Enter' }],
    ['browser_scroll', { direction: 'down' }],
    ['browser_upload', { path: '/tmp/qa.txt' }],
  ])('requires a new observation after Resume before %s', async (name, args) => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (tool: string, input = {}) =>
      h.state.definitions.get(tool)!.execute(input, execution(tool));
    await call('browser_open', { url: 'https://example.com' });
    await call('browser_observe');
    h.provider.setTakeover('bot-a', true);
    await call('browser_observe');
    h.provider.setTakeover('bot-a', false);
    await call('browser_screenshot');
    await expect(call(name, args)).rejects.toThrow(/Resume.*browser_observe/);
    await call('browser_observe');
    await expect(call(name, args)).resolves.toBeDefined();
  });

  it.each(['before Pause', 'during Pause', 'during Access cycling'])(
    'does not let a read %s or a failed read satisfy the fresh-read requirement',
    async (phase) => {
      const h = harness({ access: true, auto: true });
      h.created();
      const call = (name: string, args = {}) =>
        h.state.definitions.get(name)!.execute(args, execution(name));
      await call('browser_open', { url: 'https://example.com' });
      const observe = h.runtime.observe;
      let release!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.runtime.observe = vi.fn(async (tabId: string) => {
        started();
        await pending;
        return observe(tabId);
      });
      if (phase !== 'before Pause') h.provider.setTakeover('bot-a', true);
      const oldRead = call('browser_observe');
      const oldReadResult =
        phase === 'during Access cycling'
          ? expect(oldRead).rejects.toThrow(/Browser Access is off/)
          : oldRead;
      await entered;
      if (phase === 'during Access cycling') {
        h.setAccess(false);
        await h.provider.reconcileBot('bot-a');
        h.setAccess(true);
        await h.provider.reconcileBot('bot-a');
      } else {
        h.provider.setTakeover('bot-a', true);
        h.provider.setTakeover('bot-a', false);
      }
      release();
      await oldReadResult;
      await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
      h.runtime.observe = vi.fn(async () => {
        throw new Error('temporary read failure');
      });
      await expect(call('browser_observe')).rejects.toThrow('temporary read failure');
      await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
      h.runtime.observe = observe;
      await call('browser_observe');
      await call('browser_click', { ref: 'e1' });
    },
  );

  it('retains the Resume requirement across Access cycling but allows navigation to recover a page', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const call = (name: string, args = {}) =>
      h.state.definitions.get(name)!.execute(args, execution(name));
    await call('browser_open', { url: 'https://example.com' });
    h.provider.setTakeover('bot-a', true);
    h.provider.setTakeover('bot-a', false);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    await call('browser_open', { url: 'https://example.org' });
    await call('browser_tabs', { action: 'list' });
    await expect(call('browser_click', { ref: 'e1' })).rejects.toThrow(/Resume.*browser_observe/);
    await call('browser_observe');
    await call('browser_click', { ref: 'e1' });
  });

  it.each(['authorization', 'access', 'pause', 'resume'] as const)(
    'audits an immediate %s refusal exactly once without dispatching the action',
    async (guard) => {
      const h = harness({ access: true, auto: guard !== 'authorization' });
      h.created();
      const name = guard === 'authorization' ? 'browser_open' : 'browser_click';
      const definition = h.state.definitions.get(name)!;
      if (guard !== 'authorization') {
        await h.state.definitions
          .get('browser_open')!
          .execute({ url: 'https://example.com' }, execution('browser_open'));
      }
      h.audits.length = 0;
      if (guard === 'access') {
        h.setAccess(false);
        await h.provider.reconcileBot('bot-a');
      } else if (guard === 'pause' || guard === 'resume') {
        h.provider.setTakeover('bot-a', true);
        if (guard === 'resume') h.provider.setTakeover('bot-a', false);
      }
      await expect(
        definition.execute(
          guard === 'authorization' ? { url: 'https://example.com' } : { ref: 'e1' },
          execution(name),
        ),
      ).rejects.toThrow();
      expect(h.audits).toHaveLength(1);
      expect(h.audits[0]).toMatchObject({
        botSlug: 'bot-a',
        sessionId: 'session-a',
        rootRole: 'orchestrator',
        tool: name,
        outcome: 'error',
      });
      expect(h.audits[0]?.error).toMatch(
        /not authorized|Access is off|Pause is active|Resume requires/,
      );
      expect(h.audits[0]?.durationMs).toBeGreaterThanOrEqual(0);
      expect(h.runtime.click).not.toHaveBeenCalled();
      if (guard === 'authorization') expect(h.runtime.open).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'browser_type',
      { ref: 'e1', text: 'QA_PRIVATE_TYPED_MARKER' },
      'chars=23',
      'QA_PRIVATE_TYPED_MARKER',
    ],
    [
      'browser_upload',
      { path: '/tmp/private-qa-path/upload.txt' },
      'file=upload.txt',
      '/tmp/private-qa-path',
    ],
  ])('redacts an immediately refused %s attempt', async (name, args, summary, privateValue) => {
    const h = harness({ access: true, auto: true });
    h.created();
    h.provider.setTakeover('bot-a', true);
    await expect(h.state.definitions.get(name)!.execute(args, execution(name))).rejects.toThrow(
      /Pause is active/,
    );
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.summary).toContain(summary);
    expect(JSON.stringify(h.audits)).not.toContain(privateValue);
    expect(h.runtime.type).not.toHaveBeenCalled();
    expect(h.runtime.uploadFile).not.toHaveBeenCalled();
  });

  it('cancels an active wait when Access is revoked and prevents an old queued action after re-enable', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const pending = h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 10000 }, execution('browser_wait'));
    const cancelled = expect(pending).rejects.toThrow(/abort/i);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const queued = h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.org' }, execution('browser_open'));
    const refused = expect(queued).rejects.toThrow(/Browser Access is off/);
    const oldSignal = h.provider.executionSignal('session-a');
    expect(oldSignal?.aborted).toBe(false);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(oldSignal?.aborted).toBe(true);
    expect(h.provider.executionSignal('session-a')).toBeUndefined();
    h.setAccess(true);
    await h.provider.reconcileBot('bot-a');
    expect(h.provider.executionSignal('session-a')?.aborted).toBe(false);
    expect(h.provider.executionSignal('session-a')).not.toBe(oldSignal);
    await Promise.all([cancelled, refused]);
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits.filter((event) => event.outcome === 'error')).toHaveLength(2);
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenCalledTimes(1);
  });

  it('honors caller cancellation during an active wait without revoking Access', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const controller = new AbortController();
    const pending = h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 10000 }, { ...execution('browser_wait'), signal: controller.signal });
    const cancelled = expect(pending).rejects.toThrow(/abort/i);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await cancelled;
    expect(h.state.registered()).toContain('browser_open');
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_wait', outcome: 'error' });
  });

  it.each(['pause', 'access'] as const)(
    'refuses a queued action when %s changes before execution',
    async (guard) => {
      const h = harness({ access: true, auto: true });
      h.created();
      await h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open'));
      let release: () => void = () => undefined;
      let entered: () => void = () => undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.runtime.click = vi.fn(async () => {
        entered();
        await blocked;
        return { tabId: 'tab-1', url: 'https://example.com/', title: 'Example Domain' };
      });
      const click = h.state.definitions.get('browser_click')!;
      const first = click.execute({ ref: 'e1' }, execution('browser_click'));
      await started;
      const queued =
        guard === 'pause'
          ? click.execute({ ref: 'e2' }, execution('browser_click'))
          : h.state.definitions
              .get('browser_open')!
              .execute({ url: 'https://example.org' }, execution('browser_open'));
      await Promise.resolve();
      await Promise.resolve();
      let reconciled: Promise<void> | undefined;
      if (guard === 'pause') h.provider.setTakeover('bot-a', true);
      else {
        h.setAccess(false);
        reconciled = h.provider.reconcileBot('bot-a');
      }
      const refused = expect(queued).rejects.toThrow(
        guard === 'pause' ? /Browser Pause is active/ : /Browser Access is off/,
      );
      const settledFirst =
        guard === 'access' ? expect(first).rejects.toThrow(/Browser Access is off/) : first;
      release();
      await settledFirst;
      await refused;
      await reconciled;
      expect(h.runtime.click).toHaveBeenCalledTimes(1);
      expect(h.audits).toHaveLength(3);
      expect(h.audits.filter((event) => event.outcome === 'error')).toHaveLength(
        guard === 'access' ? 2 : 1,
      );
      expect(h.runtime.open).toHaveBeenCalledTimes(1);
      expect(h.audits.at(-1)).toMatchObject({
        tool: guard === 'pause' ? 'browser_click' : 'browser_open',
        outcome: 'error',
      });
      if (guard === 'pause') {
        await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
        h.provider.setTakeover('bot-a', false);
        await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
        await click.execute({ ref: 'e1' }, execution('browser_click'));
        expect(h.runtime.click).toHaveBeenCalledTimes(2);
      }
    },
  );

  it('pauses interaction tools under Browser Pause while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/Browser Pause is active.*Resume.*browser_observe/);
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
  });

  it('fails when access is turned off mid-session, and audits the error', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    h.setAccess(false);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/Browser Access is off/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      outcome: 'error',
      error: 'Browser Access is off for this PersonaBot',
    });
  });
});
