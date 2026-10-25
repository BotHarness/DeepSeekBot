import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  prepareDesktopZoomCompatibility,
  preparePackagedDesktopZoomTheme,
  ZOOM_THEME_HASHES,
} from '../desktop-zoom-compat.mjs';
const dshRequire = createRequire(
  createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),
);
const { applyEntryPatches } = await import(
  pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis-plugin-include')).href
);
const { Context } = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis')).href);
const { Loader, EntryTree } = await import(
  pathToFileURL(dshRequire.resolve('@deepseek-ai/cordis-plugin-loader')).href
);
import { parseProductComposition } from '../packaged-profile.mjs';

const source = realpathSync(
  fileURLToPath(
    new URL('../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme', import.meta.url),
  ),
);
const roots = [];
const temporary = () => {
  const root = mkdtempSync(join(tmpdir(), 'zoom-package-test-'));
  roots.push(root);
  return root;
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('product-owned desktop theme payload', () => {
  it.each([
    ['manifest', 'zoom-theme-version-unsupported', 'zoom-theme-version-unsupported'],
    ['host', 'zoom-theme-host-unsupported', 'zoom-theme-version-unsupported'],
    ['client', 'zoom-theme-build-unsupported', 'zoom-theme-build-unsupported'],
    ['both', 'zoom-theme-build-unsupported', 'zoom-theme-version-unsupported'],
  ])(
    'preserves entry-specific refusal precedence for %s mutations',
    (mutation, localError, packagedError) => {
      const root = temporary();
      const changed = join(root, 'changed');
      cpSync(source, changed, {
        recursive: true,
        filter: (path) => !relative(source, path).split(sep).includes('node_modules'),
      });
      if (mutation === 'manifest') {
        const manifest = JSON.parse(readFileSync(join(changed, 'package.json'), 'utf8'));
        manifest.name = 'unexpected-theme';
        writeFileSync(join(changed, 'package.json'), JSON.stringify(manifest));
      }
      if (mutation === 'host' || mutation === 'both')
        writeFileSync(join(changed, 'lib/index.js'), 'unqualified');
      if (mutation === 'client' || mutation === 'both')
        writeFileSync(join(changed, 'lib/client.js'), 'unqualified');
      for (const [prepare, error, name] of [
        [prepareDesktopZoomCompatibility, localError, 'local'],
        [preparePackagedDesktopZoomTheme, packagedError, 'packaged'],
      ]) {
        const target = join(root, name);
        expect(() => prepare({ source: changed, target })).toThrow(error);
        expect(existsSync(target)).toBe(false);
      }
    },
  );

  it('shares transformed client bytes while retaining local fresh-directory semantics', () => {
    const root = temporary();
    const local = join(root, 'local');
    const packaged = join(root, 'packaged');
    prepareDesktopZoomCompatibility({ source, target: local });
    preparePackagedDesktopZoomTheme({ source, target: packaged });
    expect(readFileSync(join(local, 'lib/client.js'))).toEqual(
      readFileSync(join(packaged, 'lib/client.js')),
    );
    expect(() => prepareDesktopZoomCompatibility({ source, target: local })).toThrow(
      'zoom-target-must-be-new',
    );
  });

  it('keeps a complete licensed package and resolves its Host schema relative to a relocated product', async () => {
    const root = temporary();
    const product = join(root, 'product');
    const target = join(product, 'desktop-theme');
    const provenance = preparePackagedDesktopZoomTheme({ source, target });
    expect(provenance.clientBefore).toBe(ZOOM_THEME_HASHES.client);
    expect(provenance.hostBefore).toBe(ZOOM_THEME_HASHES.host);
    expect(digest(readFileSync(join(source, 'lib/client.js')))).toBe(ZOOM_THEME_HASHES.client);
    expect(readFileSync(join(target, 'LICENSE'), 'utf8')).toBe(
      readFileSync(join(source, 'LICENSE'), 'utf8'),
    );
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
    expect(existsSync(join(target, manifest.types))).toBe(true);
    expect(
      existsSync(join(target, 'locale/en-US.json')) || existsSync(join(target, 'locale/en.json')),
    ).toBe(true);
    const host = readFileSync(join(target, 'lib/index.js'), 'utf8');
    expect(host).toContain('"../../dist/theme-schema.mjs"');
    expect(host).not.toContain('file:');
    const schema = createRequire(join(source, 'package.json')).resolve('@deepseek-ai/schemastery');
    mkdirSync(join(product, 'dist'));
    writeFileSync(
      join(product, 'dist/theme-schema.mjs'),
      `export {default} from ${JSON.stringify(pathToFileURL(join(dirname(schema), 'index.mjs')).href)};`,
    );
    const relocated = join(root, 'relocated');
    cpSync(product, relocated, { recursive: true });
    rmSync(product, { recursive: true });
    const loaded = await import(pathToFileURL(join(relocated, 'desktop-theme/lib/index.js')).href);
    expect(loaded.apply).toBeTypeOf('function');
    expect(loaded.Config).toBeTypeOf('function');
  });

  it('does not churn watched theme modules on an unrelated product rebuild', () => {
    const target = join(temporary(), 'theme');
    preparePackagedDesktopZoomTheme({ source, target });
    const files = ['lib/client.js', 'lib/index.js', 'package.json', 'botharness-zoom-compat.json'];
    const before = files.map((path) => statSync(join(target, path)).mtimeMs);
    preparePackagedDesktopZoomTheme({ source, target });
    expect(files.map((path) => statSync(join(target, path)).mtimeMs)).toEqual(before);
  });

  it('refuses an upstream source mutation and refuses writing into its source', () => {
    expect(() =>
      preparePackagedDesktopZoomTheme({ source, target: join(source, 'generated') }),
    ).toThrow('zoom-target-inside-source');
    const root = temporary();
    const changed = join(root, 'changed');
    cpSync(source, changed, {
      recursive: true,
      filter: (path) => !relative(source, path).split(sep).includes('node_modules'),
    });
    writeFileSync(join(changed, 'lib/client.js'), 'unqualified');
    const target = join(root, 'target');
    expect(() => preparePackagedDesktopZoomTheme({ source: changed, target })).toThrow(
      'zoom-theme-build-unsupported',
    );
    expect(existsSync(target)).toBe(false);
  });

  it('resolves source aliases before rejecting an output inside the source package', () => {
    const alias = join(temporary(), 'alias');
    symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() =>
      preparePackagedDesktopZoomTheme({ source: alias, target: join(alias, 'generated') }),
    ).toThrow('zoom-target-inside-source');
    expect(digest(readFileSync(join(source, 'lib/client.js')))).toBe(ZOOM_THEME_HASHES.client);
  });
});

