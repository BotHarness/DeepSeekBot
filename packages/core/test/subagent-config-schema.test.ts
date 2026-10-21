import { expect, it } from 'vitest';
import { Config } from '../src/plugin.js';
import type { BotSubagentPresetConfig } from '../src/runtime/subagent-model-tools.js';

it('preserves absent native preset configuration without selecting a registry default', () => {
  expect(Config({ enabled: true }).subagent).toBeUndefined();
  expect(Config({ enabled: true, subagent: {} }).subagent).toEqual({});
  const omitted = { allowedAgentPresets: undefined } satisfies BotSubagentPresetConfig;
  const parsed = Config({ enabled: true, subagent: omitted }).subagent;
  expect(parsed?.agentPreset).toBeUndefined();
  expect(parsed?.allowedAgentPresets).toBeUndefined();
});

it('retains configured native preset and explicit allowlist without adding defaults', () => {
  expect(
    Config({
      enabled: true,
      subagent: { agentPreset: 'reviewer', allowedAgentPresets: ['reviewer', 'qa'] },
    }).subagent,
  ).toEqual({ agentPreset: 'reviewer', allowedAgentPresets: ['reviewer', 'qa'] });
  expect(Config({ enabled: true, subagent: { agentPreset: 'reviewer' } }).subagent).toEqual({
    agentPreset: 'reviewer',
  });
});

it('continues rejecting empty native preset configuration values', () => {
  expect(() => Config({ enabled: true, subagent: { agentPreset: '' } })).toThrow();
  expect(() => Config({ enabled: true, subagent: { allowedAgentPresets: [] } })).toThrow();
  expect(() => Config({ enabled: true, subagent: { allowedAgentPresets: [''] } })).toThrow();
});
