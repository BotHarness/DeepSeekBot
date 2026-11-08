import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';
import { GenuiDomMirror, GENUI_MIRROR_CSP } from '../../core/src/channels/genui-dom-mirror.js';
import { createGenuiGuest } from '../../core/src/channels/genui-guest.js';
import { initialGenuiDocumentState } from '../../core/src/channels/genui-document.js';
import { GENUI_EXECUTION_PROTOCOL } from '../../core/src/channels/genui-execution.js';
import type {
  GenuiExecutionCommand,
  GenuiExecutionSnapshot,
} from '../../core/src/channels/genui-execution-supervisor.js';
import { syntheticGenuiDocument } from '../../core/test/fixtures/genui-document.js';

const require = createRequire(new URL('../../core/package.json', import.meta.url));
interface TestConsole {
  on(type: 'jsdomError', listener: (error: Error) => void): void;
}
const {
  JSDOM,
  VirtualConsole,
}: {
  JSDOM: new (
    html: string,
    options: { virtualConsole: TestConsole },
  ) => { window: Window & typeof globalThis };
  VirtualConsole: new () => TestConsole;
} = createRequire(import.meta.url)('jsdom');
const wasmBinary = new Uint8Array(
  await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
).buffer;
const library = await build({
  entryPoints: [
    fileURLToPath(new URL('../../core/src/channels/genui-guest-dom.ts', import.meta.url)),
  ],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  minify: true,
});
const retained: (() => void)[] = [];

function open() {
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error));
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    virtualConsole,
  });
  const commands: GenuiExecutionCommand[] = [];
  const mirror = new GenuiDomMirror(dom.window.document, (command) => commands.push(command));
  retained.push(() => {
    mirror.dispose();
    dom.window.close();
  });
  return { dom, document: dom.window.document, commands, mirror, errors };
}

function snapshot(
  html: string,
  controls: GenuiExecutionSnapshot['controls'] = [],
): GenuiExecutionSnapshot {
  return {
    protocol: GENUI_EXECUTION_PROTOCOL,
    instanceId: 'mirror-test',
    generation: 1,
    sequence: 1,
    commandSequence: 0,
    type: 'snapshot',
    html,
    controls,
    state: initialGenuiDocumentState(syntheticGenuiDocument),
    wasmBytes: 0,
  };
}

afterEach(() => {
  for (const dispose of retained.splice(0)) dispose();
});

