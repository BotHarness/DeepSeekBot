import type { Agent } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { approveTobCliOperation } from '../src/tob/cli-approval.js';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import {
  createTobModelOperations,
  type TobNativeSettings,
} from '../src/tob/cli-model-operations.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Tob CLI approval while receiving Bot DMs', () => {
  it.each([
    { path: 'typed', arrival: 'before the card opens' },
    { path: 'typed', arrival: 'after the decision commits' },
    { path: 'legacy', arrival: 'after the decision commits' },
  ])(
    'runs the approved $path write once when a Bot DM arrives $arrival',
    async ({ path, arrival }) => {
      const turn = deferred<TobCliBroker>();
      const steered = vi.fn(() => true);
      const peerSent = deferred<void>();
      const finishTurn = deferred<void>();
      const approvalDispatch = deferred<void>();
      const openCard = deferred<void>();
      const decisionCommitted = deferred<void>();
      const returnDecision = deferred<void>();
      const controller = new AbortController();
      let current = { assignmentConcurrencyLimit: 8 };
      let revision = 0;
      let tobSlug: string;
      const settings: TobNativeSettings = {
        describe: () => [{ ns: 'botharness-client', value: current, revision }],
        async update(_namespace, patch, expectedRevision) {
          expect(expectedRevision).toBe(revision);
          if (
            typeof patch !== 'object' ||
            patch === null ||
            !('assignmentConcurrencyLimit' in patch) ||
            typeof patch.assignmentConcurrencyLimit !== 'number'
          )
            throw new Error('Unexpected setting patch');
          current = { assignmentConcurrencyLimit: patch.assignmentConcurrencyLimit };
          revision++;
        },
        async replace() {
          throw new Error('Unexpected settings replacement');
        },
      };
      const core = createCore({
        dshHome: createTempRoot('tob-cli-inbox-'),
        tobSettings: () => settings,
        agents: {
          async runOrchestrator(run) {
            if (run.bot.slug === 'colleague') {
              try {
                await run.channels.sendToBot({
                  botSlug: tobSlug,
                  body: 'The status check finished',
                  deliveryKey: 'colleague-status',
                });
                peerSent.resolve();
              } catch (error) {
                peerSent.reject(error);
              }
              return;
            }
            try {
              const authorize = core.runtime.captureTobCliAuthority!(run.sessionId);
              const actor = {
                session: {
                  id: run.sessionId,
                  header: { cwd: '/test/tob' },
                  snapshotEvents: () => [],
                },
              } as unknown as Agent;
              const execution = {
                agent: actor,
                name: 'shell',
                callId: ToolCallId('management-shell'),
                token: Symbol('management-shell'),
                arguments: { command: 'deepseekbot settings-set botharness-client --patch-stdin' },
                signal: controller.signal,
              } as ToolExecution;
              const broker = await startTobCliBroker({
                signal: controller.signal,
                authorize,
                beginWrite: authorize.beginWrite,
                ...(path === 'typed' && {
                  prepareOperation: createTobModelOperations({
                    registry: core.registry,
                    presets: core.modelPresets,
                    catalog: { list: async () => [], validate: async () => {} },
                    settings: () => settings,
                  }),
                }),
                readSetting: core.tob.readSetting,
                writeSetting: core.tob.writeSetting,
                approve: (operation, signal, scope) =>
                  approveTobCliOperation({
                    execution,
                    operation,
                    signal,
                    ...scope,
                    approval,
                    channelApproval,
                    fullAccess: () => false,
                  }),
              });
              turn.resolve(broker);
              try {
                await finishTurn.promise;
              } finally {
                await broker.close();
              }
            } catch (error) {
              turn.reject(error);
            }
          },
          steerOrchestrator: steered,
          async runAssignment() {},
          requestAssignment() {
            throw new Error('Unexpected Assignment');
          },
          async close() {},
        },
      });
      const channelApproval = new ChannelToolApproval(
        core.channels,
        core.ownership,
        undefined,
        undefined,
        undefined,
        undefined,
        (query) => core.runtime.toolApprovalOrigin?.(query),
        undefined,
        undefined,
        core.team.approvals,
      );
      const approval = {
        async request(input: Parameters<ApprovalService['request']>[0]) {
          approvalDispatch.resolve();
          if (arrival === 'before the card opens') await openCard.promise;
          const outcome = (await channelApproval.ask(input)) ?? 'unavailable';
          if (outcome === 'allowed-once') {
            decisionCommitted.resolve();
            await returnDecision.promise;
          }
          return outcome;
        },
      } as ApprovalService;
      try {
        const home = await core.tob.ensure();
        tobSlug = home.botSlug;
        const human = OWNER_HUMAN_CONTEXT;
        const bridge = createBridgeMethods(human, { ...core });
        expect(core.registry.create({ slug: 'colleague', displayName: 'Colleague' }).ok).toBe(true);
        const peerDm = core.channels.getOrCreateDm(human, 'colleague', 'Colleague')!;
        const send = (channelId: string, body: string) =>
          bridge.channelSend({ channelId, body, messageId: 'human-' + crypto.randomUUID() });
        expect(await send(home.channelId, 'Set the limit to 3')).toMatchObject({ ok: true });
        const broker = await turn.promise;
        const invoke = (command: string, args: object) =>
          fetch(broker.endpoint + '/invoke', {
            method: 'POST',
            headers: {
              authorization: 'Bearer ' + broker.token,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ command, args }),
          }).then((response) => response.json());
        const args = {
          ns: 'botharness-client',
          previousValue: { assignmentConcurrencyLimit: 8 },
          patch: { assignmentConcurrencyLimit: 3 },
          expectedRevision: 0,
        };
        const sendBotDm = async () => {
          expect(await send(peerDm.id, 'Send your status to Tob')).toMatchObject({ ok: true });
          await peerSent.promise;
          expect(steered).toHaveBeenCalledOnce();
        };
        const pending = invoke('settings-set', args);
        if (arrival === 'before the card opens') {
          await approvalDispatch.promise;
          await sendBotDm();
          openCard.resolve();
        }
        const card = await vi.waitFor(() => {
          const request = channelApproval.requests(tobSlug)[0];
          expect(request).toBeDefined();
          return request!;
        });
        expect(await channelApproval.decide(human, tobSlug, card.messageId, 'allowed-once')).toBe(
          true,
        );
        await decisionCommitted.promise;
        if (arrival === 'after the decision commits') await sendBotDm();
        returnDecision.resolve();
        expect(await pending).toMatchObject({
          ok: true,
          value: {
            scope: 'global',
            ns: 'botharness-client',
            value: { assignmentConcurrencyLimit: 3 },
            revision: 1,
          },
        });
        expect(await invoke('settings-set', args)).toMatchObject({
          error: { code: 'human-dm-required' },
        });
        expect(core.tob.readSetting()).toEqual({ scope: 'global', value: 3, revision: 1 });
      } finally {
        openCard.resolve();
        returnDecision.resolve();
        finishTurn.resolve();
        controller.abort();
        channelApproval.close();
        await core.runtime.whenIdle();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});
