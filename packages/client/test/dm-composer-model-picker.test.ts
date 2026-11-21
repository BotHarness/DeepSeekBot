// @vitest-environment jsdom
import { translate } from './model-preset-profile-fixtures.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import type { ModelPlanView } from '../src/client/bridge.js';
import { useDmComposerContext } from '../src/client/dm-composer-context.js';
import { createStore, type BotSummary } from '../src/client/store.js';

it.each(['codex-default', 'codex-12345678-1234-4321-8234-123456789abc'])(
  'switches the header model with %s in use',
  async (accountId) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const route = { provider: 'deepseek', model: 'flash' };
    const otherAccount =
      accountId === 'codex-default'
        ? 'codex-12345678-1234-4321-8234-123456789abc'
        : 'codex-default';
    const model = { id: 'gpt-6.2-sol', name: 'GPT 6.2 Sol', efforts: [] };
    const engineWrites = vi.fn();
    const engineReads = vi.fn();
    const engineStatus = vi.fn();
    const customize = vi.fn();
    let plan: ModelPlanView | undefined;
    let selection: Record<string, unknown> | undefined = {
      engine: 'codex',
      accountId,
      model: model.id,
      fallback: true,
    };
    const bot: BotSummary = {
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      slug: `composer-${accountId}`,
      orchestratorRunner: {
        engine: 'codex',
        displayName: 'Codex',
        account: 'Work',
        model: 'gpt-6.2-sol',
      },
    };
    const actions = createActions(async (method, payload) => {
      if (method === 'modelPlan') return { ok: true, value: { plan } };
      if (method === 'modelCatalog')
        return {
          ok: true,
          value: {
            default: route,
            models: [{ ...route, modelName: 'Flash', providerName: 'DeepSeek', efforts: [] }],
          },
        };
      if (method === 'engineSelection') {
        const request = payload.request;
        if (typeof request !== 'object' || request === null || !('action' in request))
          throw new Error('Missing engine action');
        if (request.action === 'status') {
          engineStatus();
          return {
            ok: true,
            value: {
              engines: [accountId, otherAccount].map((id) => ({
                engine: 'codex',
                accountId: id,
                accountName: id === accountId ? 'Work' : 'Personal',
                installed: true,
                available: true,
              })),
              selections:
                selection === undefined
                  ? []
                  : [{ ...selection, botSlug: bot.slug, role: 'orchestrator' }],
            },
          };
        }
        if (request.action === 'models') {
          engineReads(request);
          return { ok: true, value: { models: [model] } };
        }
        if (request.action === 'use' && 'engine' in request) {
          engineWrites(request);
          selection = request.engine === null ? undefined : { ...request };
          return { ok: true, value: {} };
        }
      }
      if (method === 'modelPlanCustomize') {
        customize(payload);
        plan = {
          revision: 1,
          orchestrator: route,
          sourcePresetId: '',
          sourcePresetName: '',
          appliedAt: '',
        };
        return { ok: true, value: { plan } };
      }
      if (method === 'modelPresets') return { ok: true, value: { presets: [] } };
      if (method === 'botContext') return { ok: true, value: {} };
      if (method === 'telemetryEvent') return { ok: true, value: {} };
      if (method === 'grants') return { ok: true, value: { grants: [] } };
      throw new Error(`Unexpected method ${method}`);
    }, createStore());
    function Harness({ bot }: { bot: BotSummary }) {
      return useDmComposerContext({
        bot,
        channelId: `dm-${bot.slug}`,
        actions,
        companion: undefined,
        activity: undefined,
        loading: false,
        t: translate,
        onUsage() {},
      })?.content;
    }
    try {
      await act(async () => root.render(createElement(Harness, { bot })));
      const chip = host.querySelector<HTMLButtonElement>('[data-composer-chip="model"]')!;
      expect(chip.title).toContain('gpt-6.2-sol');
      expect(engineStatus).not.toHaveBeenCalled();
      expect(engineReads).not.toHaveBeenCalled();
      await act(async () => chip.click());
      expect(document.querySelector('[data-filter-picker]')).not.toBeNull();
      expect(engineStatus).toHaveBeenCalledOnce();
      expect(engineReads.mock.calls.map(([request]) => request.engine)).toEqual([
        accountId,
        otherAccount,
      ]);
      await act(async () =>
        document.querySelector<HTMLButtonElement>('[data-picker-filter="engine:codex"]')!.click(),
      );
      const options = () => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
      expect(
        options()
          .find((option) => option.textContent?.includes('Work'))
          ?.getAttribute('aria-selected'),
      ).toBe('true');
      await act(async () =>
        options()
          .find((option) => option.textContent?.includes('Personal'))!
          .click(),
      );
      expect(engineWrites).toHaveBeenCalledExactlyOnceWith({
        action: 'use',
        bot: bot.slug,
        role: 'orchestrator',
        engine: 'codex',
        accountId: otherAccount,
        model: model.id,
        fallback: true,
      });
      expect(chip.title).toContain('Personal');
      expect(customize).not.toHaveBeenCalled();
      await act(async () => chip.click());
      expect(engineReads).toHaveBeenCalledTimes(2);
      await act(async () =>
        options()
          .find((option) => option.textContent?.includes('Flash'))!
          .click(),
      );
      expect(customize).toHaveBeenCalledExactlyOnceWith({
        slug: bot.slug,
        expectedRevision: 0,
        orchestrator: route,
      });
      expect(engineWrites).toHaveBeenLastCalledWith({
        action: 'use',
        bot: bot.slug,
        role: 'orchestrator',
        engine: null,
      });
      expect(chip.title).toBe('Flash');
      selection = { engine: 'codex', accountId: otherAccount, model: model.id };
      await act(async () =>
        root.render(
          createElement(Harness, {
            bot: {
              ...bot,
              orchestratorRunner: {
                engine: 'codex',
                displayName: 'Codex',
                model: model.id,
                account: 'Personal',
              },
            },
          }),
        ),
      );
      expect(chip.title).toContain('Personal');
      expect(engineReads).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
