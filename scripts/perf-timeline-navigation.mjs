export async function timelineConversationVisible(page) {
  return page.evaluate(() => {
    const pane = document.querySelector('.bh-chat-body');
    if (!pane) return false;
    const bounds = pane.getBoundingClientRect();
    const left = Math.max(0, bounds.left);
    const top = Math.max(0, bounds.top);
    const right = Math.min(innerWidth, bounds.right);
    const bottom = Math.min(innerHeight, bounds.bottom);
    if (right <= left || bottom <= top) return false;
    const front = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return front !== null && pane.contains(front);
  });
}

export async function revealEarlierTimelineMessage(page, selector) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const message = await page.$(selector);
    if (message) {
      await message.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      return;
    }
    await page.$eval('.bh-chat-body', async (pane) => {
      pane.scrollTop = Math.max(0, pane.scrollTop - pane.clientHeight);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  }
  throw new Error(`Earlier message did not mount after bounded history scrolling: ${selector}`);
}

export async function openTimelineConversation(page, channelId, dismissOverlays) {
  const shell = '.bh-root.bh-main, [data-workspace-dock]';
  if (!(await page.$(shell))) await page.locator('::-p-aria(Bot mode)').click();
  await page.waitForSelector(shell);
  await dismissOverlays();
  const workspace = await page.$('[data-workspace-dock]');
  const row = `${workspace ? '[data-workspace-dock] ' : ''}button[data-channel-id="${channelId}"]`;
  const channel = await page.$(row);
  if (!channel || !(await channel.isVisible())) {
    const channels = await page.$('[data-workspace-dock] button[data-pinned-panel="bh:channels"]');
    if (channels) await channels.click();
  }
  await page.waitForFunction(
    (selector) =>
      [...document.querySelectorAll(selector)].some((node) => {
        const bounds = node.getBoundingClientRect();
        return node.checkVisibility() && bounds.width > 0 && bounds.height > 0;
      }),
    {},
    row,
  );
  await dismissOverlays();
  const rows = await page.$$(row);
  let opened = false;
  for (const candidate of rows) {
    if (!(await candidate.isVisible())) continue;
    await candidate.click();
    opened = true;
    break;
  }
  if (!opened) throw new Error(`Visible conversation row unavailable: ${channelId}`);
  await page.waitForSelector('.bh-chat-body', { visible: true });
}
