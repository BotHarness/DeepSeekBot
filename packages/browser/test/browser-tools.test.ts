import { rmSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { readPublicToolDetail } from '../../core/src/state/tool-activity.js';
import { auditSummary, formatAudit, ownsBrowserTool } from '../src/tool/provider.js';
import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('curated catalog and audit redaction', () => {
  it('candidate observation cannot survive Pause and Resume in flight', async () => {
    const h = harness({ access: true, auto: true });
    h.runtime.runWithSignal = async (_signal, action, guard) => {
      guard?.();
      return action();
    };
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const observe = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tab) => {
      h.provider.setTakeover('bot-a', true);
      h.provider.setTakeover('bot-a', false);
      return observe(tab);
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow('Browser control changed during the call');
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e1' }, execution('browser_click')),
    ).rejects.toThrow(/Resume.*browser_observe/);
    expect(h.runtime.click).not.toHaveBeenCalled();
  });
  it('rejects reuse of managed tools by a foreign Session before runtime or approval', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const foreign = {
      ...execution('browser_open'),
      agent: { id: 'foreign-session' } as unknown as Agent,
    };
    await expect(
      h.state.definitions.get('browser_open')!.execute({ url: 'https://example.com' }, foreign),
    ).rejects.toThrow('owning PersonaBot Session');
    expect(h.runtime.ensure).not.toHaveBeenCalled();
    expect(h.runtime.open).not.toHaveBeenCalled();
  });
  it('owns exactly the curated model-facing names', () => {
    expect(ownsBrowserTool('browser_open')).toBe(true);
    expect(ownsBrowserTool('browser_observe')).toBe(true);
    expect(ownsBrowserTool('browser_click')).toBe(true);
    expect(ownsBrowserTool('browser_hover')).toBe(false);
    expect(ownsBrowserTool('computer_click')).toBe(false);
  });

  it('audits the URL but never page contents or typed text', () => {
    const summary = auditSummary('open', { url: 'https://example.com/account?secret=1' });
    expect(summary).toContain('https://example.com/account');
    expect(auditSummary('observe', {})).toBe('observe');
    expect(auditSummary('nope', {})).toBe('tool');
  });

  it('formats a stable audit line', () => {
    const line = formatAudit({
      at: new Date().toISOString(),
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
      tool: 'browser_open',
      summary: 'url=https://example.com',
      outcome: 'ok',
      durationMs: 42,
    });
    expect(line).toBe(
      'bot=bot-a session=session-a role=orchestrator browser_open url=https://example.com -> ok (42ms)',
    );
  });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('keeps a standing approval on its exact execution and rechecks revocation', async () => {
    const h = harness({ access: true });
    h.created();
    const tool = h.state.definitions.get('browser_open')!;
    const call = Object.assign(execution('browser_open'), { token: Symbol('approved-call') });
    let active = true;
    const release = h.provider.authorizeCall(call.token, () => active);
    try {
      await expect(tool.execute({ url: 'https://example.com' }, call)).resolves.toBeDefined();
      expect(h.provider.needsAuthorization('session-a')).toBe(true);
      await expect(
        h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
      ).rejects.toThrow('not authorized');
      active = false;
      await expect(tool.execute({ url: 'https://example.com' }, call)).rejects.toThrow(
        'not authorized',
      );
      active = true;
      release();
      await expect(tool.execute({ url: 'https://example.com' }, call)).rejects.toThrow(
        'not authorized',
      );
    } finally {
      release();
      await h.provider.dispose();
    }
  });

  it('Daily Browser exposes only observation and retains Session authorization and audit', async () => {
    const observe = vi.fn(async () => ({
      url: 'https://example.com/page',
      title: 'Signed in',
      text: 'PRIVATE-PAGE-QA',
      elements: [],
    }));
    const h = harness({ access: true, borrowed: () => ({ observe }) });
    h.created();
    expect(h.state.registered()).toEqual(['browser_observe']);
    const tool = h.state.definitions.get('browser_observe')!;
    await expect(tool.execute({}, execution('browser_observe'))).rejects.toThrow('not authorized');
    expect(observe).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    const result = await tool.execute({}, execution('browser_observe'));
    expect(JSON.stringify(result)).toContain('PRIVATE-PAGE-QA');
    expect(h.runtime.ensure).not.toHaveBeenCalled();
    expect(h.runtime.open).not.toHaveBeenCalled();
    expect(h.audits.at(-1)).toMatchObject({
      tool: 'browser_observe',
      botSlug: 'bot-a',
      sessionId: 'session-a',
      outcome: 'ok',
    });
    expect(JSON.stringify(h.audits)).not.toContain('PRIVATE-PAGE-QA');
    h.provider.invalidateBot('bot-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
  });
  it('registers nothing while Browser Access is off', () => {
    const h = harness({ access: false });
    h.created();
    expect(h.state.registered()).toEqual([]);
  });

  it('registers the read-only tools plus guidance when access is on', () => {
    const h = harness({ access: true });
    h.created();
    expect(h.state.registered()).toEqual([
      'browser_click',
      'browser_observe',
      'browser_open',
      'browser_press_key',
      'browser_screenshot',
      'browser_scroll',
      'browser_tabs',
      'browser_type',
      'browser_upload',
      'browser_wait',
    ]);
    expect(h.state.sections).toContain('botharness:browser');
  });

  it('fails closed until core records the Browser Authorization grant', async () => {
    const h = harness({ access: true });
    h.created();
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/not authorized/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
  });

  it('follows the Local Computer control owner: refuses while held, re-observes after hand-back (#3378)', async () => {
    const desktop = { held: false, epoch: 0 };
    const notes: string[] = [];
    const h = harness({
      access: true,
      auto: true,
      desktopControl: () => desktop,
      note: (detail) => notes.push(detail),
    });
    await h.provider.runDirect('bot-a', 'browser_open', { url: 'https://example.com' });
    await h.provider.runDirect('bot-a', 'observe', {});
    await h.provider.runDirect('bot-a', 'click', { ref: 'e1' });
    expect(h.runtime.click).toHaveBeenCalledTimes(1);

    desktop.held = true;
    desktop.epoch = 1;
    for (const [tool, args] of [
      ['click', { ref: 'e1' }],
      ['observe', {}],
      ['browser_open', { url: 'https://example.com' }],
    ] as const)
      await expect(h.provider.runDirect('bot-a', tool, args)).rejects.toThrow(
        'The Human holds the Computer',
      );
    expect(notes).toContain('phase=control-refused owner=computer-pause slug=bot-a tool=click');

    desktop.held = false;
    desktop.epoch = 2;
    await expect(h.provider.runDirect('bot-a', 'click', { ref: 'e1' })).rejects.toThrow(
      'The Human used the Computer since your last browser_observe',
    );
    expect(h.runtime.click).toHaveBeenCalledTimes(1);
    await h.provider.runDirect('bot-a', 'observe', {});
    await h.provider.runDirect('bot-a', 'click', { ref: 'e1' });
    expect(h.runtime.click).toHaveBeenCalledTimes(2);
  });

  it('runs the same tools directly for the Owner without a Session, model or approval card', async () => {
    const h = harness({ access: true, auto: false });
    const opened = await h.provider.runDirect('bot-a', 'browser_open', {
      url: 'https://example.com',
    });
    expect(h.runtime.open).toHaveBeenCalledWith('https://example.com', undefined);
    expect(JSON.stringify(opened)).toContain('Opened https://example.com');
    const observed = await h.provider.runDirect('bot-a', 'observe', {});
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-1');
    expect(JSON.stringify(observed)).toContain('Hello world');
    expect(h.audits.map((event) => [event.tool, event.sessionId, event.outcome])).toEqual([
      ['browser_open', 'direct', 'ok'],
      ['browser_observe', 'direct', 'ok'],
    ]);
    await expect(h.provider.runDirect('bot-a', 'browser_teleport', {})).rejects.toThrow(
      'Unknown browser tool',
    );
    h.setAccess(false);
    await expect(h.provider.runDirect('bot-a', 'observe', {})).rejects.toThrow(
      'Browser Access is off',
    );
    expect(h.audits.at(-1)).toMatchObject({ tool: 'browser_observe', outcome: 'error' });
  });

  it('no longer offers the blocking browser_takeover tool', () => {
    const h = harness({ access: true, auto: true });
    h.created();
    expect(h.state.definitions.has('browser_takeover')).toBe(false);
  });

  it('drops registrations when Browser Access is turned off, and stops the browser on dispose', async () => {
    const h = harness({ access: true });
    h.created();
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
    await h.provider.dispose();
    expect(h.runtimes.stopAll).toHaveBeenCalled();
  });
});

describe('browser Provider public Activity detail', () => {
  it('registers explicit operation-only detail on the actual scoped tabs Tool', () => {
    const h = harness({ access: true });
    h.created();
    const tabs = h.state.definitions.get('browser_tabs')!;
    const input = {
      action: 'open',
      url: 'https://private.example/?token=secret',
      targetId: 'private-tab',
      title: 'private title',
    };
    expect(readPublicToolDetail(tabs, input)).toBe('Opening a new browser tab');
    expect(readPublicToolDetail(tabs, { ...input, action: 'close' })).toBe('Closing a browser tab');
    expect(readPublicToolDetail(tabs, { action: 'private-action' })).toBeUndefined();
    expect(readPublicToolDetail(h.state.definitions.get('browser_open')!, input)).toBeUndefined();
    expect(JSON.stringify(readPublicToolDetail(tabs, input))).not.toMatch(
      /private|secret|token|targetId/,
    );
  });
});
