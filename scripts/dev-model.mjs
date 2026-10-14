import {
  existsSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { Document, isMap, isSeq, parseDocument } from 'yaml';

export const AX_MODEL_PATH = join(homedir(), '.config', 'botharness', 'ax-model.json');
export const GO_KEY_REF = 'OPENCODE_GO_API_KEY';
export const DEFAULT_GO_MODEL = 'deepseek-v4.1-flash';
export const GO_SESSION_PATCH = resolve(
  import.meta.dirname,
  '../patches/@deepseek-ai__dsh-llm-pi-ai@0.2.0-rc.2.patch',
);

export const GO_RUNTIME_PATCH = 'patches/dsh-llm-pi-ai-0.2.0-rc.2.patch';

export const GO_SESSION_DSH = '0.2.0-rc.2';
export const GO_SESSION_PACKAGED_DSH = '0.2.0-rc.1';

export function goSessionQualified(version, packaged) {
  return version === GO_SESSION_DSH || (packaged && version === GO_SESSION_PACKAGED_DSH);
}

export function axRuntimeWorkspace(source, runtime, version = GO_SESSION_DSH) {
  const document = parseDocument(source);
  if (document.errors.length || !isMap(document.contents))
    throw new Error('Invalid AX runtime workspace');
  const stagedPatch = join(runtime, GO_RUNTIME_PATCH);
  mkdirSync(dirname(stagedPatch), { recursive: true });
  copyFileSync(GO_SESSION_PATCH, stagedPatch);
  document.setIn(
    ['patchedDependencies', `@deepseek-ai/dsh-llm-pi-ai@${version}`],
    GO_RUNTIME_PATCH,
  );
  return String(document);
}

function protectedPath(path, directory = false) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile()))
    throw new Error('AX model storage must be a regular private file/directory');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
    throw new Error('AX model storage must not be accessible by group or others');
}

function checkedSelection(selection) {
  if (
    selection?.provider !== 'opencode-go' ||
    typeof selection.model !== 'string' ||
    !/^[a-zA-Z0-9._-]+$/u.test(selection.model) ||
    typeof selection.apiKey !== 'string' ||
    !/^[\x21-\x7e]+$/u.test(selection.apiKey)
  )
    throw new Error('Invalid AX OpenCode Go selection or API key');
  return selection;
}

export function saveAxModel(apiKey, model = DEFAULT_GO_MODEL, path = AX_MODEL_PATH) {
  const selection = checkedSelection({ provider: 'opencode-go', model, apiKey: apiKey.trim() });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  protectedPath(dirname(path), true);
  writeFileSync(path, `${JSON.stringify(selection)}\n`, { flag: 'wx', mode: 0o600 });
  return { provider: selection.provider, model: selection.model, source: path };
}

export function resolveAxModel({ path = AX_MODEL_PATH, environment = process.env } = {}) {
  if (!existsSync(path)) return undefined;
  protectedPath(dirname(path), true);
  protectedPath(path);
  let stored;
  try {
    stored = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('AX model storage is not valid JSON; inspect it locally');
  }
  const selection = checkedSelection(stored);
  const override = environment[GO_KEY_REF]?.trim();
  return {
    ...checkedSelection({ ...selection, apiKey: override || selection.apiKey }),
    source: override ? `$${GO_KEY_REF}` : path,
  };
}

export function axModelEnvironment(selection) {
  return selection ? { [GO_KEY_REF]: selection.apiKey } : {};
}

