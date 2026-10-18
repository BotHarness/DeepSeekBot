import { describe, expect, it } from 'vitest';

import {
  bridgeMethodsFrom,
  botToolNamesFrom,
  checkCliParity,
  routePathsFrom,
} from '../check-cli-parity.mjs';

const cli = `
  if (command === 'access') return rpc('assignmentAccessGet', { slug });
  const json = await http('/api/browser/open', { slug });
  { command: 'browser-tool', description: 'run one Browser tool' },
`;

describe('CLI parity check', () => {
  it('passes when every surface is covered by the CLI or recorded in the baseline', () => {
    expect(
      checkCliParity({
        surfaces: {
          bridge: ['assignmentAccessGet', 'pinsSet'],
          routes: ['/api/browser/open'],
          tools: ['browser_open', 'channel_send'],
        },
        cliSource: cli,
        baseline: {
          bridge: { pinsSet: '#1690' },
          routes: {},
          tools: { channel_send: '#1690' },
        },
      }),
    ).toEqual([]);
  });

  it('reports a new surface that has neither a command nor a baseline entry', () => {
    const errors = checkCliParity({
      surfaces: { bridge: ['brandNewMethod'], routes: ['/api/thing'], tools: ['new_tool'] },
      cliSource: cli,
      baseline: { bridge: {}, routes: {}, tools: {} },
    });
    expect(errors).toEqual([
      'bridge method brandNewMethod has no deepseekbot command; add one, or record an exemption with a reason in scripts/cli-parity-baseline.json',
      'Host route /api/thing has no deepseekbot command; add one, or record an exemption with a reason in scripts/cli-parity-baseline.json',
      'Bot tool new_tool has no deepseekbot command; add one, or record an exemption with a reason in scripts/cli-parity-baseline.json',
    ]);
  });

  it('reports baseline entries that are already covered, no longer exist, or carry no reason', () => {
    const errors = checkCliParity({
      surfaces: { bridge: ['assignmentAccessGet', 'pinsSet'], routes: [], tools: [] },
      cliSource: cli,
      baseline: {
        bridge: { assignmentAccessGet: '#1690', removedMethod: '#1690', pinsSet: '' },
        routes: {},
        tools: {},
      },
    });
    expect(errors).toEqual([
      'bridge method assignmentAccessGet is covered by the CLI now; remove it from scripts/cli-parity-baseline.json',
      'bridge method pinsSet needs an issue reference or exemption reason in scripts/cli-parity-baseline.json',
      'bridge method removedMethod no longer exists; remove it from scripts/cli-parity-baseline.json',
    ]);
  });

  it('counts Harness Bot tools as covered by bot-tool and keeps reasoned exemptions for refused ones', () => {
    const runner = `${cli}\n  { command: 'bot-tool', description: 'run one Harness Bot tool' },\n`;
    expect(
      checkCliParity({
        surfaces: { bridge: [], routes: [], tools: ['channel_send', 'create_assignment'] },
        cliSource: runner,
        baseline: {
          bridge: {},
          routes: {},
          tools: { create_assignment: 'Starts work owned by the calling Bot turn.' },
        },
      }),
    ).toEqual([]);
    expect(
      checkCliParity({
        surfaces: { bridge: [], routes: [], tools: ['channel_send'] },
        cliSource: runner,
        baseline: { bridge: {}, routes: {}, tools: { channel_send: '#1690' } },
      }),
    ).toEqual([
      'Bot tool channel_send is covered by the CLI now; remove it from scripts/cli-parity-baseline.json',
    ]);
  });

  it('extracts the surfaces from the Host sources', () => {
    expect(
      bridgeMethodsFrom(`const BRIDGE_METHODS = [\n  'sessions',\n  'botToolTrace',\n] as const;`),
    ).toEqual(['sessions', 'botToolTrace']);
    expect(
      routePathsFrom(["path: '/api/browser/open',", "      path: '/api/computer/status',"]),
    ).toEqual(['/api/browser/open', '/api/computer/status']);
    expect(
      botToolNamesFrom(`const BOT_TOOL_NAMES = new Set([\n  'channel_send',\n  'inbox_list',\n]);`),
    ).toEqual(['channel_send', 'inbox_list']);
  });
});

it('requires the dedicated cloud-work runner rather than accepting the generic bot-tool catalog', () => {
  const surfaces = { bridge: [], routes: [], tools: ['cloud_work'] };
  const baseline = { bridge: {}, routes: {}, tools: {} };
  expect(checkCliParity({ surfaces, baseline, cliSource: "{ command: 'bot-tool' }" })).toHaveLength(
    1,
  );
  expect(checkCliParity({ surfaces, baseline, cliSource: "{ command: 'cloud-work' }" })).toEqual(
    [],
  );
});
