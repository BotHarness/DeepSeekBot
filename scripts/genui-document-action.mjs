export async function clickGenuiDocumentAction(page, selector, label) {
  await page
    .locator(`${selector} ::-p-aria([name=${JSON.stringify(label)}][role="button"])`)
    .click();
}
