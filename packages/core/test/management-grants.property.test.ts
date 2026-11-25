import { randomUUID } from 'node:crypto';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { dmChannelId } from '../src/channels/channel.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { authorizeTobHostCli } from '../src/tob/cli-host-commands.js';
import { createTempRoot } from './helpers.js';

const capabilities = ['manage-app', 'manage-bots'] as const;

it(
  'admits the broker exactly for grant holders and refuses authority changes that name any holder',
  { timeout: 120_000 },
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            bot: fc.integer({ min: 0, max: 2 }),
            capability: fc.constantFrom(...capabilities),
            enabled: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (changes) => {
          const observed: Array<{ slug: string; admitted: boolean }> = [];
          let core: BotHarnessCore;
          core = createCore({
            dshHome: createTempRoot('management-grant-property-'),
            agents: {
              async runOrchestrator(run) {
                let admitted = false;
                try {
                  core.runtime.captureTobCliAuthority!(run.sessionId)();
                  admitted = true;
                } catch (error) {
                  expect(error).toMatchObject({ code: 'tob-authority-required' });
                }
                expect(run.holdsManagementGrant?.() === true).toBe(admitted);
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
            const model = new Map<string, Set<string>>([
              [home.botSlug, new Set(capabilities)],
              ['ada', new Set()],
              ['bea', new Set()],
            ]);
            for (const change of changes) {
              const slug = choices[change.bot]!;
              expect(
                bridge.managementGrantSet({
                  slug,
                  capability: change.capability,
                  enabled: change.enabled,
                  confirm: true,
                }),
              ).toMatchObject({ ok: true });
              if (change.enabled) model.get(slug)!.add(change.capability);
              else model.get(slug)!.delete(change.capability);
              const holds = (bot: string) => model.get(bot)!.size > 0;
              observed.length = 0;
              for (const bot of choices) {
                for (const target of [bot, dmChannelId(bot)]) {
                  const command = () =>
                    authorizeTobHostCli(['approval-template-set', target, 'full-access'], {
                      registry: core.registry,
                      channels: core.channels,
                      human: owner,
                      holdsManagementGrant: (value) => core.tob.holdsManagementGrant(value),
                    });
                  if (holds(bot))
                    expect(command).toThrow(
                      expect.objectContaining({ commandCode: 'self-escalation-refused' }),
                    );
                  else expect(command).not.toThrow();
                }
                expect(
                  (
                    await bridge.channelSend({
                      channelId: dmChannelId(bot),
                      messageId: 'human-' + randomUUID(),
                      body: 'Read settings',
                    })
                  ).ok,
                ).toBe(true);
              }
              await core.runtime.whenIdle();
              expect(observed.sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(
                choices
                  .map((bot) => ({ slug: bot, admitted: holds(bot) }))
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
