import assert from 'node:assert/strict';

export function genuiOpeningReady({ messageId, rich, continueLabel }) {
  const state = window.__bhGenuiOpening;
  if (!state || state.clickedAt === null) return null;
  if (state.trusted !== true || state.previsited !== false || !Number.isFinite(state.clickedAt))
    return { error: 'Opening requires a trusted click on an unvisited canonical target.' };
  if (document.visibilityState !== 'visible' || !document.hasFocus()) return null;
  const visible = (node) => {
    if (!node?.checkVisibility()) return false;
    const bounds = node.getBoundingClientRect();
    const pane = node.closest('.bh-chat-body')?.getBoundingClientRect();
    if (!pane) return false;
    const left = Math.max(0, bounds.left, pane.left);
    const right = Math.min(innerWidth, bounds.right, pane.right);
    const top = Math.max(0, bounds.top, pane.top);
    const bottom = Math.min(innerHeight, bounds.bottom, pane.bottom);
    return (
      right > left &&
      bottom > top &&
      node.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
    );
  };
  const message = document.querySelector(
    `.bh-chat-body [data-message-id=${JSON.stringify(messageId)}]`,
  );
  const canonicalVisible = visible(message);
  const composer = document.querySelector(
    '.bh-chat-pane .bh-composer [contenteditable="true"], .bh-chat-pane textarea',
  );
  const section = message?.querySelector('section[aria-label]');
  const iframeVisible = rich && visible(section?.querySelector('iframe'));
  const control = [...(section?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent.trim() === continueLabel,
  );
  const controlsReady = !rich || Boolean(control && !control.disabled);
  if (
    !canonicalVisible ||
    !composer ||
    document.querySelector('.bh-skeleton-messages') ||
    !controlsReady ||
    (rich && !iframeVisible)
  )
    return null;
  return {
    readyMs: performance.now() - state.clickedAt,
    canonicalVisible,
    controlsReady,
    iframeVisible,
    trusted: state.trusted,
    previsited: state.previsited,
    viewport: { innerWidth, innerHeight, devicePixelRatio },
  };
}

export async function observeGenuiOpening(page, target, open) {
  await page.evaluate(({ channelId, messageId, previsited }) => {
    const state = { clickedAt: null, trusted: false, previsited };
    const listener = (event) => {
      if (event.target.closest('button[data-channel-id]')?.dataset.channelId !== channelId) return;
      state.clickedAt = performance.now();
      state.trusted = event.isTrusted;
      document.removeEventListener('click', listener, true);
    };
    document.addEventListener('click', listener, true);
    state.previsited ||= Boolean(
      document.querySelector(`[data-message-id=${JSON.stringify(messageId)}]`),
    );
    window.__bhGenuiOpening = state;
    window.__bhStopGenuiOpening = () => {
      document.removeEventListener('click', listener, true);
      delete window.__bhGenuiOpening;
      delete window.__bhStopGenuiOpening;
    };
  }, target);
  let failure;
  let result;
  try {
    await open();
    const handle = await page.waitForFunction(
      genuiOpeningReady,
      { polling: 'raf', timeout: 15_000 },
      target,
    );
    const first = await handle.jsonValue();
    await handle.dispose();
    assert.equal(first.error, undefined, first.error);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    const settled = await page.evaluate(genuiOpeningReady, target);
    assert.ok(
      settled && !settled.error,
      'Canonical opening must remain ready after two rAF callbacks.',
    );
    assert.deepEqual(first.viewport, settled.viewport, 'The opening viewport changed.');
    result = { ...first, stable: true, afterTwoRafMs: settled.readyMs };
  } catch (error) {
    failure = error;
  } finally {
    try {
      await page.evaluate(() => window.__bhStopGenuiOpening?.());
    } catch (error) {
      if (failure) failure.cleanupFailure = String(error);
      else failure = error;
    }
  }
  if (failure) throw failure;
  return result;
}

function timings(values) {
  const valid = values.every(
    (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
  if (!valid || values.length === 0) return { count: values.length };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: sorted.length,
    minMs: sorted[0],
    medianMs: sorted[Math.floor(sorted.length / 2)],
    maxMs: sorted.at(-1),
  };
}

export function summarizeGenuiOpening({ publications, openings, pageErrors, cleanupFailures }) {
  const keys = ['1:plain', '1:rich', '2:plain', '2:rich', '3:plain', '3:rich'];
  const invalidPairs = [publications, openings].reduce((total, rows) => {
    const ids = rows.map((row) => `${row.pair}:${row.arm}`);
    return (
      total +
      keys.filter((key) => ids.filter((id) => id === key).length !== 1).length +
      ids.filter((id) => !keys.includes(id)).length
    );
  }, 0);
  const plain = openings.filter((row) => row.arm === 'plain');
  const rich = openings.filter((row) => row.arm === 'rich');
  const previews = publications.filter((row) => row.arm === 'rich');
  const measurements = [
    ...publications.map((row) => row.publicationMs),
    ...previews.map((row) => row.previewMs),
    ...openings.map((row) => row.readyMs),
  ];
  return {
    scope:
      'Three model-free plain/rich opening pairs; visible-ready and two-rAF diagnostics, not physical presentation, full interaction, native or Human acceptance',
    invalidPairs,
    invalidMeasurements: measurements.filter(
      (value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0,
    ).length,
    invalidReadiness: openings.filter(
      (row) =>
        row.trusted !== true ||
        row.canonicalVisible !== true ||
        row.controlsReady !== true ||
        row.stable !== true ||
        row.previsited !== false ||
        (row.arm === 'rich' && row.iframeVisible !== true),
    ).length,
    invalidPreviews: previews.filter(
      (row) =>
        row.previewExact !== true ||
        !Array.isArray(row.previewDiagnostics) ||
        row.previewDiagnostics.length > 0,
    ).length,
    invalidPublications: publications.filter((row) => row.canonical !== true).length,
    publication: timings(publications.map((row) => row.publicationMs)),
    preview: timings(previews.map((row) => row.previewMs)),
    plain: { count: plain.length, ready: timings(plain.map((row) => row.readyMs)) },
    rich: { count: rich.length, ready: timings(rich.map((row) => row.readyMs)) },
    addedOpeningMs: [1, 2, 3].map((pair) => {
      const before = plain.find((row) => row.pair === pair)?.readyMs;
      const after = rich.find((row) => row.pair === pair)?.readyMs;
      return Number.isFinite(before) && Number.isFinite(after) ? after - before : undefined;
    }),
    pageErrors,
    cleanupFailures,
  };
}
