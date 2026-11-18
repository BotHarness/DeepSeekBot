import { describe, expect, it } from 'vitest';

import { listBots, loadBotDetail } from '@botharness/host-client/bots';
import type { HostClient } from '@botharness/host-client/client';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { describeHostSettings } from '@botharness/host-client/host-settings';
import {
  loadMemoryGitGraph,
  loadMemorySnapshot,
  saveMemoryFile,
} from '@botharness/host-client/memory';
import {
  customizeModelPlan,
  loadModelCatalog,
  loadModelPlanState,
  loadModelPresets,
} from '@botharness/host-client/model-plans';
import { loadSchedules, previewSchedule, runScheduleNow } from '@botharness/host-client/schedules';
import { loadMemoryActivity } from '@botharness/host-client/usage';
import { bridgeHost, type BridgeCall } from '../src/client/bridge.js';

type Host = Pick<HostClient, 'call'>;

const localHost = (value: unknown): Host => {
  const call: BridgeCall = async () => ({ ok: true, value });
  return bridgeHost(call);
};

const remoteHost = (value: unknown): Host => ({
  call: async <T>() => value as T,
});

async function same<T>(read: (host: Host) => Promise<T>, value: unknown): Promise<T> {
  const local = await read(localHost(value));
  expect(await read(remoteHost(value))).toEqual(local);
  return local;
}

async function bothRefuse(read: (host: Host) => Promise<unknown>, value: unknown): Promise<void> {
  await expect(read(localHost(value))).rejects.toBeInstanceOf(HostAnswerInvalid);
  await expect(read(remoteHost(value))).rejects.toBeInstanceOf(HostAnswerInvalid);
}

const route = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
const plan = {
  revision: 3,
  sourcePresetId: 'p1',
  sourcePresetName: 'Fast',
  orchestrator: { ...route, reasoningEffort: 'high' },
  assignmentDefault: route,
  assignmentModels: [
    { ...route, allowedEfforts: ['high', 7], defaultEffort: 'high' },
    { provider: 'x', allowedEfforts: [], defaultEffort: '' },
  ],
  appliedAt: '2026-11-18T00:00:00.000Z',
};

