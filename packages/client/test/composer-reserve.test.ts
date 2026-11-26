// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  composerCompactPadding,
  composerModelReserve,
  composerModelReservePx,
} from '../src/client/ds/composer-reserve.js';
import { compactComposerWidth } from '../src/client/features/channels/composer-input-layout.js';
import { space, style } from '../src/client/ds/tobs.stylex.js';

function composer(model: boolean) {
  const element = document.createElement('div');
  element.className = 'bh-composer bh-composer-with-footer';
  element.style.setProperty('--bh-composer-compact-padding-left', '48px');
  element.style.setProperty('--bh-composer-compact-padding-right', '52px');
  element.style.setProperty('--tobs-style-control-height-small', '28px');
  if (model) element.setAttribute('data-model-reserve', '');
  Object.defineProperty(element, 'clientWidth', { value: 400 });
  document.body.append(element);
  return element;
}

it('builds the model reservation from the small control height and the footer gap', () => {
  expect(composerModelReserve).toBe(`calc(${style.controlHeightSmall} + ${space.x2})`);
  expect(composerCompactPadding()).toContain(
    `calc(var(--bh-composer-compact-padding-right) + ${composerModelReserve})`,
  );
  expect(composerModelReservePx(getComputedStyle(composer(false)))).toBe(28 + 4);
});

it('measures the collapsed width with the same model reservation the compact layout uses', () => {
  expect(compactComposerWidth(composer(false))).toBe(400 - 48 - 52);
  expect(compactComposerWidth(composer(true))).toBe(400 - 48 - 52 - (28 + 4));
});