describe('GenUI trusted script-disabled DOM mirror', () => {
  it('accepts a real adopted control by document ownership rather than its constructor realm', () => {
    const { dom, document, mirror, commands } = open();
    mirror.paint(snapshot('<input data-genui-node="1">', [{ id: '1', value: '' }]));
    const foreign = new JSDOM('<!doctype html><input data-genui-node="1">', {
      virtualConsole: new VirtualConsole(),
    });
    retained.push(() => foreign.window.close());
    const input = foreign.window.document.querySelector('input');
    if (!input) throw Error('Missing adopted control.');
    document.querySelector('input')?.replaceWith(input);
    expect(input.ownerDocument).toBe(document);
    expect(input instanceof dom.window.Element).toBe(false);
    input.value = 'Beta';
    input.dispatchEvent(new foreign.window.Event('input', { bubbles: true }));
    expect(commands).toEqual([
      { type: 'event', event: 'input', targetId: '1', value: 'Beta', checked: false },
    ]);
  });

  it('renders and operates the unchanged rich fixture through the actual guest adapter', async () => {
    const guest = await createGenuiGuest({
      document: syntheticGenuiDocument,
      state: initialGenuiDocumentState(syntheticGenuiDocument),
      wasmBinary,
      librarySource: library.outputFiles[0]?.text ?? '',
    });
    retained.push(() => guest.dispose());
    const { dom, document, mirror, commands } = open();
    mirror.paint(guest.snapshot());
    expect(document.querySelectorAll('[data-scene]')).toHaveLength(9);
    expect(document.querySelectorAll('svg')).toHaveLength(5);
    expect(document.querySelector('script')).toBeNull();
    const filter = document.querySelector<HTMLInputElement>('#filter');
    if (!filter) throw Error('Missing synthetic filter.');
    filter.focus();
    filter.value = 'Beta';
    filter.setSelectionRange(2, 2);
    filter.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const command = commands.at(-1);
    if (!command || command.type !== 'event') throw Error('Missing local input command.');
    guest.event(command);
    mirror.paint(guest.snapshot());
    expect(document.querySelector('#rows')?.textContent).toContain('Beta');
    expect(document.querySelector('#rows')?.textContent).not.toContain('Alpha');
    expect(document.activeElement).toBe(filter);
    expect(filter.selectionStart).toBe(2);
    const radio = document.querySelector<HTMLInputElement>('[aria-label="Select Beta"]');
    if (!radio) throw Error('Missing synthetic selection.');
    radio.focus();
    radio.checked = true;
    radio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const selection = commands.at(-1);
    if (!selection || selection.type !== 'event') throw Error('Missing selection command.');
    guest.event(selection);
    mirror.paint(guest.snapshot());
    expect(document.querySelector('[aria-label="Select Beta"]') === radio).toBe(true);
    expect(document.activeElement === radio).toBe(true);
    expect(radio.checked).toBe(true);
    expect(document.querySelector('#selected')?.textContent).toBe('Selected: beta');
    mirror.theme('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('retains keyed controls and local drafts until their queued intent is acknowledged', () => {
    const { document, mirror } = open();
    const content = snapshot(
      '<input data-genui-node="1" value="old"><p data-genui-node="2">old</p>',
      [{ id: '1', value: 'old' }],
    );
    mirror.paint(content);
    const input = document.querySelector('input');
    if (!input) throw Error('Missing control.');
    input.value = 'typed ahead';
    input.focus();
    input.setSelectionRange(3, 7);
    mirror.paint(
      { ...content, html: '<p data-genui-node="2">new</p><input data-genui-node="1" value="old">' },
      new Set(['1']),
    );
    expect(document.querySelector('input')).toBe(input);
    expect(input.value).toBe('typed ahead');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(7);
    mirror.paint({ ...content, controls: [{ id: '1', value: 'acknowledged' }] });
    expect(input.value).toBe('acknowledged');
  });

  it('does not cancel native checkbox changes or send button values as editable controls', () => {
    const { document, mirror, commands } = open();
    mirror.paint(
      snapshot(
        '<button data-genui-node="1" value="not-a-control">Choose</button><input data-genui-node="2" type="checkbox">',
        [{ id: '2', value: '', checked: false }],
      ),
    );
    document.querySelector('button')?.click();
    expect(commands[0]).toEqual({ type: 'event', event: 'click', targetId: '1' });
    document.querySelector('input')?.click();
    expect(
      commands.some(
        (command) =>
          command.type === 'event' && command.event === 'change' && command.checked === true,
      ),
    ).toBe(true);
  });

  it('strips navigation and event attributes while keeping script execution disabled by product policy', () => {
    const { document, mirror } = open();
    mirror.paint(
      snapshot(
        '<meta charset="utf-8"><a data-genui-node="1" href="https://example.invalid" onclick="unexpected()">Readable link</a><form data-genui-node="2" action="https://example.invalid"><button data-genui-node="3">Send</button></form>',
      ),
    );
    expect(document.querySelector('a')?.getAttribute('href')).toBeNull();
    expect(document.querySelector('a')?.getAttribute('onclick')).toBeNull();
    expect(document.querySelector('form')?.getAttribute('action')).toBeNull();
    expect(GENUI_MIRROR_CSP).toContain("script-src 'none'");
    expect(GENUI_MIRROR_CSP).toContain("connect-src 'none'");
    expect(GENUI_MIRROR_CSP).not.toContain("script-src 'unsafe-inline'");
  });

  it('fails closed before replacing a healthy mirror with unsupported active content or resources', () => {
    const { document, mirror } = open();
    mirror.paint(snapshot('<p>Retained snapshot</p>'));
    for (const html of [
      '<script>unexpected()</script>',
      '<iframe srcdoc="untrusted"></iframe>',
      '<style>@import "https://example.invalid";</style>',
      '<style>p{background:url(https://example.invalid)}</style>',
      '<style>p{filter:blur(20px)}</style>',
      '<input type="file">',
      '<svg><filter id="effect"></filter></svg>',
    ]) {
      expect(() => mirror.paint(snapshot(html))).toThrow();
      expect(document.body.textContent).toBe('Retained snapshot');
    }
  });

  it('independently checks node identity, depth, control and source budgets', () => {
    const { mirror } = open();
    for (const html of [
      '<p data-genui-node="1"></p><p data-genui-node="1"></p>',
      '<span></span>'.repeat(2001),
      '<div>'.repeat(66) + '</div>'.repeat(66),
      `<svg><path d="${'0'.repeat(8193)}"></path></svg>`,
    ])
      expect(() => mirror.paint(snapshot(html))).toThrow();
    expect(() =>
      mirror.paint(snapshot('<div data-genui-node="1"></div>', [{ id: '1', value: '' }])),
    ).toThrow(/control/iu);
    expect(() => mirror.paint(snapshot(`<style>${'x'.repeat(16385)}</style>`))).toThrow(/budget/iu);
  });

  it('reuses unchanged author CSS and removes listeners and rendered state on disposal', () => {
    const { document, mirror, commands, dom } = open();
    const css = 'html{font-family:serif}p{color:var(--foreground);border:3px dotted currentColor}';
    const content = snapshot(`<style>${css}</style><p>Text</p>`);
    mirror.paint(content);
    expect(document.head.textContent).toContain('@layer genui-default');
    expect(document.head.textContent).toContain(css);
    for (const theme of ['light', 'dark'] as const) {
      mirror.theme(theme);
      expect(document.documentElement.style.colorScheme).toBe(theme);
      expect(document.head.textContent).toContain(css);
    }
    const author = document.head.lastElementChild;
    const text = author?.firstChild;
    mirror.paint(content);
    expect(document.head.lastElementChild).toBe(author);
    expect(author?.firstChild).toBe(text);
    mirror.dispose();
    expect(document.body.childNodes).toHaveLength(0);
    document.body.innerHTML = '<button data-genui-node="1">Late</button>';
    document
      .querySelector('button')
      ?.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    expect(commands).toEqual([]);
  });
});
