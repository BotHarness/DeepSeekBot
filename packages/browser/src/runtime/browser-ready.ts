export async function waitForBrowserReady(
  readState: () => Promise<unknown>,
  assertCurrent: () => void = () => undefined,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let complete = false;
  for (;;) {
    assertCurrent();
    let value: unknown;
    try {
      value = await readState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/execution context was destroyed|cannot find context|Browser document context changed/iu.test(
          message,
        )
      )
        throw error;
    }
    assertCurrent();
    if (String(value) === 'complete') {
      if (complete) return;
      complete = true;
    } else complete = false;
    if (Date.now() >= deadline)
      throw new Error(
        `Bot Browser page did not settle within ${READY_TIMEOUT_MS}ms after the action; it may have already run. Call browser_observe to inspect the current page before retrying`,
      );
    await delay(READY_POLL_MS);
  }
}

const READY_TIMEOUT_MS = 15_000;
const READY_POLL_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
