import { basename } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { formatBrowserElement } from '../runtime/observation.js';
import { saveScreenshot } from '../screenshots.js';
import type { BrowserObservation } from '../runtime/browser.js';
import type { BrowserToolProviderOptions } from './provider.js';
import type { BotBrowserRuntimes } from '../runtimes.js';

export type BrowserToolContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly data: string; readonly mimeType: string };

export interface BotTabs {
  current: string | undefined;
  readonly owned: Set<string>;
  lastActivity: number;
  controlRevision: number;
  observedControlRevision: number;
  observedDesktopEpoch: number | undefined;
}

const DEAD_TARGET =
  /target closed|no target with given id|session with given id not found|inspected target navigated or closed|session closed|websocket closed|not attached|detached from target|browser has been closed/iu;

function isDeadTarget(message: string): boolean {
  return DEAD_TARGET.test(message);
}

function requiredString(args: Record<string, unknown>, key: string, message: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message);
  return value;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

interface BrowserToolExecutorOptions {
  options: BrowserToolProviderOptions;
  runtimes: BotBrowserRuntimes;
  tabsByBot: Map<string, BotTabs>;
  botTabs(slug: string): BotTabs;
  dropCurrent(state: BotTabs): void;
  takeovers: Set<string>;
}

export function createBrowserToolExecutor({
  options,
  runtimes,
  tabsByBot,
  botTabs,
  dropCurrent,
  takeovers,
}: BrowserToolExecutorOptions) {
  const executeTool = async (
    raw: string,
    args: Record<string, unknown>,
    slug: string,
    signal: AbortSignal,
    assertControlCurrent: () => void,
  ): Promise<{ content: BrowserToolContent[] }> => {
    const profile = options.profile?.();
    if (profile !== undefined) {
      const state = botTabs(slug);
      const revision = state.controlRevision;
      const value = await profile.command(slug, raw, args, signal);
      if (raw === 'observe') {
        const observation = value as BrowserObservation;
        if (
          !takeovers.has(slug) &&
          tabsByBot.get(slug) === state &&
          state.controlRevision === revision
        )
          state.observedControlRevision = revision;
        return {
          content: [
            {
              type: 'text',
              text: [
                `URL: ${observation.url}`,
                `Title: ${observation.title}`,
                'Human-authorized Chrome Profile',
                '',
                'Interactive elements:',
                ...observation.elements.map((element) => formatBrowserElement(element)),
                '',
                'Page text:',
                observation.text,
              ].join('\n'),
            },
          ],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(value) }] };
    }
    const daily = options.daily?.();
    if (daily !== undefined) {
      if (raw === 'observe') {
        const state = botTabs(slug);
        const revision = state.controlRevision;
        const observation = await daily.observe(slug, signal);
        if (!takeovers.has(slug) && revision === state.controlRevision)
          state.observedControlRevision = revision;
        return {
          content: [
            {
              type: 'text',
              text: [
                `URL: ${observation.url}`,
                `Title: ${observation.title}`,
                'Human Daily Browser — explicitly controlled document',
                '',
                'Interactive elements:',
                ...observation.elements.map((element) => formatBrowserElement(element)),
                '',
                'Page text:',
                observation.text,
              ].join('\n'),
            },
          ],
        };
      }
      if (raw !== 'type' && raw !== 'click')
        throw new Error('Daily Browser control supports observe, type and click only');
      requiredString(args, 'ref', `browser_${raw} needs a ref from browser_observe`);
      const page = await daily.act(slug, raw, args, signal);
      return { content: [{ type: 'text', text: `${raw} done — ${page.url}` }] };
    }
    const borrowed = options.borrowed?.();
    if (borrowed !== undefined) {
      if (raw !== 'observe')
        throw new Error('Daily Browser currently supports read-only browser_observe');
      const observation = await borrowed.observe(slug, signal);
      return {
        content: [
          {
            type: 'text',
            text: [
              `URL: ${observation.url}`,
              `Title: ${observation.title}`,
              'Shared by Human — read-only',
              '',
              'Controls (read-only):',
              ...observation.elements.map((element) => formatBrowserElement(element, false)),
              '',
              'Page text:',
              observation.text,
            ].join('\n'),
          },
        ],
      };
    }
    const runtime = runtimes.for(slug);
    if (raw === 'open') {
      const url = typeof args['url'] === 'string' ? args['url'] : '';
      if (!/^https?:\/\//u.test(url)) {
        throw new Error(
          'browser_open needs an absolute http(s) URL, for example https://example.com',
        );
      }
      const state = botTabs(slug);
      const tab = await runtime.open(url, state.current);
      state.owned.add(tab.tabId);
      state.current = tab.tabId;
      state.lastActivity = Date.now();
      const title = tab.title === '' ? '' : ` — ${tab.title}`;
      return {
        content: [
          {
            type: 'text',
            text: `Opened ${tab.url}${title}. Call browser_observe to read the page.`,
          },
        ],
      };
    }
    if (raw === 'observe') {
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      const revision = state.controlRevision;
      const desktopEpoch = options.desktopControl?.()?.epoch;
      const actionable = !takeovers.has(slug);
      let observation;
      try {
        observation = await runtime.observe(tabId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isDeadTarget(message)) throw error;
        dropCurrent(state);
        throw new Error(
          `The Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
          { cause: error },
        );
      }
      if (
        actionable &&
        !takeovers.has(slug) &&
        state.controlRevision === revision &&
        tabsByBot.get(slug) === state
      ) {
        state.observedControlRevision = revision;
      }
      const after = options.desktopControl?.();
      if (after !== undefined && after.held !== true && after.epoch === desktopEpoch)
        state.observedDesktopEpoch = desktopEpoch;
      const elementLines = observation.elements.map((element) => formatBrowserElement(element));
      const parts = [`URL: ${observation.url}`, `Title: ${observation.title}`];
      if (elementLines.length > 0) {
        parts.push('', 'Interactive elements:', ...elementLines);
      }
      parts.push('', 'Page text:', observation.text);
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }
    if (raw === 'screenshot') {
      if (takeovers.has(slug)) {
        throw new Error(
          'Browser Pause is active for this PersonaBot; ask the Human to Resume in the Browser entry, then call browser_observe before acting',
        );
      }
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let shot;
      try {
        shot = await runtime.captureScreenshot(tabId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isDeadTarget(message)) throw error;
        dropCurrent(state);
        throw new Error(
          `The Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
          { cause: error },
        );
      }
      assertControlCurrent();
      if (shot === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: '[image unavailable: the Bot Browser returned no frame; the tab may be in the background or minimized]',
            },
          ],
        };
      }
      signal.throwIfAborted();
      const saved =
        options.screenshotDir === undefined
          ? undefined
          : await saveScreenshot(
              options.screenshotDir,
              options.screenshotLimit ?? 100,
              shot.data,
            ).catch(() => undefined);
      signal.throwIfAborted();
      assertControlCurrent();
      return {
        content: [
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
          {
            type: 'text',
            text:
              (saved === undefined ? 'Screenshot captured.' : `Screenshot saved to ${saved}`) +
              (shot.viewport === undefined
                ? ''
                : shot.image !== undefined && shot.image.width !== shot.viewport.width
                  ? ` (image ${shot.image.width}x${shot.image.height} vs viewport ${shot.viewport.width}x${shot.viewport.height}; divide image coordinates by ${(shot.image.width / shot.viewport.width).toFixed(2)} before browser_click x/y)`
                  : ` (viewport ${shot.viewport.width}x${shot.viewport.height}; image coordinates map 1:1 to browser_click x/y)`),
          },
        ],
      };
    }
    if (raw === 'click' || raw === 'type' || raw === 'press_key' || raw === 'scroll') {
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let page;
      try {
        if (raw === 'click') {
          const ref =
            typeof args['ref'] === 'string' && args['ref'] !== '' ? args['ref'] : undefined;
          const x = typeof args['x'] === 'number' ? args['x'] : undefined;
          const y = typeof args['y'] === 'number' ? args['y'] : undefined;
          if (ref !== undefined) page = await runtime.click(tabId, ref);
          else if (x !== undefined && y !== undefined) page = await runtime.clickAt(tabId, x, y);
          else {
            throw new Error(
              'browser_click needs a ref from browser_observe or x/y coordinates from browser_screenshot',
            );
          }
        } else if (raw === 'type') {
          page = await runtime.type(
            tabId,
            requiredString(args, 'ref', 'browser_type needs a ref from browser_observe'),
            requiredString(args, 'text', 'browser_type needs text to enter'),
          );
        } else if (raw === 'press_key') {
          page = await runtime.pressKey(
            tabId,
            requiredString(args, 'key', 'browser_press_key needs a key'),
          );
        } else {
          page = await runtime.scroll(
            tabId,
            args['direction'] === 'up' ? 'up' : 'down',
            boundedNumber(args['amount'], 100, 2000, 600),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isDeadTarget(message)) dropCurrent(state);
        throw error;
      }
      return { content: [{ type: 'text', text: `${raw} done — ${page.url}` }] };
    }
    if (raw === 'upload') {
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      const path = requiredString(args, 'path', 'browser_upload needs an absolute file path');
      const ref = typeof args['ref'] === 'string' && args['ref'] !== '' ? args['ref'] : undefined;
      try {
        await runtime.uploadFile(tabId, { ...(ref === undefined ? {} : { ref }), path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isDeadTarget(message)) dropCurrent(state);
        throw error;
      }
      return {
        content: [{ type: 'text', text: `Uploaded ${basename(path)} to the page.` }],
      };
    }
    if (raw === 'tabs') {
      const action = requiredString(args, 'action', 'browser_tabs needs an action');
      const state = botTabs(slug);
      if (action === 'list') {
        const live = await runtime.listTabs();
        const lines = live
          .filter((tab) => state.owned.has(tab.targetId))
          .map(
            (tab) =>
              `${tab.targetId === state.current ? '* ' : '  '}${tab.targetId} ${tab.url}${
                tab.title === '' ? '' : ` — ${tab.title}`
              }`,
          );
        if (lines.length === 0) {
          throw new Error(
            'This PersonaBot has no Bot Browser tabs; call browser_open or browser_tabs action open',
          );
        }
        return {
          content: [
            { type: 'text', text: `Bot Browser tabs (current marked *):\n${lines.join('\n')}` },
          ],
        };
      }
      if (action === 'open') {
        const url = requiredString(args, 'url', 'browser_tabs action open needs an absolute URL');
        if (!/^https?:\/\//u.test(url)) {
          throw new Error(
            'browser_tabs action open needs an absolute http(s) URL, for example https://example.com',
          );
        }
        const tab = await runtime.createTab(url);
        state.owned.add(tab.tabId);
        state.current = tab.tabId;
        state.lastActivity = Date.now();
        return {
          content: [
            {
              type: 'text',
              text: `Opened ${tab.url}${tab.title === '' ? '' : ` — ${tab.title}`} in a new tab (${tab.tabId})`,
            },
          ],
        };
      }
      if (action === 'select' || action === 'close') {
        const targetId = requiredString(
          args,
          'targetId',
          `browser_tabs action ${action} needs a targetId from action list`,
        );
        if (!state.owned.has(targetId)) {
          throw new Error(
            'That tab is not owned by this PersonaBot; call browser_tabs action list to see its tabs',
          );
        }
        if (action === 'select') {
          let info;
          try {
            info = await runtime.tabInfo(targetId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!isDeadTarget(message)) throw error;
            state.owned.delete(targetId);
            if (state.current === targetId) state.current = undefined;
            throw new Error(
              `The requested Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
              { cause: error },
            );
          }
          state.current = targetId;
          state.lastActivity = Date.now();
          return {
            content: [
              {
                type: 'text',
                text: `Selected ${targetId}${info.title === '' ? '' : ` — ${info.title}`}`,
              },
            ],
          };
        }
        await runtime.closeTab(targetId);
        state.owned.delete(targetId);
        if (state.current === targetId) state.current = undefined;
        return { content: [{ type: 'text', text: `Closed tab ${targetId}` }] };
      }
      throw new Error(`Unknown browser_tabs action: ${action}`);
    }
    if (raw === 'wait') {
      const ms = boundedNumber(args['ms'], 0, 10_000, 1000);
      await wait(ms, undefined, { signal });
      return { content: [{ type: 'text', text: `waited ${ms}ms` }] };
    }
    throw new Error(`Unknown Bot Browser operation: ${raw}`);
  };

  return executeTool;
}
