import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const globalName = '__BotHarnessGenuiRuntime';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const buildOptions = {
  absWorkingDir: rootDir,
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  minify: true,
  metafile: true,
};

export async function buildGenuiGuestLibrary() {
  const linkedom = dirname(
    createRequire(join(rootDir, 'packages/core/package.json')).resolve('linkedom/package.json'),
  );
  const parser = realpathSync(join(linkedom, '..', 'htmlparser2'));
  const cssom = await build({
    ...buildOptions,
    stdin: { contents: "export { parse } from 'cssomnom/parse';", resolveDir: linkedom },
    globalName: '__genuiCssom',
  });
  const cssomFile = cssom.outputFiles[0];
  if (!cssomFile) throw Error('The GenUI Guest stylesheet parser was not built.');
  const lazyCssom = `const source=${JSON.stringify(`(()=>{${cssomFile.text};return __genuiCssom})()`)};const evaluate=globalThis.eval;let loaded;export function parse(text){loaded??=evaluate(source);return loaded.parse(text)}`;
  const library = await build({
    ...buildOptions,
    entryPoints: ['packages/core/src/channels/genui-guest-dom.ts'],
    plugins: [
      {
        name: 'botharness:genui-lazy-cssom',
        setup(plugin) {
          plugin.onResolve({ filter: /^entities$/ }, (args) =>
            args.pluginData === 'genui-entities'
              ? undefined
              : plugin.resolve('entities', {
                  kind: args.kind,
                  resolveDir: parser,
                  pluginData: 'genui-entities',
                }),
          );
          plugin.onResolve({ filter: /^cssomnom\/parse$/ }, () => ({
            path: 'cssomnom/parse',
            namespace: 'genui-lazy-cssom',
          }));
          plugin.onLoad({ filter: /.*/, namespace: 'genui-lazy-cssom' }, () => ({
            contents: lazyCssom,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const libraryFile = library.outputFiles[0];
  if (!libraryFile) throw Error('The GenUI Guest library was not built.');
  return {
    text: libraryFile.text,
    contents: libraryFile.contents,
    inputs: [
      ...Object.keys(cssom.metafile.inputs).filter((input) => input !== '<stdin>'),
      ...Object.keys(library.metafile.inputs).filter(
        (input) => !input.startsWith('genui-lazy-cssom:'),
      ),
    ],
  };
}

export async function buildGenuiRuntimeAssets() {
  const require = createRequire(join(rootDir, 'packages/core/package.json'));
  const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
  const options = buildOptions;
  const libraryFile = await buildGenuiGuestLibrary();
  const worker = await build({
    ...options,
    entryPoints: ['packages/core/src/channels/genui-execution-worker.ts'],
    define: {
      __GENUI_GUEST_LIBRARY__: JSON.stringify(libraryFile.text),
      __GENUI_WASM_BASE64__: JSON.stringify(wasm.toString('base64')),
    },
  });
  const workerFile = worker.outputFiles[0];
  if (!workerFile) throw Error('The GenUI execution Worker was not built.');
  const renderer = await build({
    ...options,
    entryPoints: ['packages/core/src/channels/genui-document-runtime.ts'],
    globalName,
    define: { __GENUI_WORKER_SOURCE__: JSON.stringify(workerFile.text) },
  });
  const rendererFile = renderer.outputFiles[0];
  if (!rendererFile) throw Error('The GenUI trusted renderer was not built.');
  const metadata = {
    renderer: { bytes: rendererFile.contents.byteLength, sha256: digest(rendererFile.contents) },
    worker: { bytes: workerFile.contents.byteLength, sha256: digest(workerFile.contents) },
    library: { bytes: libraryFile.contents.byteLength, sha256: digest(libraryFile.contents) },
    wasm: { bytes: wasm.byteLength, sha256: digest(wasm) },
  };
  return {
    rendererSource: rendererFile.text,
    clientModuleSource: `window.__ModuleLoader__.load({id:'@botharness/ui/client.genui.js',factory:()=>{${rendererFile.text}\nreturn ${globalName};}});\n`,
    metadata,
    inputs: [
      ...new Set([
        ...libraryFile.inputs,
        ...Object.keys(worker.metafile.inputs),
        ...Object.keys(renderer.metafile.inputs),
      ]),
    ],
  };
}

export function genuiRuntimeAssetsPlugin(target) {
  if (target !== 'client' && target !== 'core') throw Error('Unknown GenUI asset target.');
  return {
    name: `botharness:genui-runtime-${target}`,
    async generateBundle() {
      const assets = await buildGenuiRuntimeAssets();
      for (const input of assets.inputs) this.addWatchFile(join(rootDir, input));
      this.emitFile({
        type: 'asset',
        fileName: target === 'client' ? 'client.genui.js' : 'genui-runtime.js',
        source: target === 'client' ? assets.clientModuleSource : assets.rendererSource,
      });
      this.emitFile({
        type: 'asset',
        fileName: target === 'client' ? 'client.genui.json' : 'genui-runtime.json',
        source: JSON.stringify(assets.metadata),
      });
    },
  };
}
