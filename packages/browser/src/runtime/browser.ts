import { spawn, type ChildProcess } from 'node:child_process';

import type {
  BotBrowserRuntime,
  BotBrowserRuntimeOptions,
  BrowserElement,
  BrowserObservation,
  BrowserTab,
} from './browser-contract.js';
import { jpegDimensions } from '../jpeg.js';
import { browserKey, modifierMask, type BrowserModifier } from './keyboard.js';
import {
  PROVISION_MIN_FREE_BYTES,
  checkDiskSpace,
  detectMissingSystemLibs,
  diagnoseStartupExit,
  diskSpaceFailure,
  installFailure,
  missingBinaryFailure,
  missingLibsFailure,
  missingLibsOfBinary,
  spawnFailure,
  startupTimeoutFailure,
} from './provision.js';
import { existsSync, mkdirSync } from 'node:fs';
import {
  PINNED_CHROMIUM_VERSION,
  buildLaunchArgs,
  discoverBrowserBinary,
  installPinnedBrowser,
  parseDevToolsUrl,
} from './browser-launch.js';
import {
  SNAPSHOT_SCRIPT,
  clickScript,
  selectorExpression,
  typeScript,
} from './browser-page-scripts.js';
import { waitForBrowserReady } from './browser-ready.js';
import { connectCdp, type CdpClient } from './cdp.js';

export {
  browserCandidates,
  buildLaunchArgs,
  discoverBrowserBinary,
  installPinnedBrowser,
  parseDevToolsUrl,
  PINNED_CHROMIUM_VERSION,
} from './browser-launch.js';
export { SNAPSHOT_SCRIPT } from './browser-page-scripts.js';
export { waitForBrowserReady } from './browser-ready.js';
export { connectCdp, type CdpClient } from './cdp.js';

export type * from './browser-contract.js';

