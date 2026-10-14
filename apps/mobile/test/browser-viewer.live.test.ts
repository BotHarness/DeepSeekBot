import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';

import { createBrowserViewer, type BrowserViewerState } from '../src/host/browser-viewer';
import { createHostClient } from '../src/host/client';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

async function until(
  viewer: { getState(): BrowserViewerState },
  check: (state: BrowserViewerState) => boolean,
): Promise<BrowserViewerState> {
  for (let i = 0; i < 300; i += 1) {
    if (check(viewer.getState())) return viewer.getState();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`viewer never reached the state: ${JSON.stringify(viewer.getState())}`);
}

describe.skipIf(live === undefined)('native Browser viewer against a live isolated Host', () => {
  it('watches, pauses, drives and resumes a Bot Browser, and stops when the phone is revoked', async () => {
    const page = createServer((_, response) => {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><title>Native viewer</title><body style="margin:0"><button id="b" style="width:100vw;height:100vh" onclick="document.title=\'clicked\'">Tap</button></body>',
      );
    });
    await new Promise<void>((resolve) => page.listen(0, '127.0.0.1', resolve));
    const address = page.address();
    if (address === null || typeof address === 'string') throw new Error('no fixture address');
    const { route, operator, host } = await pairWithLiveHost(live!, 'native viewer live test');
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    const created = await client.call<{ bot: { slug: string } }>('create', {
      displayName: 'Viewer Probe',
    });
    const slug = created.bot.slug;
    await client.call('browserAccessSet', { slug, enabled: true });
    const opened = await client.api('/api/browser/tool', {
      body: { slug, tool: 'browser_open', args: { url: `http://127.0.0.1:${address.port}/` } },
      timeoutMs: 60_000,
    });
    expect(opened.status).toBe(200);

    const viewer = createBrowserViewer({ client, slug });
    viewer.start();
    const first = await until(viewer, (state) => state.status === 'live');
    expect(first.frame?.uri).toMatch(/^data:image\/(jpeg|png);base64,/u);
    expect(first.takeover).toBe(false);

    await viewer.setTakeover(true);
    expect(viewer.getState().takeover).toBe(true);
    const frame = viewer.getState().frame!;
    await viewer.send({ kind: 'click', x: frame.width / 2, y: frame.height / 2 });
    expect(viewer.getState().notice).toBeUndefined();
    const tabs = await client.api(`/api/browser/observation?slug=${slug}`);
    expect(JSON.stringify(tabs.body)).toContain('clicked');
    await viewer.setTakeover(false);
    expect(viewer.getState().takeover).toBe(false);

    const devices = await operator.request(`${route}/api/botharness/devices/revoke`, {
      method: 'POST',
      body: JSON.stringify({ deviceId: host.deviceId }),
      signal: AbortSignal.timeout(5000),
    });
    expect(devices.status).toBe(200);
    await until(viewer, (state) => state.status === 'refused');
    viewer.stop();
    page.close();
  }, 120_000);
});
