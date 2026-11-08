import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const globalName = '__BotHarnessGenuiRuntime';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function buildGenuiRuntimeAssets() {
  const require = createRequire(join(rootDir, 'packages/core/package.json'));
  const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
  const options = {
    absWorkingDir: rootDir,
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    minify: true,
    metafile: true,
  };
  const library = await build({
    ...options,
    entryPoints: ['packages/core/src/channels/genui-guest-dom.ts'],
  });
  const libraryFile = library.outputFiles[0];
  if (!libraryFile) throw Error('The GenUI Guest library was not built.');
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
        ...Object.keys(library.metafile.inputs),
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
