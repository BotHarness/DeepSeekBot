export async function openTimelineConversation(page, channelId, dismissOverlays) {
  const shell = '.bh-root.bh-main, [data-workspace-dock]';
  if (!(await page.$(shell))) await page.locator('::-p-aria(Bot mode)').click();
  await page.waitForSelector(shell, { visible: true });
  await dismissOverlays();
  const workspace = await page.$('[data-workspace-dock]');
  const row = `${workspace ? '[data-workspace-dock] ' : ''}button.bh-channel-row[data-channel-id="${channelId}"]`;
  const channel = await page.$(row);
  if (!channel || !(await channel.isVisible())) {
    const channels = await page.$('[data-workspace-dock] button[data-pinned-panel="bh:channels"]');
    if (channels) await channels.click();
  }
  await page.waitForSelector(row, { visible: true });
  await dismissOverlays();
  await page.locator(row).click();
  await page.waitForSelector('.bh-chat-body [data-message-id]');
}
