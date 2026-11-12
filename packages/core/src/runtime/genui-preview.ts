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
import { loadGenuiRuntimeSource } from './genui-runtime-source.js';
import {
  BrowserProvisionError,
  isBrowserFailureKind,
} from '../../../browser/src/runtime/provision.js';

export interface GenuiPreviewDiagnostic {
  component?: 'preview' | 'diagram';
  phase: 'starting' | 'ready' | 'completed' | 'refused' | 'stopped';
  durationMs: number;
  reason?: string;
}

export interface GenuiPreviewResult {
  documentId: string;
  policyVersion: string;
  runtimeSha256: string;
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

async function initialPage(client: CdpClient, signal: AbortSignal): Promise<string> {
  for (;;) {
    signal.throwIfAborted();
    const targets = (await client.send('Target.getTargets'))['targetInfos'];
    const page = Array.isArray(targets)
      ? (targets as { targetId?: unknown; type?: unknown }[]).find(
          (target) => target.type === 'page' && typeof target.targetId === 'string',
        )
      : undefined;
    if (page !== undefined) return page.targetId as string;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
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
  let stage: 'assets' | 'browser' | 'document' | 'renderer' | 'capture' = 'assets';
  let refusalCode: string | undefined;
  let result: GenuiPreviewResult | undefined;
  let failure: GenuiPreviewError | undefined;
  try {
    record('starting');
    const runtimeSource = await loadGenuiRuntimeSource();
    signal.throwIfAborted();
    stage = 'browser';
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
      const targetId = await initialPage(client, signal);
      const attached = await client.send('Target.attachToTarget', {
        targetId,
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
      stage = 'document';
      const instanceId = randomUUID();
      const compiled = buildGenuiHtmlDocument(document, {
        instanceId,
        theme: options.theme ?? 'dark',
        runtime: runtimeSource,
      });
      await client.send('Page.setDocumentContent', { frameId, html: compiled.html }, sessionId);
      stage = 'renderer';
      let observed:
        | {
            ready: boolean;
            measured: boolean;
            failed?: boolean;
            failure?: string;
            height: number;
            diagnostics: string[];
          }
        | undefined;
      while (!signal.aborted) {
        const result = await client.send(
          'Runtime.evaluate',
          { expression: 'window.__genuiPreview', returnByValue: true },
          sessionId,
        );
        observed = (result['result'] as { value?: typeof observed }).value;
        if (observed?.failed)
          throw new GenuiPreviewError(
            `genui-preview-renderer-${
              [
                'startup',
                'execution',
                'memory',
                'resource',
                'unsupported',
                'invalid-content',
              ].includes(observed.failure ?? '')
                ? observed.failure
                : 'unsupported'
            }`,
            'The document was refused by the isolated renderer.',
          );
        if (observed?.ready && observed.measured) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      }
      signal.throwIfAborted();
      if (!observed?.ready)
        throw new GenuiPreviewError('genui-preview-failed', 'The document did not become ready.');
      const height = Math.min(2000, Math.max(80, observed.height));
      stage = 'capture';
      await client.send(
        'Runtime.evaluate',
        {
          expression:
            'new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))',
          awaitPromise: true,
        },
        sessionId,
      );
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
        runtimeSha256: compiled.runtimeSha256,
        width,
        height: observed.height,
        diagnostics: observed.diagnostics,
        screenshot: { mimeType: 'image/png', data },
      };
    };
    result = await new Promise<GenuiPreviewResult>((resolve, reject) => {
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
    const browserFailure =
      stage === 'browser' &&
      error instanceof BrowserProvisionError &&
      isBrowserFailureKind(error.code);
    const code = browserFailure
      ? `genui-preview-browser-${error.code}`
      : `genui-preview-${stage}-failed`;
    refusalCode = error instanceof GenuiPreviewError ? error.code : code;
    record('refused', refusalCode);
    failure =
      error instanceof GenuiPreviewError
        ? error
        : new GenuiPreviewError(
            code,
            browserFailure
              ? 'The isolated preview browser could not start.'
              : `The isolated document preview failed during ${stage}.`,
          );
  } finally {
    let cleanupStage: 'browser' | 'profile' = 'browser';
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
      cleanupStage = 'profile';
      if (directory !== undefined)
        await rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      record('stopped');
    } catch (error) {
      const suffix =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        ['ENOTEMPTY', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code)
          ? error.code.toLowerCase()
          : 'failed';
      const code = `genui-preview-cleanup-${cleanupStage}-${suffix}`;
      record('refused', code);
      failure = new GenuiPreviewError(
        code,
        `Preview ${cleanupStage} cleanup failed${refusalCode ? ` after ${refusalCode}` : ''}.`,
      );
    } finally {
      previewActive = false;
    }
  }
  if (failure !== undefined) throw failure;
  if (result === undefined)
    throw new GenuiPreviewError('genui-preview-failed', 'The isolated preview produced no result.');
  return result;
}
