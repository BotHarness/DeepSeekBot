import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { dmChannelId } from '../src/channels/channel.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { authorizeTobHostCli } from '../src/tob/cli-host-commands.js';
import { createTempRoot } from './helpers.js';

it(
  'keeps one Steward and moves both broker admission and self-escalation protection on every transfer',
  { timeout: 90_000 },
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 8 }),
        async (transfers) => {
          const observed: Array<{ slug: string; admitted: boolean }> = [];
          let core: BotHarnessCore;
          core = createCore({
            dshHome: createTempRoot('steward-property-'),
            agents: {
              async runOrchestrator(run) {
                let admitted = false;
                try {
                  core.runtime.captureTobCliAuthority!(run.sessionId)();
                  admitted = true;
                } catch (error) {
                  expect(error).toMatchObject({ code: 'tob-authority-required' });
                }
                expect(run.stewardActive?.() === true).toBe(admitted);
                observed.push({ slug: run.bot.slug, admitted });
              },
              async runAssignment() {},
              requestAssignment() {
                throw new Error('unexpected Assignment');
              },
              async close() {},
            },
          });
          try {
            const home = await core.tob.ensure();
            const bridge = createBridgeMethods(owner, core);
            const choices = [home.botSlug, 'ada', 'bea'];
            for (const slug of choices.slice(1)) {
              expect(core.registry.create({ slug, displayName: slug })).toMatchObject({ ok: true });
              core.channels.getOrCreateDm(owner, slug, slug);
            }
            for (const index of transfers) {
              const current = choices[index]!;
              expect(await bridge.stewardTransfer({ slug: current, confirm: true })).toEqual({
                ok: true,
                value: { botSlug: current },
              });
              expect(
                core.registry
                  .list()
                  .filter((bot) => core.tob.isSteward(bot.slug))
                  .map((bot) => bot.slug),
              ).toEqual([current]);
              expect(await bridge.steward({})).toEqual({ ok: true, value: { botSlug: current } });
              observed.length = 0;
              for (const slug of choices) {
                const channelId = dmChannelId(slug);
                for (const target of [slug, channelId]) {
                  const command = () =>
                    authorizeTobHostCli(['approval-template-set', target, 'full-access'], {
                      registry: core.registry,
                      channels: core.channels,
                      human: owner,
                      isSteward: core.tob.isSteward,
                    });
                  if (slug === current)
                    expect(command).toThrow(
                      expect.objectContaining({ commandCode: 'self-escalation-refused' }),
                    );
                  else expect(command).not.toThrow();
                }
                const sent = await bridge.channelSend({
                  channelId,
                  messageId: 'human-' + randomUUID(),
                  body: 'Read settings',
                });
                expect(sent.ok).toBe(true);
              }
              await core.runtime.whenIdle();
              expect(observed.sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(
                choices
                  .map((slug) => ({ slug, admitted: slug === current }))
                  .sort((a, b) => a.slug.localeCompare(b.slug)),
              );
            }
          } finally {
            core.schedules.close();
            core.externalMessaging.close();
            await core.runtime.close();
            await core.tob.close();
            core.operationalDatabase.close();
          }
        },
      ),
      { numRuns: 12 },
    );
  },
);
