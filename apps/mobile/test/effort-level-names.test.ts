import { describe, expect, it } from 'vitest';
import { engineEffortName } from '@botharness/host-protocol/subscription-engine';
import { en, zh } from '../src/features/models/strings';

const LEVELS = ['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

describe('reasoning effort level names', () => {
  it('names every shared level, including Off, without a catalog name', () => {
    expect(engineEffortName('off')).toBe('Off');
    expect(LEVELS.map((level) => en.routingGroup.engineRow.effort(level))).toEqual([
      'Off',
      'None',
      'Minimal',
      'Low',
      'Medium',
      'High',
      'Extra high',
      'Max',
    ]);
  });

  it('translates every shared level into Chinese, so the catalog name never shows', () => {
    expect(LEVELS.map((level) => zh.routingGroup.engineRow.effort(level))).toEqual([
      '关闭',
      '无',
      '极低',
      '低',
      '中',
      '高',
      '极高',
      '最高',
    ]);
    expect(engineEffortName('off', zh.routingGroup.engineRow.effort, 'Off')).toBe('关闭');
  });
});