const schedule = {
  id: 's1',
  botSlug: 'tob',
  title: 'Morning',
  prompt: 'Say hi',
  trigger: {
    kind: 'weekly',
    time: '09:00',
    timeZone: 'Asia/Tokyo',
    weekdays: [1, 3],
  },
  enabled: true,
  creator: 'human',
  locked: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

const firing = {
  id: 'f1',
  scheduleId: 's1',
  trigger: 'manual',
  occurrenceAt: '2026-11-18T00:00:00.000Z',
  firedAt: '2026-11-18T00:00:01.000Z',
  state: 'pending',
};

describe('model readers', () => {
  it('give the desktop Host and a phone or remote Host the same model answers', async () => {
    const catalog = await same(loadModelCatalog, {
      models: [
        {
          ...route,
          providerName: 'OpenCode Go',
          modelName: 'DeepSeek V4.1 Flash',
        },
      ],
      default: route,
    });
    expect(catalog.default).toEqual(route);
    const state = await same((host) => loadModelPlanState(host, 'tob'), {
      revision: 3,
      plan,
      repair: { code: 'route-unavailable', message: 'gone' },
    });
    expect(state.plan?.assignmentModels).toEqual([
      { ...route, allowedEfforts: ['high'], defaultEffort: 'high' },
    ]);
    expect(state.repair).toEqual({
      code: 'route-unavailable',
      message: 'gone',
    });
    const presets = await same(loadModelPresets, {
      presets: [
        {
          id: 'p1',
          name: 'Fast',
          revision: 1,
          orchestrator: route,
          assignmentDefault: route,
        },
        { id: 'p2', name: 'Broken', orchestrator: route },
      ],
    });
    expect(presets.map((preset) => preset.id)).toEqual(['p1']);
  });

  it('refuse a malformed model answer the same way on both', async () => {
    await bothRefuse(loadModelCatalog, { default: route });
    await bothRefuse(loadModelPresets, {});
    await bothRefuse((host) => loadModelPlanState(host, 'tob'), {
      plan: { revision: 1 },
    });
    await bothRefuse((host) => customizeModelPlan(host, 'tob', { orchestrator: route }, 3), {
      plan: { orchestrator: route },
    });
  });
});

describe('memory readers', () => {
  it('give both Hosts the same snapshot and history', async () => {
    const snapshot = await same((host) => loadMemorySnapshot(host, 'c1'), {
      snapshot: {
        head: 'abc',
        files: ['SOUL.md'],
        provisional: false,
        standing: [{ path: 'SOUL.md', role: 'soul', chars: 4, limit: 10 }, { path: 1 }],
      },
    });
    expect(snapshot.standing).toHaveLength(1);
    await same((host) => loadMemoryGitGraph(host, 'c1', 0), {
      head: 'abc',
      currentBranch: null,
      branches: [],
      dirty: false,
      hasMore: false,
      commits: [
        {
          sha: 'abc',
          parents: [],
          subject: 'init',
          authoredAt: '2026-11-18T00:00:00.000Z',
          branches: [],
          status: 'accepted',
        },
      ],
    });
  });

  it('refuse a malformed Memory answer the same way on both', async () => {
    await bothRefuse((host) => loadMemorySnapshot(host, 'c1'), {
      snapshot: { files: [] },
    });
    await bothRefuse(
      (host) =>
        saveMemoryFile(host, {
          channelId: 'c1',
          path: 'SOUL.md',
          body: '',
          expectedHead: 'abc',
          editId: 'e1',
        }),
      { commit: { sha: 'def' } },
    );
  });
});

describe('routine readers', () => {
  it('give both Hosts the same routines and runs', async () => {
    const [routine] = await same((host) => loadSchedules(host, 'tob'), {
      schedules: [{ ...schedule, lastFiring: firing }],
    });
    expect(routine?.lastFiring).toEqual(firing);
    await same((host) => runScheduleNow(host, 'tob', 's1'), { firing });
    await same((host) => previewSchedule(host, { kind: 'every', everySeconds: 3600 }), {
      occurrences: ['2026-11-18T01:00:00.000Z'],
    });
  });

  it('refuse a malformed routine the same way on both', async () => {
    await bothRefuse((host) => loadSchedules(host, 'tob'), {
      schedules: [{ ...schedule, trigger: { kind: 'daily', time: '09:00' } }],
    });
    await bothRefuse((host) => runScheduleNow(host, 'tob', 's1'), {
      firing: { id: 'f1' },
    });
  });
});

describe('overview, settings and Bot readers', () => {
  it('give both Hosts the same answers', async () => {
    const bots = await same(listBots, { bots: [{ slug: 'tob', displayName: 'Tob' }] });
    expect(bots.map((bot) => bot.slug)).toEqual(['tob']);
    await same((host) => loadBotDetail(host, 'tob'), {
      bot: { slug: 'tob', memoryDir: '/m' },
      profileFingerprint: 'fp',
    });
    const namespaces = await same(describeHostSettings, {
      namespaces: [{ ns: 'botharness-client', revision: 2, value: { sortMode: 'manual' } }],
    });
    expect(namespaces).toEqual([
      { ns: 'botharness-client', revision: 2, value: { sortMode: 'manual' } },
    ]);
  });

  it('refuse a malformed answer the same way on both', async () => {
    await bothRefuse(listBots, { bots: null });
    await bothRefuse(listBots, { bots: [{ slug: 'tob', displayName: 'Tob' }, { slug: 'x' }] });
    await bothRefuse((host) => loadBotDetail(host, 'tob'), {
      bot: { slug: 'tob' },
    });
    await bothRefuse(describeHostSettings, {});
    await bothRefuse(loadMemoryActivity, { start: '2026-11-12', days: [] });
  });
});