export async function assertInstalledGoModel(runtime, model) {
  const cli = createRequire(
    realpathSync(join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js')),
  );
  const base = createRequire(cli.resolve('@deepseek-ai/dsh-base'));
  const adapter = createRequire(base.resolve('@deepseek-ai/dsh-llm-pi-ai'));
  const packageRoot = adapter.resolve
    .paths('@earendil-works/pi-ai')
    .map((path) => join(path, '@earendil-works/pi-ai'))
    .find((path) => existsSync(join(path, 'package.json')));
  if (!packageRoot) throw new Error('Pinned native OpenCode Go catalog is unavailable');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const catalogEntry = manifest.exports['./providers/*'].import.replace('*', 'all');
  const catalog = await import(pathToFileURL(join(packageRoot, catalogEntry)).href);
  if (!catalog.getBuiltinModels('opencode-go').some((entry) => entry.id === model))
    throw new Error('Selected model is absent from the pinned native OpenCode Go catalog');
}

export function axModelPatch(source, model = DEFAULT_GO_MODEL) {
  const parsed = parseDocument(source, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }],
  });
  if (parsed.errors.length || !isSeq(parsed.contents))
    throw new Error('Cannot read composed Profile for AX model selection');
  const found = new Map();
  function visit(rows) {
    for (const row of rows.items) {
      if (!isMap(row)) continue;
      const id = row.get('id');
      if (id === 'llm-pi-ai' || id === 'agent-default-model') {
        if (found.has(id) || (row.has('disabled') && row.get('disabled') !== false))
          throw new Error('AX model selection requires one enabled native model component');
        found.set(id, row);
      }
      if (isSeq(row.get('config'))) visit(row.get('config'));
    }
  }
  visit(parsed.contents);
  if (found.size !== 2) throw new Error('AX model selection requires the native model components');
  const adapter = found.get('llm-pi-ai');
  if (adapter.get('name') !== '@deepseek-ai/dsh-llm-pi-ai')
    throw new Error('AX model selection requires the built-in pi-ai adapter');
  if (found.get('agent-default-model').get('name') !== '@deepseek-ai/dsh-agent-default-model')
    throw new Error('AX model selection requires the built-in default model service');
  const output = new Document([]);
  const original = adapter.get('config');
  if (original !== undefined && !isMap(original))
    throw new Error('AX model adapter config must be a mapping');
  const config = original?.clone() ?? output.createNode({});
  if (!config.has('providers')) config.set('providers', output.createNode({}));
  const providers = config.get('providers');
  if (!isMap(providers) || providers.tag)
    throw new Error('AX model providers must be a static mapping');
  const existingGo = providers.get('opencode-go');
  if (existingGo !== undefined && (!isMap(existingGo) || existingGo.tag))
    throw new Error('AX OpenCode Go config must be a static mapping');
  const go = existingGo?.clone() ?? output.createNode({});
  go.set('apiKeyEnv', GO_KEY_REF);
  providers.set('opencode-go', go);
  const row = output.createNode({ id: 'llm-pi-ai' });
  row.set('config', config);
  output.contents.add(row);
  output.contents.add(
    output.createNode({
      id: 'agent-default-model',
      config: { provider: 'opencode-go', model },
    }),
  );
  return String(output);
}

async function hiddenKey() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Use a local interactive terminal, or setup --from-env; no keys in arguments');
  const output = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  output.isTTY = true;
  const input = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write('OpenCode Go API key (hidden): ');
  try {
    return await input.question('');
  } finally {
    input.close();
    process.stdout.write('\n');
  }
}

async function main() {
  const [mode = 'check', ...args] = process.argv.slice(2);
  if (mode === 'check' && args.length === 0) {
    const selection = resolveAxModel();
    console.log(
      selection
        ? `AX default: ${selection.provider}/${selection.model}; key source: ${selection.source}; live reply not checked.`
        : 'AX OpenCode Go is not configured. Run node scripts/dev-model.mjs setup in a local terminal.',
    );
    return;
  }
  if (mode !== 'setup')
    throw new Error('usage: dev-model.mjs check | setup [--model <id>] [--from-env]');
  let model = DEFAULT_GO_MODEL;
  let fromEnv = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--from-env') fromEnv = true;
    else if (args[index] === '--model' && args[index + 1]) model = args[++index];
    else throw new Error('usage: dev-model.mjs setup [--model <id>] [--from-env]');
  }
  if (existsSync(AX_MODEL_PATH))
    throw new Error('AX selection already exists; inspect it locally before replacing it');
  await assertInstalledGoModel(resolve(dirname(fileURLToPath(import.meta.url)), '..'), model);
  const key = fromEnv ? process.env[GO_KEY_REF] : await hiddenKey();
  if (!key?.trim()) throw new Error('OpenCode Go API key is empty');
  const saved = saveAxModel(key, model);
  console.log(
    `AX default saved: ${saved.provider}/${saved.model}; key is private and was not printed. Verify a real DM reply in the next isolated Profile.`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch(() => {
    console.error(
      'AX model setup/check failed. Check local storage permissions, existing selection and installed model; no credential printed.',
    );
    process.exitCode = 1;
  });
