import { openMeetingBrowser, type MeetingBrowser, type MeetingPage } from './meeting-browser.js';
import type { MeetingFarEnd, MeetingFarEndHandlers } from './meetings.js';
import type { MeetingPlatform } from './store.js';

export type MeetingPagePhase = 'joining' | 'lobby' | 'in-meeting' | 'ended' | 'denied';

export interface MeetingPageState {
  readonly phase: MeetingPagePhase;
  readonly participants?: number | undefined;
  readonly speaker?: string | undefined;
}

export interface MeetingPageDriver {
  readonly platform: MeetingPlatform;
  matches(url: URL): boolean;
  pageUrl(url: URL): string;
  enter(page: MeetingPage, displayName: string, signal: AbortSignal): Promise<void>;
  read(page: MeetingPage): Promise<MeetingPageState>;
  leave(page: MeetingPage): Promise<void>;
  sendChat?(page: MeetingPage, text: string): Promise<void>;
}

export interface BrowserFarEndOptions {
  readonly chrome: () => string | undefined;
  readonly headless?: boolean;
  readonly pollMs?: number;
  readonly aloneMs?: number;
  readonly leaveMs?: number;
  readonly open?: typeof openMeetingBrowser;
}

export async function untilPage(
  page: MeetingPage,
  expression: string,
  input: { readonly timeoutMs: number; readonly signal: AbortSignal; readonly what: string },
): Promise<void> {
  const deadline = Date.now() + input.timeoutMs;
  for (;;) {
    if (input.signal.aborted) throw new Error(`${input.what}: cancelled`);
    if (await page.evaluate<boolean>(expression).catch(() => false)) return;
    if (Date.now() > deadline) throw new Error(`${input.what}: timed out`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export function createBrowserFarEnd(
  driver: MeetingPageDriver,
  options: BrowserFarEndOptions,
): MeetingFarEnd {
  const open = options.open ?? openMeetingBrowser;
  const pollMs = options.pollMs ?? 1_000;
  const aloneMs = options.aloneMs ?? 120_000;
  const leaveMs = options.leaveMs ?? 5_000;
  return {
    platform: driver.platform,
    matches: (url) => driver.matches(url),
    async join({ url, displayName, signal, handlers }) {
      const chrome = options.chrome();
      if (chrome === undefined)
        throw new Error('Install Google Chrome or Microsoft Edge on this Host to attend meetings.');
      const own = new AbortController();
      const browser = await open({
        chrome,
        ...(options.headless === undefined ? {} : { headless: options.headless }),
        signal: own.signal,
        onPcm: (samples) => handlers.onPcm(samples),
      });
      const watch = watchPage(driver, browser, handlers, { pollMs, aloneMs });
      let leaving: Promise<void> | undefined;
      const leave = () =>
        (leaving ??= (async () => {
          watch.stop();
          await Promise.race([
            driver.leave(browser.page).catch(() => undefined),
            new Promise((resolve) => setTimeout(resolve, leaveMs)),
          ]);
          own.abort();
          await browser.close();
        })());
      signal.addEventListener('abort', () => void leave(), { once: true });
      try {
        await browser.page.navigate(driver.pageUrl(url));
        await driver.enter(browser.page, displayName, own.signal);
      } catch (error) {
        watch.stop();
        own.abort();
        await browser.close();
        throw error;
      }
      watch.start();
      return {
        leave,
        speaker: () => watch.speaker(),
        ...(driver.sendChat === undefined
          ? {}
          : { sendChat: (text: string) => driver.sendChat!(browser.page, text) }),
      };
    },
  };
}

function watchPage(
  driver: MeetingPageDriver,
  browser: MeetingBrowser,
  handlers: MeetingFarEndHandlers,
  timing: { readonly pollMs: number; readonly aloneMs: number },
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let done = false;
  let admitted = false;
  let reading = false;
  let aloneSince: number | undefined;
  let speaker: string | undefined;
  const stop = () => {
    done = true;
    if (timer !== undefined) clearInterval(timer);
  };
  const end = (reason: Parameters<MeetingFarEndHandlers['onEnded']>[0]) => {
    if (done) return;
    stop();
    handlers.onEnded(reason);
  };
  browser.page.onClosed(() => end('audio-lost'));
  const tick = async () => {
    if (reading || done) return;
    reading = true;
    try {
      const state = await driver.read(browser.page);
      if (done) return;
      speaker = state.speaker;
      if (state.phase === 'in-meeting' && !admitted) {
        admitted = true;
        handlers.onAdmitted();
      }
      if (state.phase === 'denied') return end('not-admitted');
      if (state.phase === 'ended') return end(admitted ? 'meeting-ended' : 'not-admitted');
      if (admitted && state.participants !== undefined && state.participants <= 1) {
        aloneSince ??= Date.now();
        if (Date.now() - aloneSince >= timing.aloneMs) end('alone');
      } else aloneSince = undefined;
    } catch {
    } finally {
      reading = false;
    }
  };
  return {
    start() {
      if (done) return;
      timer = setInterval(() => void tick(), timing.pollMs);
      timer.unref?.();
      void tick();
    },
    stop,
    speaker: () => speaker,
  };
}
