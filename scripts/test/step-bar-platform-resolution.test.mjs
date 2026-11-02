import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { expect, it } from 'vitest';

const mobileRequire = createRequire(new URL('../../apps/mobile/package.json', import.meta.url));
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const metroRequire = createRequire(expoRequire.resolve('@expo/metro-config/package.json'));
const { resolve } = metroRequire('metro-resolver');

it.each(['android', 'ios'])(
  'loads step-bar shared exports without resolving back to its %s renderer',
  (platform) => {
    const originModulePath = fileURLToPath(
      new URL(`../../apps/mobile/src/ui/primitives/step-bar.${platform}.tsx`, import.meta.url),
    );
    const ast = parse(readFileSync(originModulePath, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
    const dependencies = ast.program.body
      .flatMap((node) => {
        if (node.type === 'ImportDeclaration' && node.importKind !== 'type')
          return [node.source.value];
        if (
          (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') &&
          node.exportKind !== 'type' &&
          node.source
        )
          return [node.source.value];
        return [];
      })
      .filter((source) => source.startsWith('.'));
    expect(dependencies.length).toBeGreaterThan(0);
    const context = {
      originModulePath,
      assetExts: new Set(),
      sourceExts: ['tsx', 'ts', 'jsx', 'js', 'json'],
      preferNativePlatform: true,
      getPackageForModule: () => null,
      fileSystemLookup(path) {
        try {
          const stat = statSync(path);
          return {
            exists: true,
            type: stat.isDirectory() ? 'd' : 'f',
            realPath: realpathSync(path),
          };
        } catch {
          return { exists: false };
        }
      },
    };
    for (const source of dependencies) {
      const result = resolve(context, source, platform);
      expect(result.type).toBe('sourceFile');
      expect(result.filePath, `${platform}: ${source} must not import/re-export itself`).not.toBe(
        realpathSync(originModulePath),
      );
    }
  },
);
