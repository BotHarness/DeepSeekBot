import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGenuiRuntimeAssets } from '../../../scripts/genui-runtime-assets.mjs';

const OUTPUT = fileURLToPath(new URL('../src/genui/runtime.generated.ts', import.meta.url));

export async function genuiMobileRuntimeModule() {
  const { rendererSource } = await buildGenuiRuntimeAssets();
  const bytes = Buffer.from(rendererSource, 'utf8');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return `export const GENUI_RUNTIME = {\n  sha256: '${sha256}',\n  bytes: ${bytes.byteLength},\n  base64:\n    '${bytes.toString('base64')}',\n} as const;\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUTPUT, await genuiMobileRuntimeModule());
  console.log(`wrote ${OUTPUT}`);
}
