import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MEETING_PCM_BINDING, meetingCaptureScript } from './page-capture.js';

const LAUNCH_TIMEOUT_MS = 20_000;

export function meetingChromeCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const explicit = env['DEEPSEEKBOT_MEETING_CHROME']?.trim();
  if (explicit) return [explicit];
  if (platform === 'darwin')
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  if (platform === 'win32') {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    return [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

export function findMeetingChrome(
  candidates: readonly string[] = meetingChromeCandidates(),
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  return candidates.find((candidate) => exists(candidate));
}

export function meetingChromeArgs(input: { profileDir: string; headless: boolean }): string[] {
  return [
    `--user-data-dir=${input.profileDir}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--mute-audio',
    '--window-size=1280,800',
    ...(input.headless ? ['--headless=new'] : []),
    'about:blank',
  ];
}

interface Pending {
  resolve(value: Record<string, unknown>): void;
  reject(error: Error): void;
}

export interface MeetingPage {
  evaluate<T>(expression: string): Promise<T>;
  navigate(url: string): Promise<void>;
  onClosed(listener: () => void): void;
}

export interface MeetingBrowser {
  readonly page: MeetingPage;
  close(): Promise<void>;
}

export async function openMeetingBrowser(input: {
  readonly chrome: string;
  readonly headless?: boolean;
  readonly signal: AbortSignal;
  readonly onPcm: (samples: Int16Array) => void;
}): Promise<MeetingBrowser> {
  const profileDir = mkdtempSync(join(tmpdir(), 'bh-meeting-'));
  const child = spawn(
    input.chrome,
    meetingChromeArgs({ profileDir, headless: input.headless ?? true }),
    { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  );
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
    socket?.close();
    await stop(child);
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {}
  };
  let socket: WebSocket | undefined;
  try {
    const url = await devToolsUrl(child);
    socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('DevTools socket failed')), {
        once: true,
      });
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
  const pending = new Map<number, Pending>();
  const listeners = new Map<string, ((params: Record<string, unknown>) => void)[]>();
  let nextId = 1;
  const closedListeners: (() => void)[] = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: Record<string, unknown>;
      error?: { message: string };
    };
    if (message.id !== undefined) {
      const waiting = pending.get(message.id);
      pending.delete(message.id);
      if (message.error !== undefined) waiting?.reject(new Error(message.error.message));
      else waiting?.resolve(message.result ?? {});
      return;
    }
    if (message.method !== undefined)
      for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
  });
  socket.addEventListener('close', () => {
    for (const waiting of pending.values()) waiting.reject(new Error('DevTools socket closed'));
    pending.clear();
    if (!closed) for (const listener of closedListeners) listener();
  });
  const send = (
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const on = (method: string, listener: (params: Record<string, unknown>) => void) => {
    listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    return () =>
      listeners.set(
        method,
        (listeners.get(method) ?? []).filter((item) => item !== listener),
      );
  };

  try {
    const { targetInfos } = (await send('Target.getTargets')) as {
      targetInfos: Array<{ targetId: string; type: string }>;
    };
    const target = targetInfos.find((info) => info.type === 'page');
    if (target === undefined) throw new Error('Chrome opened no page');
    const { sessionId } = (await send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    })) as { sessionId: string };
    const page = (method: string, params: Record<string, unknown> = {}) =>
      send(method, params, sessionId);
    on('Runtime.bindingCalled', (params) => {
      if (params['name'] !== MEETING_PCM_BINDING || typeof params['payload'] !== 'string') return;
      const bytes = Buffer.from(params['payload'], 'base64');
      input.onPcm(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1).slice());
    });
    on('Target.detachedFromTarget', (params) => {
      if (params['sessionId'] === sessionId && !closed)
        for (const listener of closedListeners) listener();
    });
    await page('Runtime.enable');
    await page('Page.enable');
    await page('Runtime.addBinding', { name: MEETING_PCM_BINDING });
    await page('Page.addScriptToEvaluateOnNewDocument', { source: meetingCaptureScript() });
    input.signal.addEventListener('abort', () => void cleanup(), { once: true });
    return {
      page: {
        async evaluate<T>(expression: string): Promise<T> {
          const result = (await page('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
          })) as { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
          if (result.exceptionDetails !== undefined)
            throw new Error(result.exceptionDetails.text ?? 'page script failed');
          return result.result?.value as T;
        },
        async navigate(url: string) {
          let off = () => undefined as unknown;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const loaded = new Promise<void>((resolve) => {
            off = on('Page.loadEventFired', () => resolve());
            timer = setTimeout(resolve, 15_000);
          });
          try {
            await page('Page.navigate', { url });
            await loaded;
          } finally {
            off();
            clearTimeout(timer);
          }
        },
        onClosed(listener) {
          closedListeners.push(listener);
        },
      },
      close: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function devToolsUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error('Chrome did not open DevTools in time'));
    }, LAUNCH_TIMEOUT_MS);
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const match = /DevTools listening on (ws:\/\/\S+)/u.exec(output);
      if (match !== null) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited before DevTools opened (${code ?? 'signal'})`));
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3_000);
  await exited;
  clearTimeout(timer);
}
