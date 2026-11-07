import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  connectCdp,
  createBotBrowserRuntime,
  discoverBrowserBinary,
  type CdpClient,
} from '../../../browser/src/runtime/browser.js';
import { buildGenuiHtmlDocument } from '../channels/genui-html.js';
import { parseGenuiDocument } from '../channels/genui-document.js';

export interface GenuiPreviewDiagnostic {
  component?: 'preview' | 'diagram';
  phase: 'starting' | 'ready' | 'completed' | 'refused' | 'stopped';
  durationMs: number;
  reason?: string;
}

export interface GenuiPreviewResult {
  documentId: string;
  policyVersion: string;
  width: number;
  height: number;
  diagnostics: string[];
  screenshot: { mimeType: 'image/png'; data: string };
}

export class GenuiPreviewError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GenuiPreviewError';
  }
}

let previewActive = false;

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

export function genuiPreviewPage(
  html: string,
  instanceId: string,
  theme: 'light' | 'dark',
): string {
  return `<!doctype html><html style="color-scheme:${theme}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;background:Canvas}iframe{display:block;border:0;width:100%;height:48px}</style></head><body><iframe title="GenUI preview" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(html)}"></iframe><script nonce="genui-preview">(() => {
    const frame = document.querySelector('iframe');
    window.__genuiPreview = { ready: false, measured: false, height: 48, diagnostics: [] };
    addEventListener('message', (event) => {
      if (event.source !== frame.contentWindow || event.origin !== 'null') return;
      const message = event.data;
      if (!message || message.protocol !== 'botharness-genui-v1' || message.instanceId !== ${JSON.stringify(instanceId)}) return;
      if (message.type === 'ready') window.__genuiPreview.ready = true;
      if (message.type === 'height' && Number.isFinite(message.height) && message.height >= 48 && message.height <= 20000) {
        frame.style.height = message.height + 'px';
        window.__genuiPreview.height = message.height;
        window.__genuiPreview.measured = true;
      }
      if (message.type === 'error' && typeof message.message === 'string' && window.__genuiPreview.diagnostics.length < 8)
        window.__genuiPreview.diagnostics.push(message.message.slice(0, 1000));
    });
  })();</script></body></html>`;
}

export async function previewGenuiDocument(
  value: unknown,
  options: {
    width?: number;
    theme?: 'light' | 'dark';
    signal?: AbortSignal;
    onDiagnostic?: (event: GenuiPreviewDiagnostic) => void;
  } = {},
): Promise<GenuiPreviewResult> {
  const document = parseGenuiDocument(value);
  const width = options.width ?? 728;
  if (!Number.isInteger(width) || width < 240 || width > 1600)
    throw new GenuiPreviewError('invalid-genui-preview', 'Preview width must be 240–1600 pixels.');
  if (previewActive)
    throw new GenuiPreviewError('genui-preview-busy', 'Another document preview is running.');
  const binary = discoverBrowserBinary();
  if (binary === undefined)
    throw new GenuiPreviewError(
      'genui-preview-unavailable',
      'Install Chrome, Edge or Chromium to preview documents.',
    );
  options.signal?.throwIfAborted();
  previewActive = true;
  const started = performance.now();
  const record = (phase: GenuiPreviewDiagnostic['phase'], reason?: string) =>
    options.onDiagnostic?.({
      phase,
      durationMs: Math.round(performance.now() - started),
      ...(reason === undefined ? {} : { reason }),
    });
  let directory: string | undefined;
  let browser: ReturnType<typeof createBotBrowserRuntime> | undefined;
  let client: CdpClient | undefined;
  const signal = AbortSignal.any([
    AbortSignal.timeout(15_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  try {
    record('starting');
    directory = await mkdtemp(join(tmpdir(), 'botharness-genui-preview-'));
    browser = createBotBrowserRuntime({
      userDataDir: directory,
      browserPath: binary,
      headless: true,
      launchTimeoutMs: 8000,
      connect: async (endpoint) => {
        client = await connectCdp(endpoint);
        return client;
      },
    });
    const runtime = browser;
    const render = async (): Promise<GenuiPreviewResult> => {
      await runtime.ensure();
      signal.throwIfAborted();
      if (client === undefined) throw new Error('Preview connection unavailable.');
      record('ready');
      const target = await client.send('Target.createTarget', { url: 'about:blank' });
      const attached = await client.send('Target.attachToTarget', {
        targetId: target['targetId'],
        flatten: true,
      });
      const sessionId = attached['sessionId'] as string;
      await client.send('Page.enable', {}, sessionId);
      await client.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height: 1100, deviceScaleFactor: 1, mobile: false },
        sessionId,
      );
      const tree = await client.send('Page.getFrameTree', {}, sessionId);
      const frameId = (tree['frameTree'] as { frame: { id: string } }).frame.id;
      const instanceId = randomUUID();
      const compiled = buildGenuiHtmlDocument(document, {
        instanceId,
        theme: options.theme ?? 'dark',
      });
      await client.send(
        'Page.setDocumentContent',
        { frameId, html: genuiPreviewPage(compiled.html, instanceId, options.theme ?? 'dark') },
        sessionId,
      );
      let observed:
        | { ready: boolean; measured: boolean; height: number; diagnostics: string[] }
        | undefined;
      while (!signal.aborted) {
        const result = await client.send(
          'Runtime.evaluate',
          { expression: 'window.__genuiPreview', returnByValue: true },
          sessionId,
        );
        observed = (result['result'] as { value?: typeof observed }).value;
        if (observed?.ready && observed.measured) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      signal.throwIfAborted();
      if (!observed?.ready)
        throw new GenuiPreviewError('genui-preview-failed', 'The document did not become ready.');
      const height = Math.min(2000, Math.max(80, observed.height));
      const capture = await client.send(
        'Page.captureScreenshot',
        {
          format: 'png',
          clip: { x: 0, y: 0, width, height, scale: 1 },
          captureBeyondViewport: true,
        },
        sessionId,
      );
      const data = capture['data'];
      if (typeof data !== 'string' || data.length > 1_398_104)
        throw new GenuiPreviewError(
          'genui-preview-too-large',
          'The preview image exceeds its 1 MiB budget.',
        );
      record('completed');
      return {
        documentId: compiled.documentId,
        policyVersion: compiled.policyVersion,
        width,
        height: observed.height,
        diagnostics: observed.diagnostics,
        screenshot: { mimeType: 'image/png', data },
      };
    };
    return await new Promise<GenuiPreviewResult>((resolve, reject) => {
      const abort = () =>
        reject(
          new GenuiPreviewError(
            'genui-preview-timeout',
            'The preview was cancelled or exceeded 15 seconds.',
          ),
        );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else
        render()
          .then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', abort));
    });
  } catch (error) {
    record('refused', error instanceof GenuiPreviewError ? error.code : 'genui-preview-failed');
    if (error instanceof GenuiPreviewError) throw error;
    throw new GenuiPreviewError('genui-preview-failed', 'The isolated document preview failed.');
  } finally {
    try {
      if (client !== undefined) {
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            client.send('Browser.close').catch(() => undefined),
            new Promise<void>((resolve) => {
              closeTimer = setTimeout(resolve, 1000);
            }),
          ]);
        } finally {
          clearTimeout(closeTimer);
        }
      }
      await browser?.stop();
      if (directory !== undefined) await rm(directory, { recursive: true, force: true });
      record('stopped');
    } finally {
      previewActive = false;
    }
  }
}
