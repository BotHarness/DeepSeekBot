import assert from 'node:assert/strict';

export async function fillGenuiDocumentFilter(frame, value) {
  await frame.locator('#filter').fill(value);
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
