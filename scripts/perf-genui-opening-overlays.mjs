export function genuiOpeningOverlayControl() {
  const tutorial = document.querySelector('.driver-popover-close-btn');
  const buttons = [...document.querySelectorAll('button')].filter((node) =>
    [
      'Continue',
      '继续',
      'Skip tutorial',
      '跳过教程',
      'Configure later',
      '稍后配置',
      'Skip',
      '跳过',
      'Don’t show again',
    ].includes((node.getAttribute('aria-label') ?? node.textContent).trim()),
  );
  return (
    [tutorial, ...buttons].find((node) => {
      if (!node || !node.isConnected || node.disabled || node.closest('.bh-chat-body'))
        return false;
      const bounds = node.getBoundingClientRect();
      return node.checkVisibility() && bounds.width > 0 && bounds.height > 0;
    }) ?? null
  );
}

async function overlayPresent(page) {
  const handle = await page.evaluateHandle(genuiOpeningOverlayControl);
  try {
    return handle.asElement() !== null;
  } finally {
    await handle.dispose();
  }
}

export async function dismissGenuiOpeningOverlays(page) {
  for (let round = 0; round < 8; round++) {
    if (!(await overlayPresent(page))) return;
    try {
      await page.locator(genuiOpeningOverlayControl).setTimeout(2000).click();
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError' && !(await overlayPresent(page)))
        return;
      throw error;
    }
  }
  if (await overlayPresent(page)) throw new Error('Opening overlays remain after 8 dismissals.');
}
