import { describe, expect, it, vi } from 'vitest';

import {
  reportViewerEvent,
  viewerEventText,
  type ViewerLifecycleEvent,
} from '../src/client/viewer-events.js';

describe('viewer event text', () => {
  it('renders stable machine-parseable lines for every event', () => {
    expect(viewerEventText({ type: 'mount' })).toBe('viewer mount docked');
    expect(viewerEventText({ type: 'overlay', open: true })).toBe('viewer overlay open');
    expect(viewerEventText({ type: 'overlay', open: false })).toBe('viewer overlay closed');
    expect(viewerEventText({ type: 'phase', from: 'connecting', to: 'live' })).toBe(
      'viewer phase connecting>live',
    );
    expect(viewerEventText({ type: 'auto-reload', attempt: 2 })).toBe(
      'viewer auto-reload attempt=2',
    );
    expect(viewerEventText({ type: 'manual-retry' })).toBe('viewer manual-retry');
    expect(viewerEventText({ type: 'loss-remount', streak: 3 })).toBe(
      'viewer loss-remount streak=3',
    );
  });

  it('stays short and secret-free by construction', () => {
    const samples: ViewerLifecycleEvent[] = [
      { type: 'mount' },
      { type: 'overlay', open: true },
      { type: 'phase', from: 'empty', to: 'connecting' },
      { type: 'auto-reload', attempt: 3 },
      { type: 'manual-retry' },
      { type: 'loss-remount', streak: 9 },
    ];
    for (const event of samples) {
      const text = viewerEventText(event);
      expect(text.length).toBeLessThanOrEqual(200);
      expect(text).not.toMatch(/token|secret|key|http|ws:|path|\//);
    }
  });
});

describe('reportViewerEvent', () => {
  it('posts the detail to the diagnostics route and never throws', async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) });
      return { ok: true };
    }) as unknown as typeof fetch;
    await reportViewerEvent(fetchImpl, 'viewer mount docked');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('./api/computer/diagnostics/viewer');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ detail: 'viewer mount docked' });
    const failing = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(reportViewerEvent(failing, 'viewer mount docked')).resolves.toBeUndefined();
  });

  it('uses the global fetch by default', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', (async (url: string) => {
      calls.push(url);
      return { ok: true };
    }) as unknown as typeof fetch);
    await reportViewerEvent(undefined, 'viewer mount docked');
    expect(calls).toEqual(['./api/computer/diagnostics/viewer']);
  });
});
