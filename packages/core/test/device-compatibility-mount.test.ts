import { Context } from '@deepseek-ai/cordis';
import { expect, it } from 'vitest';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { mountDevicePairing } from '../src/devices/mount.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('reports the running module version even when web services arrive after a newer installation', async () => {
  const dshHome = createTempRoot('device-compatibility-mount-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ctx = new Context();
  const installation = { version: '2.0.0-beta.1' };
  const handlers = new Map<string, (request: Request) => Promise<Response>>();
  try {
    mountDevicePairing(ctx, { database, dshHome, runningVersion: installation.version });
    installation.version = '2.0.0-beta.2';
    ctx.provide('connection', {
      fetch: {
        register: (route: { path: string; fetch(request: Request): Promise<Response> }) => {
          handlers.set(route.path, route.fetch);
          return async () => {
            handlers.delete(route.path);
          };
        },
      },
      authenticatedUrl: (base: string) => base,
    } as never);
    ctx.provide('webServer', {
      port: 31999,
      register: () => () => {},
      registerUpgrade: () => () => {},
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const path = '/api/botharness/devices/compatibility';
    const response = await handlers.get(path)!(new Request(`http://localhost${path}`));
    expect(await response.json()).toMatchObject({ host: { version: '2.0.0-beta.1' } });
  } finally {
    await ctx.fiber.dispose();
  }
});
