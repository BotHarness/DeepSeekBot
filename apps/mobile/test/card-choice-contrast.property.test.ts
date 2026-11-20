import fc from 'fast-check';
import { expect, it } from 'vitest';

import { cardChoiceColors, questionGroupOutline } from '../src/ui/design/controls';
import { contrast, resolveTheme } from '../src/ui/design/resolve-theme';

it('preserves readable card choices with arbitrary Bot accents', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 0xffffff }), (rgb) => {
      const accent = '#' + rgb.toString(16).padStart(6, '0');
      for (const scheme of ['light', 'dark'] as const) {
        const theme = resolveTheme(scheme, { accent });
        expect(
          contrast(questionGroupOutline(theme), theme.layer.raised.fill),
        ).toBeGreaterThanOrEqual(3);
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
