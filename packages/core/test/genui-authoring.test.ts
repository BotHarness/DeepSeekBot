import { describe, expect, it } from 'vitest';
import {
  createGenuiPreviewStore,
  expandGenuiContent,
  expandGenuiDiagrams,
} from '../src/runtime/genui-authoring.js';
import { compileGenuiDiagram } from '../src/runtime/genui-diagram.js';

describe('GenUI authoring shorthand', () => {
  it('replaces each diagram element with the same SVG the diagram Tool returns', async () => {
    const source = 'flowchart LR\n A[输入] --> B{判断}\n B -->|是| C[结果]';
    const escaped = source.replaceAll('>', '&gt;');
    const html = `<p>前</p><genui-diagram width='480'>\n${escaped}\n</genui-diagram><p>后</p>`;
    const expected = await compileGenuiDiagram(source, 480);
    expect(await expandGenuiDiagrams(html)).toBe(`<p>前</p>${expected.svg}<p>后</p>`);
  });

  it('leaves HTML without diagrams and legacy reports untouched', async () => {
    const report = { version: 1, title: 'Legacy' };
    expect(await expandGenuiDiagrams('<p>plain</p>')).toBe('<p>plain</p>');
    expect(await expandGenuiContent(report)).toBe(report);
  });

  it('expands only diagram elements in markup, not text in scripts, styles or comments', async () => {
    const inert =
      '<!-- <genui-diagram>pie</genui-diagram> --><script>const tag = "<genui-diagram>";</script><style>/* <genui-diagram> */</style>';
    expect(await expandGenuiDiagrams(`<p>x</p>${inert}`)).toBe(`<p>x</p>${inert}`);
    const expected = await compileGenuiDiagram('flowchart LR\n A --> B');
    expect(
      await expandGenuiDiagrams(`${inert}<genui-diagram>flowchart LR\n A --&gt; B</genui-diagram>`),
    ).toBe(`${inert}${expected.svg}`);
    const attribute = '<div data-example="<script>" title=\'<!--\'></div>';
    expect(
      await expandGenuiDiagrams(
        `${attribute}<genui-diagram>flowchart LR\n A --&gt; B</genui-diagram>`,
      ),
    ).toBe(`${attribute}${expected.svg}`);
  });

  it('refuses malformed elements and reports which diagram failed', async () => {
    await expect(
      expandGenuiDiagrams('<genui-diagram>flowchart LR\n A --> B'),
    ).rejects.toMatchObject({
      code: 'genui-diagram-tag',
    });
    await expect(
      expandGenuiDiagrams('<genui-diagram class="x">flowchart LR\n A --> B</genui-diagram>'),
    ).rejects.toMatchObject({ code: 'genui-diagram-tag' });
    await expect(
      expandGenuiDiagrams(
        '<genui-diagram>flowchart LR\n A --> B</genui-diagram><genui-diagram>pie\n "a": 1</genui-diagram>',
      ),
    ).rejects.toThrow(/^Diagram 2: /u);
    await expect(
      expandGenuiDiagrams('<genui-diagram>flowchart LR\n A --> B</genui-diagram>'.repeat(9)),
    ).rejects.toMatchObject({ code: 'genui-diagram-tag' });
  });

  it('scopes previews per Bot and expires them by age and count', () => {
    let now = 0;
    const store = createGenuiPreviewStore(() => now, {
      entries: 2,
      ttlMs: 100,
    });
    const document = { version: 2, html: '<p>a</p>' };
    store.remember('bot-a', 'one', document);
    document.html = 'mutated';
    expect(store.read('bot-a', 'one')).toEqual({
      version: 2,
      html: '<p>a</p>',
    });
    expect(() => store.read('bot-b', 'one')).toThrow(
      expect.objectContaining({ code: 'genui-preview-expired' }),
    );
    store.remember('bot-a', 'two', document);
    store.remember('bot-a', 'three', document);
    expect(() => store.read('bot-a', 'one')).toThrow('expired');
    now = 100;
    expect(() => store.read('bot-a', 'three')).toThrow('expired');
  });
});