for (const patch of ['cordis.patch.yml', 'cordis.im.patch.yml']) {
  it(`${patch} activates one theme with retained settings and restores upstream on cold removal`, async () => {
    const text = readFileSync(
      new URL(`../../packages/deepseekbot/${patch}`, import.meta.url),
      'utf8',
    );
    const rows = parseProductComposition(text);
    const original = [{ id: 'ui-theme', name: '@deepseek-ai/dsh-client-ui-theme' }];
    const config = { preference: 'dark', fontSize: 17, codeFontSize: 13 };
    const composed = applyEntryPatches(original, [...rows, { id: 'ui-theme', config }], () => {});
    async function boot(entries) {
      const ctx = new Context();
      const loader = await ctx.plugin(Loader);
      const tree = new EntryTree(ctx);
      const started = [];
      const stopped = [];
      tree.import = async (name) => ({
        apply(context, settings) {
          started.push({ name, config: settings });
          context.effect(() => () => stopped.push(name));
        },
      });
      try {
        await tree.root.update(entries.filter((row) => row.id === 'ui-theme'));
        await tree.await();
      } finally {
        tree.root.stop();
        await loader.dispose();
      }
      return { started, stopped };
    }
    expect(await boot(composed)).toEqual({
      started: [{ name: './desktop-theme/lib/index.js', config }],
      stopped: ['./desktop-theme/lib/index.js'],
    });
    expect(await boot(applyEntryPatches(original, [{ id: 'ui-theme', config }], () => {}))).toEqual(
      {
        started: [{ name: '@deepseek-ai/dsh-client-ui-theme', config }],
        stopped: ['@deepseek-ai/dsh-client-ui-theme'],
      },
    );
    expect(original).toEqual([{ id: 'ui-theme', name: '@deepseek-ai/dsh-client-ui-theme' }]);
    expect(text).not.toContain('botharness-desktop-theme');
  });
}
