import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface LoadedReleaseComponent {
  name: string;
  version: string;
  directory: string;
  private: boolean;
}

const componentKey = Symbol.for('botharness.release-component');
const ACTIVE_FIBER_STATE = 2;
export const releaseComponentNames: Readonly<Record<string, string>> = Object.freeze({
  'botharness-core': '@botharness/core',
  'botharness-client': '@botharness/ui',
  'botharness-browser': '@botharness/browser',
  'botharness-computer': '@botharness/computer',
});

export function stampReleaseComponent(callback: object, moduleUrl: string): void {
  let snapshot: LoadedReleaseComponent | undefined;
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', moduleUrl), 'utf8'),
    );
    if (typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest)) {
      const value = manifest as Record<string, unknown>;
      if (typeof value['name'] === 'string' && typeof value['version'] === 'string') {
        snapshot = Object.freeze({
          name: value['name'],
          version: value['version'],
          private: value['private'] === true,
          directory: realpathSync(fileURLToPath(new URL('../', moduleUrl))),
        });
      }
    }
  } catch {
    snapshot = undefined;
  }
  Object.defineProperty(callback, componentKey, { value: snapshot });
}

export function loadedReleaseComponent(callback: object): LoadedReleaseComponent | undefined {
  return (callback as { [componentKey]?: LoadedReleaseComponent })[componentKey];
}

export function loadedReleaseComponents(
  runtimes: Iterable<{
    name?: string;
    callback: object;
    fibers: Iterable<{ state: number }>;
  }>,
): LoadedReleaseComponent[] {
  const loaded: LoadedReleaseComponent[] = [];
  for (const runtime of runtimes) {
    if (![...runtime.fibers].some((fiber) => fiber.state === ACTIVE_FIBER_STATE)) continue;
    const component = loadedReleaseComponent(runtime.callback);
    const expected = runtime.name === undefined ? undefined : releaseComponentNames[runtime.name];
    if (component !== undefined) loaded.push(component);
    else if (expected !== undefined)
      loaded.push({ name: expected, version: 'unknown', directory: '', private: true });
  }
  return loaded;
}
