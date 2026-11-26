import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import {
  createBotBrowserRuntime,
  connectCdp,
  waitForBrowserReady,
  type BotBrowserRuntime,
  type BotBrowserRuntimeOptions,
  type BrowserTab,
  type BrowserObservation,
} from './browser.js';
import { compactBrowserSnapshot } from './observation.js';
import { createAgentBrowserProcess } from './agent-process.js';

const ATTRIBUTE = 'data-botharness-ref';

export function createAgentBrowserRuntime(options: BotBrowserRuntimeOptions): BotBrowserRuntime {
  const note = options.onEvent ?? (() => undefined);
  const process = createAgentBrowserProcess(note);
  let endpoint: string | undefined;
  let processEndpoint: string | undefined;
  let active: string | undefined;
  let lastUrl: string | undefined;
  let stopping: Promise<void> | undefined;
  const references = new Map<string, Set<string>>();
  const base = createBotBrowserRuntime({
    ...options,
    connect: async (url) => {
      endpoint = url;
      return (options.connect ?? connectCdp)(url);
    },
  });
  const scope = new AsyncLocalStorage<{ signal: AbortSignal; assertCurrent?: () => void }>();
  let queue: Promise<unknown> = Promise.resolve();

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      references.clear();
      active = undefined;
      endpoint = undefined;
      processEndpoint = undefined;
      await Promise.all([process.stop(), base.stop()]);
    })().finally(() => {
      stopping = undefined;
    });
    return stopping;
  };

  const runWithSignal = <T>(
    signal: AbortSignal,
    action: () => Promise<T>,
    guard?: () => void,
  ): Promise<T> => {
    const execute = async (): Promise<T> => {
      signal.throwIfAborted();
      guard?.();
      const abort = (): void => {
        void stop().catch(() => undefined);
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        const result = await scope.run(
          { signal, ...(guard === undefined ? {} : { assertCurrent: guard }) },
          action,
        );
        signal.throwIfAborted();
        guard?.();
        return result;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    };
    const next = queue.then(execute, execute);
    queue = next.catch(() => undefined);
    return next;
  };
  const serial = <T>(action: () => Promise<T>): Promise<T> =>
    scope.getStore() === undefined ? runWithSignal(new AbortController().signal, action) : action();
  const assertCurrent = (): void => {
    scope.getStore()?.signal.throwIfAborted();
    scope.getStore()?.assertCurrent?.();
  };
  const command = async (
    action: string,
    fields?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    assertCurrent();
    try {
      return await process.command(action, fields);
    } catch (error) {
      if (!process.isRunning()) await stop();
      throw error;
    }
  };
  const ensure = async (): Promise<void> => {
    if (stopping !== undefined) await stopping;
    assertCurrent();
    await base.ensure();
    assertCurrent();
    if (endpoint === undefined) throw new Error('The managed Browser endpoint is unavailable');
    if (!process.isRunning() || processEndpoint !== endpoint) {
      references.clear();
      active = undefined;
      try {
        if (process.isRunning()) await process.stop();
        await process.start(endpoint);
        processEndpoint = endpoint;
      } catch (error) {
        await stop();
        throw error;
      }
    }
    assertCurrent();
  };
  const select = async (tabId: string): Promise<void> => {
    assertCurrent();
    if (!base.isRunning() || !process.isRunning())
      throw new Error('The Bot Browser is not running; open and observe again');
    await base.tabInfo(tabId);
    if (active === tabId) return;
    await command('tab_list');
    const switched = await command('tab_switch', { tabId });
    if (switched['targetId'] !== tabId)
      throw new Error('agent-browser did not select the owned target');
    active = tabId;
  };
  const info = async (tabId: string): Promise<BrowserTab> => {
    const page = await base.tabInfo(tabId);
    lastUrl = page.url;
    return { tabId, ...page };
  };
  const selector = (tabId: string, ref: string): string => {
    if (!references.get(tabId)?.has(ref))
      throw new Error('The element ref is stale; call browser_observe again before acting');
    return `[${ATTRIBUTE}=${JSON.stringify(ref)}]`;
  };
  const act = async (
    tabId: string,
    action: string,
    fields: Record<string, unknown>,
  ): Promise<BrowserTab> => {
    await select(tabId);
    if (typeof fields['selector'] === 'string') {
      const checked = await command('evaluate', {
        script: `Boolean(document.querySelector(${JSON.stringify(fields['selector'])}))`,
      });
      if (checked['result'] !== true)
        throw new Error('The element ref is stale; call browser_observe again before acting');
    }
    if (action === 'fill') {
      const checked = await command('evaluate', {
        script: `(() => {
        const el = document.querySelector(${JSON.stringify(fields['selector'])});
        if (!el) return 'stale-ref';
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable)) return 'not-editable';
        if (el.matches(':disabled')) return 'disabled';
        if (el.readOnly) return 'readonly';
        el.focus();
        if (el.matches(':disabled') || el.readOnly || document.activeElement !== el) return 'not-editable';
        return 'editable';
      })()`,
      });
      if (checked['result'] !== 'editable')
        throw new Error('The referenced element is not an editable field');
    }
    references.delete(tabId);
    await command(action, fields);
    await waitForBrowserReady(
      async () => (await command('evaluate', { script: 'document.readyState' }))['result'],
      assertCurrent,
    );
    return info(tabId);
  };
  const observe = async (tabId: string): Promise<BrowserObservation> => {
    await select(tabId);
    references.delete(tabId);
    const documentNonce = randomUUID();
    await command('evaluate', {
      script: `Object.defineProperty(document, '__botharnessObservationDocument', { value: ${JSON.stringify(documentNonce)}, configurable: true })`,
    });
    const assertDocument = async (): Promise<void> => {
      const check = await command('evaluate', {
        script: `document.__botharnessObservationDocument === ${JSON.stringify(documentNonce)}`,
      });
      if (check['result'] !== true)
        throw new Error('Browser document changed during observation; call browser_observe again');
    };
    const result = await command('snapshot', { compact: false });
    await assertDocument();
    if (typeof result['snapshot'] !== 'string')
      throw new Error('agent-browser returned no snapshot');
    const exact = await base.observe(tabId);
    await assertDocument();
    assertCurrent();
    references.set(tabId, new Set(exact.elements.map((element) => element.ref)));
    lastUrl = exact.url;
    const text = compactBrowserSnapshot(result['snapshot']);
    return { ...exact, text };
  };
  return {
    runWithSignal,
    ensure: () => serial(ensure),
    isRunning: () => base.isRunning() || process.isRunning(),
    open: (url, reuse) =>
      serial(async () => {
        await ensure();
        const tab = await base.open('about:blank', reuse);
        try {
          return await act(tab.tabId, 'navigate', { url, waitUntil: 'load' });
        } catch (error) {
          if (reuse === undefined) await base.closeTab(tab.tabId).catch(() => undefined);
          throw error;
        }
      }),
    createTab: (url) =>
      serial(async () => {
        await ensure();
        const tab = await base.createTab('about:blank');
        try {
          return await act(tab.tabId, 'navigate', { url, waitUntil: 'load' });
        } catch (error) {
          await base.closeTab(tab.tabId).catch(() => undefined);
          throw error;
        }
      }),
    observe: (tab) => serial(() => observe(tab)),
    click: (tab, ref) => serial(() => act(tab, 'click', { selector: selector(tab, ref) })),
    type: (tab, ref, value) =>
      serial(() => act(tab, 'fill', { selector: selector(tab, ref), value })),
    insertText: (tab, value) =>
      serial(async () => {
        await select(tab);
        references.delete(tab);
        return base.insertText(tab, value);
      }),
    clickAt: (tab, x, y, button) =>
      serial(async () => {
        await select(tab);
        references.delete(tab);
        return base.clickAt(tab, x, y, button);
      }),
    pressKey: (tab, key) => serial(() => act(tab, 'press', { key })),
    scroll: (tab, direction, amount) => serial(() => act(tab, 'scroll', { direction, amount })),
    uploadFile: (tab, upload) =>
      serial(async () => {
        await select(tab);
        if (upload.ref !== undefined) selector(tab, upload.ref);
        references.delete(tab);
        await base.uploadFile(tab, upload);
      }),
    captureScreenshot: (tab) => serial(() => base.captureScreenshot(tab)),
    listTabs: () => serial(() => base.listTabs()),
    tabInfo: (tab) => serial(() => base.tabInfo(tab)),
    closeTab: (tab) =>
      serial(async () => {
        await base.closeTab(tab);
        references.delete(tab);
        if (active === tab) active = undefined;
      }),
    openWindow: (tab) =>
      serial(async () => {
        await ensure();
        return base.openWindow(tab);
      }),
    currentUrl: () => lastUrl,
    binaryPath: () => base.binaryPath(),
    viewerUrl: () => base.viewerUrl?.(),
    stop,
  };
}
