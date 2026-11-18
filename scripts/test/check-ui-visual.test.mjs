import { describe, expect, it } from 'vitest';
import { axeProblems, geometryProblems, overflowProblems } from '../check-ui-visual.mjs';

const aligned = {
  id: 'a-light-en',
  rowHeight: 28,
  iconSlot: 20,
  heading: { labelX: 40 },
  items: [
    { label: 'General', labelX: 40, slotWidth: 20, height: 28 },
    { label: 'Appearance', labelX: 40.3, slotWidth: 20, height: 28 },
  ],
};

describe('check-ui-visual', () => {
  it('passes rows on one label column at the token height', () => {
    expect(geometryProblems([aligned])).toEqual([]);
  });

  it('names a 2px heading drift, an off-column label, a short row and a narrow slot', () => {
    expect(
      geometryProblems([
        {
          ...aligned,
          heading: { labelX: 42 },
          items: [aligned.items[0], { label: 'Appearance', labelX: 44, slotWidth: 16, height: 25 }],
        },
      ]),
    ).toEqual([
      'a-light-en: nav label "Appearance" starts at x=44, not on the label column x=40',
      'a-light-en: nav row "Appearance" is 25px tall; the row token is 28px',
      'a-light-en: icon slot of "Appearance" is 16px wide; the slot token is 20px',
      'a-light-en: group heading starts at x=42, not on the label column x=40',
    ]);
  });

  it('reports horizontal page scroll and clipped text', () => {
    expect(
      overflowProblems('compact', {
        pageScroll: 12,
        clipped: [{ id: 'b-dark-zh', text: '减少动态效果', scroll: 96, client: 80 }],
      }),
    ).toEqual([
      'compact: the page scrolls 12px horizontally',
      'compact: b-dark-zh clips "减少动态效果" (96px in 80px)',
    ]);
  });

  it('lists each axe violation node', () => {
    expect(
      axeProblems('axe', [
        {
          id: 'color-contrast',
          impact: 'serious',
          help: 'Elements must meet minimum color contrast ratio thresholds',
          nodes: [{ target: ['#a'] }, { target: ['#b'] }],
        },
      ]),
    ).toEqual([
      'axe: color-contrast (serious) at #a: Elements must meet minimum color contrast ratio thresholds',
      'axe: color-contrast (serious) at #b: Elements must meet minimum color contrast ratio thresholds',
    ]);
  });
});
