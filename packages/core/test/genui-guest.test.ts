import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { createGenuiGuest, type GenuiGuest } from '../src/channels/genui-guest.js';
import { GENUI_EXECUTION_LIMITS } from '../src/channels/genui-execution-limits.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';

const require = createRequire(import.meta.url);
const wasmBinary = new Uint8Array(
  await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
).buffer;
const library = await build({
  entryPoints: [fileURLToPath(new URL('../src/channels/genui-guest-dom.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  minify: true,
});
const librarySource = library.outputFiles[0]?.text ?? '';
const guests: GenuiGuest[] = [];

async function open(html = syntheticGenuiDocument.html) {
  const document = { ...syntheticGenuiDocument, html };
  const guest = await createGenuiGuest({
    document,
    state: initialGenuiDocumentState(document),
    librarySource,
    wasmBinary,
  });
  guests.push(guest);
  return guest;
}

afterEach(() => {
  for (const guest of guests.splice(0)) guest.dispose();
});

describe('GenUI bounded guest DOM adapter', () => {
  it('runs the unchanged rich fixture with script-free snapshots and bounded library bytes', async () => {
    expect(new TextEncoder().encode(librarySource).byteLength).toBeLessThanOrEqual(
      GENUI_EXECUTION_LIMITS.libraryBytes,
    );
    const guest = await open();
    const snapshot = guest.snapshot();
    expect(snapshot.html).toContain('Alpha');
    expect(snapshot.html).toContain('<svg');
    expect(snapshot.html).toContain('Donut chart');
    expect(snapshot.html).not.toMatch(/<script/iu);
    expect(snapshot.state.values).toMatchObject({ selected: 'none', sort: 'descending' });
    const filterId = parseHTML(snapshot.html)
      .document.querySelector('#filter')
      ?.getAttribute('data-genui-node');
    expect(filterId).toBeDefined();
    if (!filterId) throw new Error('Fixture filter was not identified.');
    guest.event({ event: 'input', targetId: filterId, value: 'beta' });
    const filtered = guest.snapshot();
    expect(filtered.state.values['filter']).toBe('beta');
    expect(parseHTML(filtered.html).document.querySelector('#rows')?.textContent).toContain('Beta');
    expect(parseHTML(filtered.html).document.querySelector('#rows')?.textContent).not.toContain(
      'Alpha',
    );
    expect(filtered.controls.some((control) => control.id === filterId)).toBe(true);
  });

  it('preserves select, checked controls, all scenes and canonical restoration', async () => {
    const guest = await open();
    for (const scene of [
      'metrics',
      'comparison',
      'table',
      'bar',
      'line',
      'donut',
      'flow',
      'relations',
      'timeline',
    ]) {
      const next = {
        ...guest.snapshot().state,
        values: { ...guest.snapshot().state.values, scene },
      };
      guest.restore(next);
      expect(guest.snapshot().state.values['scene']).toBe(scene);
      const document = parseHTML(guest.snapshot().html).document;
      expect(
        [...document.querySelectorAll('[data-scene]')]
          .filter((node) => !node.hasAttribute('hidden'))
          .map((node) => node.getAttribute('data-scene')),
      ).toEqual([scene]);
    }
    guest.restore({
      version: 1,
      values: { ...guest.snapshot().state.values, sort: 'ascending', details: true },
    });
    const snapshot = guest.snapshot();
    expect(parseHTML(snapshot.html).document.querySelector('#rows tr')?.textContent).toContain(
      'Beta',
    );
    expect(snapshot.html).toContain('aria-expanded="true"');
    expect(() => guest.restore({ version: 1, values: { injected: true } })).toThrow();
  });

  it('extracts executable scripts through the parser rather than a source regexp', async () => {
    const guest = await open(
      `<html><head><script id="data" type="application/json">{"text":"executed"}</script></head><body><p id="result"></p><SCRIPT type="text/javascript">document.querySelector('#result').textContent=JSON.parse(document.querySelector('#data').textContent).text</SCRIPT></body></html>`,
    );
    expect(guest.snapshot().html).toContain('executed');
    expect(guest.snapshot().html).not.toMatch(/<script/iu);
    await expect(
      open('<script src="https://example.invalid/runtime.js"></script>'),
    ).rejects.toThrow(/script/iu);
    await expect(open('<script type="module">export {}</script>')).rejects.toThrow(/script/iu);
    await expect(open('<button onclick="alert(1)">Inline handler</button>')).rejects.toThrow(
      /handler/iu,
    );
  });

  it('refuses node, depth and control budgets before returning native mirror HTML', async () => {
    for (const html of [
      '<span>x</span>'.repeat(GENUI_EXECUTION_LIMITS.nodes),
      '<div>'.repeat(GENUI_EXECUTION_LIMITS.domDepth + 1) +
        '</div>'.repeat(GENUI_EXECUTION_LIMITS.domDepth + 1),
      '<input>'.repeat(GENUI_EXECUTION_LIMITS.controls + 1),
    ]) {
      await expect(open(html)).rejects.toThrow(/budget/iu);
    }
  });

  it('supports local timers with bounded queues and trusted monotonic time', async () => {
    const guest = await open(
      `<p id="result"></p><script>setTimeout(()=>{document.querySelector('#result').textContent='later'},50)</script>`,
    );
    expect(guest.snapshot().html).not.toContain('later');
    guest.tick(49);
    expect(guest.snapshot().html).not.toContain('later');
    guest.tick(50);
    expect(guest.snapshot().html).toContain('later');
    expect(() => guest.tick(49)).toThrow(/time/iu);
    await expect(
      open(`<script>for(let index=0;index<101;index++)setTimeout(()=>{},1000)</script>`),
    ).rejects.toThrow(/timer/iu);
  });

  it('interrupts asynchronous guest callbacks and disposes idempotently', async () => {
    const guest = await open('<script>setTimeout(()=>{for(;;){}},1)</script>');
    expect(() => guest.tick(GENUI_EXECUTION_LIMITS.timerMinMs)).toThrow();
    expect(() => guest.snapshot()).toThrow(/stopped/iu);
    guest.dispose();
    guest.dispose();
  });

  it('refuses unknown node events and invalid canonical state', async () => {
    const guest = await open();
    expect(() => guest.event({ event: 'click', targetId: '2147483647' })).toThrow(/node/iu);
    await expect(open('<script>window.genui.setState({injected:true})</script>')).rejects.toThrow(
      /state|snapshot/iu,
    );
  });

  it('dispatches select and radio input through stable local identities', async () => {
    const guest = await open();
    const document = parseHTML(guest.snapshot().html).document;
    const sortId = document.querySelector('#sort')?.getAttribute('data-genui-node');
    const radioId = document
      .querySelector('[aria-label="Select Alpha"]')
      ?.getAttribute('data-genui-node');
    if (!sortId || !radioId) throw Error('Fixture controls were not found.');
    guest.event({ event: 'change', targetId: sortId, value: 'ascending' });
    expect(guest.snapshot().state.values['sort']).toBe('ascending');
    const nextRadioId = parseHTML(guest.snapshot().html)
      .document.querySelector('[aria-label="Select Alpha"]')
      ?.getAttribute('data-genui-node');
    if (!nextRadioId) throw Error('Retained radio was not found.');
    expect(nextRadioId).toBe(radioId);
    guest.event({ event: 'change', targetId: nextRadioId, checked: true });
    expect(guest.snapshot().state.values['selected']).toBe('alpha');
    expect(guest.snapshot().controls.find((control) => control.id === nextRadioId)).toMatchObject({
      checked: true,
    });
  });

  it('still refuses detached control identities when an author rebuilds their tree', async () => {
    const guest = await open(
      `<div id="rows"><input id="pick" type="radio"></div><script>document.querySelector('#pick').addEventListener('change',()=>{const replacement=document.createElement('input');replacement.id='pick';replacement.type='radio';document.querySelector('#rows').replaceChildren(replacement)});</script>`,
    );
    const radioId = parseHTML(guest.snapshot().html)
      .document.querySelector('#pick')
      ?.getAttribute('data-genui-node');
    if (!radioId) throw Error('Missing initial radio identity.');
    guest.event({ event: 'change', targetId: radioId, checked: true });
    const next = guest.snapshot();
    const replacementId = parseHTML(next.html)
      .document.querySelector('#pick')
      ?.getAttribute('data-genui-node');
    expect(replacementId).toBeDefined();
    expect(replacementId).not.toBe(radioId);
    expect(next.controls.some((control) => control.id === radioId)).toBe(false);
    expect(() => guest.event({ event: 'change', targetId: radioId, checked: true })).toThrow(
      /node/iu,
    );
  });

  it('bounds native number formatting and does not introduce native platform capabilities', async () => {
    const guest = await open(
      `<p id="result"></p><script>document.querySelector('#result').textContent=new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(1234.567)+'|'+['fetch','process','require','Worker','WebAssembly','postMessage'].map(key=>typeof globalThis[key]).join(',')</script>`,
    );
    expect(guest.snapshot().html).toContain(
      '1,234.57|undefined,undefined,undefined,undefined,undefined,undefined',
    );
    await expect(
      open(
        `<script>for(let index=0;index<101;index++)new Intl.NumberFormat('en-US').format(index)</script>`,
      ),
    ).rejects.toThrow(/budget/iu);
    await expect(
      open(`<script>new Intl.NumberFormat('en-US',{unsupported:true}).format(1)</script>`),
    ).rejects.toThrow();
  });

  it('bounds burst timer work and drains local Promise callbacks within the same execution owner', async () => {
    const guest = await open(
      `<p id="result"></p><script>Promise.resolve().then(()=>document.querySelector('#result').textContent='resolved');for(let index=0;index<31;index++)setTimeout(()=>{},100)</script>`,
    );
    expect(guest.snapshot().html).toContain('resolved');
    expect(() => guest.tick(100)).toThrow(/rate budget/iu);
    expect(() => guest.snapshot()).toThrow(/stopped/iu);
  });
});
