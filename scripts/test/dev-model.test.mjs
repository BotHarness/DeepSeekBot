import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertInstalledGoModel,
  axModelEnvironment,
  axModelPatch,
  axRuntimeWorkspace,
  goSessionQualified,
  DEFAULT_GO_MODEL,
  GO_RUNTIME_PATCH,
  GO_SESSION_PATCH,
  resolveAxModel,
  saveAxModel,
} from '../dev-model.mjs';

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'botharness-ax-model-'));
  roots.push(root);
  return { root, path: join(root, 'private', 'ax-model.json') };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('AX native OpenCode Go reuse', () => {
  it('qualifies the independent CLI without replacing other workspace decisions', () => {
    const { root } = fixture();
    const runtime = join(root, 'isolated CLI with spaces');
    const workspace = parse(
      axRuntimeWorkspace(
        'packages: [.]\nallowBuilds: {koffi: true}\npatchedDependencies: {other: other.patch}\n',
        runtime,
      ),
    );
    expect(workspace.allowBuilds).toEqual({ koffi: true });
    expect(workspace.patchedDependencies.other).toBe('other.patch');
    expect(workspace.patchedDependencies['@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2']).toBe(
      GO_RUNTIME_PATCH,
    );
    const staged = join(runtime, GO_RUNTIME_PATCH);
    expect(readFileSync(staged)).toEqual(readFileSync(GO_SESSION_PATCH));
    writeFileSync(staged, 'stale patch');
    axRuntimeWorkspace('packages: [.]\n', runtime);
    expect(readFileSync(staged)).toEqual(readFileSync(GO_SESSION_PATCH));
  });
  it('keys the staged Go patch by the installed DSH and accepts rc.1 only for product artifacts', () => {
    const { root } = fixture();
    const runtime = join(root, 'packaged CLI');
    const workspace = parse(axRuntimeWorkspace('packages: [.]\n', runtime, '0.2.0-rc.1'));
    expect(workspace.patchedDependencies).toEqual({
      '@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.1': GO_RUNTIME_PATCH,
    });
    expect(readFileSync(join(runtime, GO_RUNTIME_PATCH))).toEqual(readFileSync(GO_SESSION_PATCH));
    expect(goSessionQualified('0.2.1-rc.2', false)).toBe(true);
    expect(goSessionQualified('0.2.1-rc.2', true)).toBe(true);
    expect(goSessionQualified('0.2.0-rc.1', true)).toBe(true);
    expect(goSessionQualified('0.2.0-rc.1', false)).toBe(false);
    expect(goSessionQualified('0.2.1', true)).toBe(false);
  });
  it('requires explicit setup, then shares a protected key with successive launches', () => {
    const { path } = fixture();
    expect(
      resolveAxModel({ path, environment: { OPENCODE_GO_API_KEY: 'test-env-key' } }),
    ).toBeUndefined();
    expect(saveAxModel('test-stored-key', DEFAULT_GO_MODEL, path)).toEqual({
      provider: 'opencode-go',
      model: DEFAULT_GO_MODEL,
      source: path,
    });
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
    }
    for (let i = 0; i < 2; i++) {
      const selection = resolveAxModel({ path, environment: {} });
      expect(axModelEnvironment(selection)).toEqual({ OPENCODE_GO_API_KEY: 'test-stored-key' });
      expect(selection.model).toBe(DEFAULT_GO_MODEL);
    }
    expect(
      resolveAxModel({ path, environment: { OPENCODE_GO_API_KEY: 'test-override' } }).apiKey,
    ).toBe('test-override');
    expect(readFileSync(path, 'utf8')).toContain('test-stored-key');
    expect(() => saveAxModel('replacement', DEFAULT_GO_MODEL, path)).toThrow();
  });
  it('rejects exposed storage and links without exposing key values', () => {
    if (process.platform === 'win32') return;
    const { root, path } = fixture();
    saveAxModel('private-test-key', DEFAULT_GO_MODEL, path);
    chmodSync(path, 0o644);
    expect(() => resolveAxModel({ path })).toThrow('must not be accessible');
    chmodSync(path, 0o600);
    const linked = join(dirname(path), 'linked.json');
    symlinkSync(path, linked);
    expect(() => resolveAxModel({ path: linked })).toThrow('regular private');
    chmodSync(dirname(path), 0o755);
    expect(() => resolveAxModel({ path })).toThrow('must not be accessible');
    const openDir = join(root, 'open');
    mkdirSync(openDir, { mode: 0o755 });
    expect(() => saveAxModel('test', DEFAULT_GO_MODEL, join(openDir, 'model.json'))).toThrow();
  });
  it('rejects empty or multiline credentials before creating a file', () => {
    const { path } = fixture();
    for (const key of ['', 'one\ntwo'])
      expect(() => saveAxModel(key, DEFAULT_GO_MODEL, path)).toThrow();
    expect(existsSync(path)).toBe(false);
  });
  it('redacts malformed private JSON instead of propagating parser credential excerpts', () => {
    const { path } = fixture();
    saveAxModel('private-test-key', DEFAULT_GO_MODEL, path);
    writeFileSync(path, '{"apiKey": private-test-key}');
    expect(() => resolveAxModel({ path })).toThrow('not valid JSON');
    try {
      resolveAxModel({ path });
    } catch (error) {
      expect(error.message).not.toContain('private-test-key');
    }
  });
  it('adds a final native Patch and retains unrelated provider settings and expressions', () => {
    const source = `- id: native-group
  name: group
  config:
    - id: llm-pi-ai
      name: '@deepseek-ai/dsh-llm-pi-ai'
      config:
        providers:
          other:
            apiKeyEnv: OTHER_KEY
            baseURL: https://example.invalid
            headers:
              x-example: !!js 'process.env.TEST_HEADER'
          opencode-go:
            timeoutMs: 12345
    - id: agent-default-model
      name: '@deepseek-ai/dsh-agent-default-model'
      config: { provider: other, model: old, reasoningEffort: old-effort }
    - id: unrelated
      config: !!js 'throw new Error("must not execute")'
`;
    const patch = axModelPatch(source);
    const rows = parse(patch, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }],
    });
    expect(rows[0].config.providers.other).toEqual({
      apiKeyEnv: 'OTHER_KEY',
      baseURL: 'https://example.invalid',
      headers: { 'x-example': 'process.env.TEST_HEADER' },
    });
    expect(rows[0].config.providers['opencode-go']).toEqual({
      timeoutMs: 12345,
      apiKeyEnv: 'OPENCODE_GO_API_KEY',
    });
    expect(rows[1].config).toEqual({ provider: 'opencode-go', model: DEFAULT_GO_MODEL });
    expect(patch).toContain('!!js');
    expect(patch).not.toContain('must not execute');
    expect(source).toContain('model: old');
    expect(() => axModelPatch(source + '\n- id: llm-pi-ai\n')).toThrow('one enabled');
    expect(() =>
      axModelPatch(source.replace("name: '@deepseek-ai/dsh-llm-pi-ai'", 'name: third-party')),
    ).toThrow('built-in');
    expect(() =>
      axModelPatch(source.replace('providers:\n', 'providers: !!js "process.env.PROVIDERS"\n')),
    ).toThrow();
  });
  it('verifies the selected model against the pinned native catalog without calling a provider', async () => {
    const runtime = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    await expect(assertInstalledGoModel(runtime, DEFAULT_GO_MODEL)).resolves.toBeUndefined();
    await expect(assertInstalledGoModel(runtime, 'model-does-not-exist')).rejects.toThrow('absent');
  });
});
