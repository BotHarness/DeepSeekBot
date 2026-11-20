import fc from 'fast-check';
import { expect, it } from 'vitest';

import { mobileAccents } from '@botharness/host-client/ui/design/palette.generated';
import { cardChoiceColors } from '../src/ui/design/controls';
import { contrast, resolveTheme } from '../src/ui/design/resolve-theme';

function expectQuestionContrast(theme: ReturnType<typeof resolveTheme>) {
  const { color, layer } = theme;
  for (const row of [layer.well.fill, layer.well.pressed]) {
    expect(contrast(color.muted, row)).toBeGreaterThanOrEqual(3);
    expect(contrast(color.fg, row)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(color.onAccent, color.accent)).toBeGreaterThanOrEqual(4.5);
}

it.each(['light', 'dark'] as const)('keeps %s Question badges readable', (scheme) => {
  expectQuestionContrast(resolveTheme(scheme));
  for (const accent of [...Object.keys(mobileAccents[scheme]), '#434447'])
    expectQuestionContrast(resolveTheme(scheme, { accent }));
});

it('preserves readable card choices with arbitrary Bot accents', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xffffff }), (rgb) => {
      const accent = '#' + rgb.toString(16).padStart(6, '0');
      for (const scheme of ['light', 'dark'] as const) {
        const theme = resolveTheme(scheme, { accent });
        expectQuestionContrast(theme);
        const resting = cardChoiceColors(theme, 'primary');
        for (const state of ['rest', 'pressed', 'disabled', 'selected-disabled'] as const) {
          const paint = cardChoiceColors(theme, 'primary', state);
          expect(contrast(paint.ink, paint.fill)).toBeGreaterThanOrEqual(4.5);
          if (state === 'pressed')
            expect(contrast(resting.ink, paint.fill)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }),
    { numRuns: 256 },
  );
});
