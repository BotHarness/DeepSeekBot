export async function approvePhonePairing(page, { receipt, post }) {
  await page.locator('::-p-aria(Fingerprints match)').click();
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const status = await post('/api/botharness/devices/offer-status', { receipt });
    if (typeof status?.publicKey === 'string') {
      await post('/api/botharness/devices/approve-key', {
        receipt,
        publicKey: status.publicKey,
        confirm: true,
      });
      await page.waitForFunction(() => location.pathname.startsWith('/host-look'), {
        timeout: 30_000,
      });
      await page.locator('::-p-aria(Save)').click();
      await page.waitForFunction(() => !location.pathname.startsWith('/host-look'), {
        timeout: 30_000,
      });
      return;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('The phone never asked the Host to approve its key');
}
