import { describe, expect, it } from 'vitest';

import { CASES, judgeAnswer, judgePicks, sweepConfigs } from '../call-keyframe-eval.mjs';
import { KEYFRAME_DEFAULTS } from '../../packages/core/src/voice/keyframes.ts';

const spec = (id) => CASES.find((entry) => entry.id === id);

describe('VC8 cases', () => {
  it('covers the six cases of #3499 with ground truth and a question each', () => {
    expect(CASES.map((entry) => entry.id)).toEqual([
      'reading',
      'scroll',
      'windows',
      'movie',
      'camera',
      'silence',
    ]);
    for (const entry of CASES) {
      const samples = entry.samples();
      expect(samples.length).toBeGreaterThan(0);
      expect(samples.length).toBeLessThanOrEqual(1_200);
      expect(entry.question.length).toBeGreaterThan(0);
      expect(entry.answer.groups.length).toBeGreaterThan(0);
      expect(samples.some((sample) => sample.segment !== null)).toBe(true);
    }
    expect(spec('silence').samples()).toHaveLength(600);
  });

  it('marks scrolling samples as moving and between screens', () => {
    const samples = spec('scroll').samples();
    const moving = samples.filter((sample) => sample.moving);
    expect(moving).toHaveLength(2 * (spec('scroll').screens - 1));
    expect(moving.every((sample) => sample.segment === null)).toBe(true);
  });
});

describe('judgePicks', () => {
  const samples = spec('scroll').samples();
  const firstOf = (segment) => samples.findIndex((sample) => sample.segment === segment);

  it('passes one settled keyframe per screen', () => {
    const picks = Array.from({ length: 6 }, (_, index) => firstOf(`screen-${index + 1}`) + 1);
    expect(judgePicks(spec('scroll'), samples, picks)).toMatchObject({
      pass: true,
      keyframes: 6,
      moving: 0,
    });
  });

  it('fails a blurred keyframe and a missed screen', () => {
    const blurred = samples.findIndex((sample) => sample.moving);
    const picks = [0, blurred, firstOf('screen-3'), firstOf('screen-4')];
    const judged = judgePicks(spec('scroll'), samples, picks);
    expect(judged.pass).toBe(false);
    expect(judged.moving).toBe(1);
    expect(judged.reasons).toContain('1 keyframes caught mid-motion');
    expect(judged.reasons.some((reason) => reason.startsWith('screen-2: 0'))).toBe(true);
  });
});

describe('judgeAnswer', () => {
  const answer = {
    ordered: true,
    groups: [
      ['MILK', '牛奶'],
      ['MOM', '妈'],
    ],
  };

  it('accepts any spelling of each item in order, ignoring case', () => {
    expect(judgeAnswer(answer, '先是 buy milk，然后是 Call Mom。').pass).toBe(true);
    expect(judgeAnswer(answer, '先写了买牛奶，后来写了给妈妈打电话').pass).toBe(true);
  });

  it('names what is missing or out of order', () => {
    expect(judgeAnswer(answer, 'Call mom.').reasons).toEqual(['missing MILK']);
    expect(judgeAnswer(answer, 'Call mom, then buy milk.').reasons).toEqual([
      'MOM came before MILK',
    ]);
  });
});

describe('sweepConfigs', () => {
  it('compares pixel difference with the perceptual hash on both sources', () => {
    const configs = sweepConfigs(KEYFRAME_DEFAULTS);
    const names = new Set(configs.map((config) => `${config.source}:${config.name}`));
    expect(names).toEqual(
      new Set([
        'screen:pixel',
        'screen:phash',
        'screen:phash+detail',
        'camera:pixel',
        'camera:phash',
      ]),
    );
    expect(
      configs
        .filter((config) => config.name !== 'phash+detail')
        .every((config) => config.options.detail === undefined),
    ).toBe(true);
  });
});