export function createBotBrowserRuntime(options: BotBrowserRuntimeOptions): BotBrowserRuntime {
  const onEvent = options.onEvent ?? ((): void => undefined);
  const launchTimeoutMs = options.launchTimeoutMs ?? 20_000;
  const connect = options.connect ?? ((url: string) => connectCdp(url));
  let child: ChildProcess | undefined;
  let client: CdpClient | undefined;
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let binary: string | undefined;
  let lastUrl: string | undefined;
  let foreground = false;
  const sessions = new Map<string, string>();
  const closedChildren = new WeakSet<ChildProcess>();

  const isRunning = (): boolean =>
    client !== undefined &&
    client.isConnected?.() !== false &&
    (options.execution !== undefined
      ? options.execution.isRunning()
      : child !== undefined && child.exitCode === null && !child.killed);

  const watchTargets = (live: CdpClient): void => {
    const changed = options.onObservationChanged;
    if (changed === undefined) return;
    for (const method of [
      'Target.targetCreated',
      'Target.targetDestroyed',
      'Target.targetInfoChanged',
    ])
      live.subscribe(method, undefined, changed);
    void live.send('Target.setDiscoverTargets', { discover: true }).catch(() => undefined);
    changed();
  };

  const launch = async (): Promise<void> => {
    if (options.execution !== undefined) {
      const started = await options.execution.start();
      binary = started.binary;
      try {
        client = await connect(started.endpoint);
      } catch (error) {
        await options.execution.stop();
        throw error;
      }
      watchTargets(client);
      onEvent('ready target=container');
      return;
    }
    binary = discoverBrowserBinary(
      options.browserPath,
      options.platform,
      options.env,
      options.fileExists ?? existsSync,
    );
    if (binary === undefined) {
      const explicit = options.browserPath?.trim() ?? '';
      if (explicit !== '') {
        throw missingBinaryFailure(explicit);
      }
      const installer = options.installFallback ?? installPinnedBrowser;
      if (options.installDir === undefined && options.installFallback === undefined) {
        throw missingBinaryFailure('');
      }
      const cacheDir = options.installDir ?? options.userDataDir;
      const disk = checkDiskSpace(cacheDir, PROVISION_MIN_FREE_BYTES);
      if (!disk.ok) {
        throw diskSpaceFailure(cacheDir, disk.availableBytes, PROVISION_MIN_FREE_BYTES);
      }
      const platform = options.platform ?? process.platform;
      const missing = detectMissingSystemLibs(platform, options.preflight);
      if (missing.length > 0) {
        throw missingLibsFailure(
          missing.map((entry) => entry.soname),
          { beforeDownload: true },
        );
      }
      onEvent(`no system browser; installing Chrome for Testing ${PINNED_CHROMIUM_VERSION}`);
      options.onInstallProgress?.(0, 0);
      let lastBand = 0;
      const startedInstall = Date.now();
      try {
        binary = await installer(cacheDir, {
          onProgress: (downloadedBytes, totalBytes) => {
            options.onInstallProgress?.(downloadedBytes, totalBytes);
            if (totalBytes > 0) {
              const band = Math.floor((downloadedBytes / totalBytes) * 4);
              if (band > lastBand) {
                lastBand = band;
                onEvent(
                  `install progress ${String(band * 25)}% initiator=provisioning durationMs=${Date.now() - startedInstall}`,
                );
              }
            }
          },
        });
      } catch (error) {
        throw installFailure(error, cacheDir);
      } finally {
        options.onInstallSettled?.();
      }
      onEvent(`installed ${binary}`);
    }
    mkdirSync(options.userDataDir, { recursive: true });
    const headless =
      typeof options.headless === 'function' ? options.headless() : options.headless === true;
    foreground = !headless && options.foregroundTabs?.() === true;
    onEvent(`launch ${binary} mode=${headless ? 'headless' : 'headed'}`);
    const proc = spawn(
      binary,
      [
        ...buildLaunchArgs({
          userDataDir: options.userDataDir,
          ...(headless ? { headless: true } : {}),
        }),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], shell: false, windowsHide: true },
    );
    child = proc;
    proc.once('close', () => {
      closedChildren.add(proc);
      options.onObservationChanged?.();
    });
    const endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = '';
      let stderrTruncated = false;
      const settle = (action: () => void): void => {
        clearTimeout(timer);
        proc.stderr?.off('data', onData);
        proc.off('exit', onExit);
        proc.off('error', onError);
        action();
      };
      const timer = setTimeout(
        () =>
          settle(() =>
            reject(
              startupTimeoutFailure(launchTimeoutMs, {
                binary: binary ?? '',
                ...(proc.pid === undefined ? {} : { pid: proc.pid }),
                exitCode: proc.exitCode,
                signalCode: proc.signalCode,
                killed: proc.killed,
                stderr: stderrTruncated
                  ? stderr.includes('\n')
                    ? stderr.slice(stderr.indexOf('\n') + 1)
                    : '<truncated line>'
                  : stderr,
              }),
            ),
          ),
        launchTimeoutMs,
      );
      const onData = (chunk: Buffer): void => {
        stderr += chunk.toString('utf8');
        const url = parseDevToolsUrl(stderr);
        if (url !== undefined) settle(() => resolve(url));
        if (stderr.length > 8192) {
          stderr = stderr.slice(-8192);
          stderrTruncated = true;
        }
      };
      const onExit = (code: number | null): void =>
        settle(() => {
          const launchedBinary = binary;
          const platform = options.platform ?? process.platform;
          const missing =
            launchedBinary === undefined || platform !== 'linux'
              ? []
              : missingLibsOfBinary(launchedBinary, options.preflight);
          reject(
            diagnoseStartupExit({
              binary: launchedBinary ?? '',
              code,
              stderr,
              platform,
              missingLibs: missing,
            }),
          );
        });
      const onError = (error: Error): void =>
        settle(() => reject(spawnFailure(error, binary ?? '')));
      proc.stderr?.on('data', onData);
      proc.on('exit', onExit);
      proc.on('error', onError);
    });
    try {
      client = await connect(endpoint);
    } catch (error) {
      proc.kill('SIGTERM');
      throw error;
    }
    watchTargets(client);
    onEvent('ready');
  };

  const ensure = async (): Promise<void> => {
    if (stopping !== undefined) await stopping;
    if (isRunning()) return;
    if (starting === undefined && child !== undefined) {
      if (closedChildren.has(child)) child = undefined;
      else await stop();
    }
    client?.close();
    client = undefined;
    sessions.clear();
    starting ??= launch().finally(() => {
      starting = undefined;
    });
    await starting;
  };

  const attach = async (targetId: string): Promise<string> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const existing = sessions.get(targetId);
    if (existing !== undefined) return existing;
    const info = await live.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = typeof info['sessionId'] === 'string' ? info['sessionId'] : '';
    if (sessionId === '') throw new Error('The Bot Browser did not attach a debugging session');
    sessions.set(targetId, sessionId);
    return sessionId;
  };

  const evaluate = async (sessionId: string, expression: string): Promise<unknown> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send(
      'Runtime.evaluate',
      { expression, returnByValue: true },
      sessionId,
    );
    const remote = result['result'];
    if (typeof remote !== 'object' || remote === null) return undefined;
    return (remote as { value?: unknown }).value;
  };

  const waitForReady = (sessionId: string): Promise<void> =>
    waitForBrowserReady(() => evaluate(sessionId, 'document.readyState'));

  const asObject = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

  const readPage = async (sessionId: string): Promise<{ url: string; title: string }> => {
    const value = asObject(
      await evaluate(sessionId, '({ url: location.href, title: document.title })').catch(
        () => undefined,
      ),
    );
    return {
      url: typeof value?.['url'] === 'string' ? value['url'] : 'about:blank',
      title: typeof value?.['title'] === 'string' ? value['title'] : '',
    };
  };

  const prepareInput = async (sessionId: string): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    if (!focusEmulated.has(sessionId)) {
      await live.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
      focusEmulated.add(sessionId);
    }
  };

  const dispatchMouseClick = async (
    sessionId: string,
    x: number,
    y: number,
    button: 'left' | 'right' = 'left',
  ): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    await prepareInput(sessionId);
    await live.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x, y, button, clickCount: 1 },
      sessionId,
    );
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x, y, button, clickCount: 1 },
      sessionId,
    );
  };

  const clickRef = async (sessionId: string, ref: string): Promise<void> => {
    const value = asObject(await evaluate(sessionId, clickScript(ref)));
    if (value === undefined || value['ok'] !== true) {
      const reason =
        value !== undefined && typeof value['reason'] === 'string' ? value['reason'] : 'failed';
      if (reason === 'stale-ref') {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      throw new Error(`The Bot Browser action failed: ${reason}`);
    }
    const x = typeof value['x'] === 'number' ? value['x'] : 0;
    const y = typeof value['y'] === 'number' ? value['y'] : 0;
    await dispatchMouseClick(sessionId, x, y);
  };

  const runInteraction = async (tabId: string, expression: string): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const value = asObject(await evaluate(sessionId, expression));
    if (value !== undefined && value['ok'] !== true) {
      const reason = typeof value['reason'] === 'string' ? value['reason'] : 'failed';
      if (reason === 'stale-ref') {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      if (reason === 'readonly' || reason === 'disabled') {
        throw new Error(`The referenced field is ${reason}; choose an editable field`);
      }
      if (reason === 'not-editable') {
        throw new Error('The referenced element is not an editable field');
      }
      throw new Error(`The Bot Browser action failed: ${reason}`);
    }
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const click = async (tabId: string, ref: string): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    await clickRef(sessionId, ref);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const clickAt = async (
    tabId: string,
    x: number,
    y: number,
    button: 'left' | 'right' = 'left',
  ): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const bounds = asObject(
      await evaluate(sessionId, '({ width: window.innerWidth, height: window.innerHeight })'),
    );
    const width = typeof bounds?.['width'] === 'number' ? bounds['width'] : undefined;
    const height = typeof bounds?.['height'] === 'number' ? bounds['height'] : undefined;
    if (
      width !== undefined &&
      height !== undefined &&
      (x < 0 || y < 0 || x >= width || y >= height)
    ) {
      throw new Error(
        `The coordinates ${Math.round(x)},${Math.round(y)} are outside the viewport (${width}x${height}); take a fresh browser_screenshot and use its coordinates`,
      );
    }
    await dispatchMouseClick(sessionId, x, y, button);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const type = (tabId: string, ref: string, text: string): Promise<BrowserTab> =>
    runInteraction(tabId, typeScript(ref, text));

  const pressKey = async (
    tabId: string,
    key: string,
    modifiers: readonly BrowserModifier[] = [],
  ): Promise<BrowserTab> => {
    const { text, ...definition } = browserKey(key);
    const mask = modifierMask(modifiers);
    const chord = (mask & 0b110) !== 0;
    const sessionId = await attach(tabId);
    const live = client;
    if (!live) throw new Error('Bot Browser is not connected');
    await prepareInput(sessionId);
    const release = (): Promise<Record<string, unknown>> =>
      live.send(
        'Input.dispatchKeyEvent',
        { type: 'keyUp', ...definition, ...(mask === 0 ? {} : { modifiers: mask }) },
        sessionId,
      );
    try {
      await live.send(
        'Input.dispatchKeyEvent',
        {
          type: text !== undefined && !chord ? 'keyDown' : 'rawKeyDown',
          ...definition,
          ...(mask === 0 ? {} : { modifiers: mask }),
          ...(text !== undefined && !chord ? { text, unmodifiedText: text } : {}),
        },
        sessionId,
      );
    } catch (error) {
      await release().catch(() => undefined);
      throw error;
    }
    await release();
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, ...page };
  };

  const insertText = async (tabId: string, text: string): Promise<BrowserTab> => {
    if (text === '' || text.length > 4000) {
      throw new Error('Viewer text must be 1-4000 characters');
    }
    const sessionId = await attach(tabId);
    const live = client;
    if (!live) throw new Error('Bot Browser is not connected');
    await prepareInput(sessionId);
    await live.send('Input.insertText', { text }, sessionId);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, ...page };
  };

  const scroll = async (
    tabId: string,
    direction: 'up' | 'down',
    amount: number,
  ): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const bounds = asObject(
      await evaluate(sessionId, '({ width: window.innerWidth, height: window.innerHeight })'),
    );
    const width = bounds?.['width'];
    const height = bounds?.['height'];
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('The Bot Browser viewport is unavailable; observe again before scrolling');
    }
    const live = client;
    if (!live) throw new Error('The Bot Browser is not running');
    await prepareInput(sessionId);
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: width / 2, y: height / 2 },
      sessionId,
    );
    await live.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseWheel',
        x: width / 2,
        y: height / 2,
        deltaX: 0,
        deltaY: direction === 'down' ? amount : -amount,
      },
      sessionId,
    );
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, ...page };
  };

  const open = async (url: string, reuseTabId?: string): Promise<BrowserTab> => {
    await ensure();
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    let targetId = reuseTabId;
    if (targetId !== undefined) {
      try {
        await live.send('Target.getTargetInfo', { targetId });
      } catch {
        targetId = undefined;
      }
    }
    const tab =
      targetId === undefined ? await openTarget(url, false) : await navigateTab(targetId, url);
    await showTab(tab.tabId);
    return tab;
  };

  const showTab = async (targetId: string): Promise<void> => {
    const live = client;
    if (!foreground || options.execution !== undefined || live === undefined) return;
    try {
      await live.send('Target.activateTarget', { targetId });
    } catch (error) {
      onEvent(`phase=show-tab outcome=error detail=${String(error).slice(0, 160)}`);
    }
  };

  const navigateTab = async (targetId: string, url: string): Promise<BrowserTab> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const sessionId = await attach(targetId);
    const navigation = await live.send('Page.navigate', { url }, sessionId);
    if (typeof navigation['errorText'] === 'string' && navigation['errorText'] !== '') {
      throw new Error(
        `Bot Browser navigation failed (${navigation['errorText']}); retry browser_open with a reachable URL`,
      );
    }
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId: targetId, url: page.url, title: page.title };
  };

  const openTarget = async (url: string, newWindow: boolean): Promise<BrowserTab> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const created = await live.send('Target.createTarget', {
      url: 'about:blank',
      ...(newWindow ? { newWindow: true } : { background: true, focus: false }),
    });
    const targetId = typeof created['targetId'] === 'string' ? created['targetId'] : '';
    if (targetId === '') throw new Error('The Bot Browser did not open a tab');
    try {
      return await navigateTab(targetId, url);
    } catch (error) {
      const started = Date.now();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          live.send('Target.closeTarget', { targetId }).then((closed) => {
            if (closed['success'] === false)
              throw new Error('Navigation cleanup was refused', { cause: error });
            sessions.delete(targetId);
          }),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Navigation cleanup timed out')), 2000);
          }),
        ]);
      } catch {
        onEvent(
          `navigation cleanup failed initiator=navigation phase=new-target outcome=error reason=cleanup-unavailable durationMs=${Date.now() - started}`,
        );
      } finally {
        clearTimeout(timeout);
      }
      throw error;
    }
  };

  const createTab = async (url: string): Promise<BrowserTab> => {
    await ensure();
    const tab = await openTarget(url, false);
    await showTab(tab.tabId);
    return tab;
  };

  const uploadFile = async (
    tabId: string,
    options: { ref?: string; path: string },
  ): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const sessionId = await attach(tabId);
    const documentRoot = async (): Promise<number> => {
      const document = await live.send('DOM.getDocument', {}, sessionId);
      const rootId = asObject(document['root'])?.['nodeId'];
      if (typeof rootId !== 'number') throw new Error('The Bot Browser returned no document');
      return rootId;
    };
    if (options.ref !== undefined) {
      const target = asObject(
        await evaluate(
          sessionId,
          `(() => { const el = ${selectorExpression(options.ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; return { ok: true, fileInput: el instanceof HTMLInputElement && el.type === 'file' }; })()`,
        ),
      );
      if (target?.['ok'] !== true) {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      if (target['fileInput'] === true) {
        const found = await live.send(
          'DOM.querySelector',
          {
            nodeId: await documentRoot(),
            selector: `input[type="file"][data-botharness-ref=${JSON.stringify(options.ref)}]`,
          },
          sessionId,
        );
        const nodeId = found['nodeId'];
        if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId <= 0) {
          throw new Error(
            'The referenced file input is unavailable; call browser_observe again before uploading',
          );
        }
        await live.send('DOM.setFileInputFiles', { files: [options.path], nodeId }, sessionId);
        return;
      }
    }
    if (options.ref === undefined) {
      const found = await live.send(
        'DOM.querySelector',
        { nodeId: await documentRoot(), selector: 'input[type="file"]' },
        sessionId,
      );
      const nodeId = found['nodeId'];
      if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId <= 0)
        throw new Error(
          'The page has no file input; observe an upload control and pass its ref, then retry',
        );
      await live.send('DOM.setFileInputFiles', { files: [options.path], nodeId }, sessionId);
      return;
    }
    let backendNodeId: number | undefined;
    const unsubscribe = live.subscribe('Page.fileChooserOpened', sessionId, (params) => {
      const id = params['backendNodeId'];
      if (typeof id === 'number' && Number.isInteger(id) && id > 0 && backendNodeId === undefined)
        backendNodeId = id;
    });
    try {
      await live.send('Page.enable', {}, sessionId);
      await live.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
      await clickRef(sessionId, options.ref);
      for (let attempt = 0; attempt < 10 && backendNodeId === undefined; attempt += 1)
        await new Promise((resolve) => setTimeout(resolve, 200));
      if (backendNodeId === undefined)
        throw new Error(
          'The upload control did not open a file input; call browser_observe and choose a file input or picker control before retrying',
        );
      await live.send('DOM.setFileInputFiles', { files: [options.path], backendNodeId }, sessionId);
    } finally {
      unsubscribe();
      await live
        .send('Page.setInterceptFileChooserDialog', { enabled: false }, sessionId)
        .catch(() => undefined);
    }
  };

  const listTabs = async (): Promise<
    readonly { targetId: string; url: string; title: string }[]
  > => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send('Target.getTargets', {});
    const infos = Array.isArray(result['targetInfos'])
      ? (result['targetInfos'] as readonly Record<string, unknown>[])
      : [];
    return infos
      .filter((info) => info['type'] === 'page' && typeof info['targetId'] === 'string')
      .map((info) => ({
        targetId: String(info['targetId']),
        url: typeof info['url'] === 'string' ? info['url'] : '',
        title: typeof info['title'] === 'string' ? info['title'] : '',
      }));
  };

  const tabInfo = async (targetId: string): Promise<{ url: string; title: string }> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send('Target.getTargetInfo', { targetId });
    const info = asObject(result['targetInfo']);
    return {
      url: typeof info?.['url'] === 'string' ? info['url'] : '',
      title: typeof info?.['title'] === 'string' ? info['title'] : '',
    };
  };

  const closeTab = async (targetId: string): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    await live.send('Target.closeTarget', { targetId });
    sessions.delete(targetId);
  };

  const observe = async (tabId: string): Promise<BrowserObservation> => {
    const sessionId = await attach(tabId);
    await showTab(tabId);
    const value = asObject(await evaluate(sessionId, SNAPSHOT_SCRIPT));
    if (value === undefined) throw new Error('The Bot Browser returned no page state');
    const elements = Array.isArray(value['elements'])
      ? (value['elements'] as readonly BrowserElement[])
      : [];
    const url = typeof value['url'] === 'string' ? value['url'] : 'about:blank';
    lastUrl = url;
    return {
      url,
      title: typeof value['title'] === 'string' ? value['title'] : '',
      elements,
      text: typeof value['text'] === 'string' ? value['text'] : '',
    };
  };

  const focusEmulated = new Set<string>();

  const streamFrames = async (
    tabId: string,
    onFrame: (frame: {
      data: string;
      mimeType: string;
      viewport?: { width: number; height: number };
    }) => void,
  ): Promise<() => Promise<void>> => {
    const sessionId = await attach(tabId);
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    await live
      .send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)
      .catch(() => undefined);
    const unsubscribe = live.subscribe('Page.screencastFrame', sessionId, (params) => {
      const ack = params['sessionId'];
      if (typeof ack === 'number')
        void live.send('Page.screencastFrameAck', { sessionId: ack }, sessionId).catch(() => {});
      const data = params['data'];
      if (typeof data !== 'string' || data === '') return;
      const metadata = asObject(params['metadata']);
      const width = metadata?.['deviceWidth'];
      const height = metadata?.['deviceHeight'];
      onFrame({
        data,
        mimeType: 'image/jpeg',
        ...(typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
          ? { viewport: { width, height } }
          : {}),
      });
    });
    try {
      await live.send(
        'Page.startScreencast',
        { format: 'jpeg', quality: 60, everyNthFrame: 1 },
        sessionId,
      );
    } catch (error) {
      unsubscribe();
      throw error;
    }
    return async () => {
      unsubscribe();
      await live.send('Page.stopScreencast', {}, sessionId).catch(() => undefined);
    };
  };

  const captureScreenshot = async (
    tabId: string,
  ): Promise<{ data: string; mimeType: string } | undefined> => {
    const sessionId = await attach(tabId);
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const metrics = await live.send('Page.getLayoutMetrics', {}, sessionId).catch(() => undefined);
    const clip = asObject(metrics?.['cssVisualViewport']);
    const viewport =
      clip !== undefined &&
      typeof clip['clientWidth'] === 'number' &&
      typeof clip['clientHeight'] === 'number'
        ? { width: clip['clientWidth'], height: clip['clientHeight'] }
        : undefined;
    const capture = async (): Promise<string | undefined> => {
      const result = await live.send(
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          quality: 60,
          fromSurface: true,
          ...(clip === undefined ||
          typeof clip['clientWidth'] !== 'number' ||
          typeof clip['clientHeight'] !== 'number' ||
          clip['clientWidth'] <= 0
            ? {}
            : {
                clip: {
                  x: typeof clip['pageX'] === 'number' ? clip['pageX'] : 0,
                  y: typeof clip['pageY'] === 'number' ? clip['pageY'] : 0,
                  width: clip['clientWidth'],
                  height: clip['clientHeight'],
                  scale: 1,
                },
              }),
        },
        sessionId,
      );
      return typeof result['data'] === 'string' && result['data'] !== ''
        ? result['data']
        : undefined;
    };
    const withMeta = (
      data: string,
    ): {
      data: string;
      mimeType: string;
      viewport?: { width: number; height: number };
      image?: { width: number; height: number };
    } => {
      const image = jpegDimensions(data);
      return {
        data,
        mimeType: 'image/jpeg',
        ...(viewport === undefined ? {} : { viewport }),
        ...(image === undefined ? {} : { image }),
      };
    };
    try {
      const data = await capture();
      if (data !== undefined) return withMeta(data);
    } catch {
      void 0;
    }
    await prepareInput(sessionId).catch(() => undefined);
    const data = await capture().catch(() => undefined);
    return data === undefined ? undefined : withMeta(data);
  };

  const openWindow = async (existingTargetId?: string): Promise<BrowserTab> => {
    await ensure();
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    let targetId = existingTargetId;
    if (targetId === undefined) {
      const created = await live.send('Target.createTarget', {
        url: 'about:blank',
        newWindow: true,
      });
      targetId = typeof created['targetId'] === 'string' ? created['targetId'] : '';
      if (targetId === '') throw new Error('The Bot Browser did not open a window');
    }
    const sessionId = await attach(targetId);
    const window = await live.send('Browser.getWindowForTarget', { targetId });
    if (asObject(window['bounds'])?.['windowState'] === 'minimized') {
      await live.send('Browser.setWindowBounds', {
        windowId: window['windowId'],
        bounds: { windowState: 'normal' },
      });
    }
    await live.send('Target.activateTarget', { targetId });
    await live.send('Page.bringToFront', {}, sessionId);
    return { tabId: targetId, ...(await tabInfo(targetId)) };
  };

  const stopRuntime = async (): Promise<void> => {
    await starting?.catch(() => undefined);
    const proc = child;
    const live = client;
    client = undefined;
    sessions.clear();
    if (options.execution !== undefined) {
      if (live !== undefined) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            live.send('Browser.close').catch(() => undefined),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 2_000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      live?.close();
      await options.execution.stop();
      options.onObservationChanged?.();
      onEvent('stopped target=container');
      return;
    }
    live?.close();
    if (proc === undefined) return;
    if (!closedChildren.has(proc)) {
      await new Promise<void>((resolve, reject) => {
        let forced: ReturnType<typeof setTimeout> | undefined;
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const settle = (error?: Error): void => {
          clearTimeout(forced);
          clearTimeout(deadline);
          proc.off('close', onClose);
          proc.off('error', onError);
          if (error === undefined) resolve();
          else {
            onEvent('phase=stop outcome=error reason=process-close-unconfirmed');
            reject(error);
          }
        };
        const onClose = (): void => settle();
        const onError = (error: Error): void => settle(error);
        const signal = (name: NodeJS.Signals): void => {
          if (proc.exitCode !== null || proc.signalCode != null) return;
          try {
            proc.kill(name);
          } catch (error) {
            settle(error instanceof Error ? error : new Error('Browser shutdown failed'));
          }
        };
        proc.once('close', onClose);
        proc.once('error', onError);
        forced = setTimeout(() => {
          deadline = setTimeout(
            () => settle(new Error('Browser process did not close after shutdown')),
            2_000,
          );
          signal('SIGKILL');
        }, 4_000);
        signal('SIGTERM');
      });
    }
    if (child === proc) child = undefined;
    options.onObservationChanged?.();
    onEvent('stopped');
  };

  const stop = (): Promise<void> => {
    stopping ??= stopRuntime().finally(() => {
      stopping = undefined;
    });
    return stopping;
  };

  return {
    ensure,
    isRunning,
    open,
    observe,
    click,
    clickAt,
    type,
    insertText,
    pressKey,
    scroll,
    async uploadFile(tabId, upload) {
      if (!existsSync(upload.path))
        throw new Error(`The file does not exist on the Host: ${upload.path}`);
      const transferred = await options.execution?.prepareUpload?.(upload.path);
      try {
        await uploadFile(
          tabId,
          transferred === undefined ? upload : { ...upload, path: transferred.path },
        );
      } finally {
        await transferred?.dispose();
      }
    },
    createTab,
    listTabs,
    tabInfo,
    closeTab,
    captureScreenshot,
    streamFrames,
    openWindow,
    currentUrl: () => lastUrl,
    binaryPath: () => binary,
    viewerUrl: () => options.execution?.viewerUrl?.(),
    stop,
  };
}
