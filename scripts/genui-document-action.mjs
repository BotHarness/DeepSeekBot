import assert from 'node:assert/strict';

export async function fillGenuiDocumentFilter(frame, value) {
  const input = await frame.$('#filter');
  assert.ok(input, 'Visible filter must be mounted.');
  await input.click({ count: 3 });
  await frame.page().keyboard.press('Backspace');
  if (value) await input.type(value, { delay: 60 });
  assert.equal(
    await frame.$eval('#filter', (node) => node.value),
    value,
    'Visible filter must match the explored draft.',
  );
}

export async function clickGenuiDocumentAction(page, selector, label) {
  await page
    .locator(`${selector} ::-p-aria([name=${JSON.stringify(label)}][role="button"])`)
    .click();
}

export async function waitForGenuiMirrorControl(page, container, selector, property, expected) {
  await page.waitForFunction(
    (container, selector, property, expected) =>
      document.querySelector(`${container} iframe`)?.contentDocument?.querySelector(selector)?.[
        property
      ] === expected,
    {},
    container,
    selector,
    property,
    expected,
  );
}
