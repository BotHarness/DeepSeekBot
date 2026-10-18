import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { ReleaseRuntime } from '../src/release/compatibility.js';
const require = createRequire(
  realpathSync(new URL('../../../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)),
);
const native = await import(require.resolve('@deepseek-ai/dsh-app-boot'));
export const testReleaseRuntime = async (): Promise<ReleaseRuntime> => ({
  version: '0.2.1-rc.2',
  evaluate: native.evaluatePluginCompatibility,
});
export function releaseManifestResponse(input: string | URL | Request): Response | undefined {
  const path = decodeURIComponent(new URL(String(input)).pathname);
  const match =
    /^\/(deepseekbot|@botharness\/(?:core|ui|browser|computer))\/(\d+\.\d+\.\d+)$/u.exec(path);
  if (!match) return undefined;
  const [, name, version] = match;
  return Response.json({
    name,
    version,
    engines: { dsh: '>=0.2.0-rc.2 <0.3.0-0' },
    ...(name === 'deepseekbot'
      ? {
          dependencies: Object.fromEntries(
            ['core', 'ui', 'browser', 'computer'].map((component) => [
              `@botharness/${component}`,
              version,
            ]),
          ),
        }
      : {}),
  });
}
