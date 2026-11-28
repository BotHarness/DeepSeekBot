import assert from 'node:assert/strict';
import { parseVerifyArgs, verifyPaths, withClient } from './verify-app.mjs';

const label = 'model-picker-alignment';
const options = parseVerifyArgs([
  'shot',
  label,
  '--bot-mode',
  '--size',
  '1024x768',
  ...process.argv.slice(2),
  '--locale',
  'en',
]);

const result = await withClient(options, verifyPaths(options.name), label, async ({ page }) => {
  await page
    .locator('::-p-aria([name="Tob: Idle Tob No messages yet"][role="button"])')
    .click({ button: 'right' });
  await page.locator('::-p-aria([name="Model"][role="menuitem"])').click();
  const trigger = 'button[aria-label^="Main model"]';
  await page.locator(trigger).click();
  const picker = '[data-filter-picker]';
  const listbox = `${picker} [role="listbox"]`;
  await page.waitForSelector(listbox, { visible: true });

  const alignment = await page.evaluate(
    ({ trigger, picker, listbox }) => {
      const anchor = document.querySelector(trigger).getBoundingClientRect();
      const panel = document.querySelector(picker);
      const bounds = panel.getBoundingClientRect();
      const list = document.querySelector(listbox);
      return {
        anchored: panel.style.positionAnchor !== '',
        gap: Math.max(bounds.top - anchor.bottom, anchor.top - bounds.bottom),
        top: bounds.top,
        bottom: innerHeight - bounds.bottom,
        options: list.querySelectorAll('[role="option"]').length,
        scrollable: list.scrollHeight > list.clientHeight,
      };
    },
    { trigger, picker, listbox },
  );
  assert.ok(alignment.anchored, 'Launch with a DSH version that uses CSS anchor positioning');
  assert.ok(alignment.options >= 16 && alignment.scrollable, 'Supply a long model catalog');
  assert.ok(Math.abs(alignment.gap - 6) <= 1, `Picker gap is ${alignment.gap}px`);
  assert.ok(alignment.top >= 11 && alignment.bottom >= 11, 'Picker fits inside viewport margins');

  await page.hover(listbox);
  await page.mouse.wheel({ deltaY: 700 });
  await page.waitForFunction(
    (selector) => document.querySelector(selector).scrollTop > 0,
    {},
    listbox,
  );
  return alignment;
});

console.log(JSON.stringify(result, null, 2));
