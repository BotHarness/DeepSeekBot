import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { Document, isMap, isSeq, parseDocument } from 'yaml';

const version = '0.2.1-rc.2';
const root = process.cwd();
const taskRoot = resolve('.humanlayer/tasks/1220');
const withinTask = (input) => {
  assert.ok(input, 'explicit task-local path required');
  const path = resolve(input);
  const rel = relative(taskRoot, path);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), 'path must be inside task 1220');
  return path;
};
const [command, first, second, third] = process.argv.slice(2);
if (command === 'prepare') {
  const candidate = withinTask(first);
  assert.equal(existsSync(candidate), false, 'candidate must be fresh');
  mkdirSync(candidate, { recursive: true });
  writeFileSync(
    join(candidate, 'package.json'),
    JSON.stringify(
      {
        name: 'botharness-native-question-rc2-qa',
        private: true,
        type: 'module',
        packageManager: 'pnpm@12.4.2',
        devDependencies: { '@deepseek-ai/dsh': version },
      },
      null,
      2,
    ) + '\n',
  );
  const policy = parseDocument(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'));
  assert.equal(policy.errors.length, 0);
  const patches = policy.get('patchedDependencies');
  assert.ok(isMap(patches));
  const qualifiedPatches = [];
  const patchKeys = patches.items.map((pair) => pair.key.value);
  for (const key of patchKeys) {
    if (!key.startsWith('@deepseek-ai/dsh')) continue;
    assert.ok(key.endsWith('@0.2.1-rc.2'), 'review new native patch targets before copying');
    const target = key.replace(/@0\.2\.1-rc\.2$/u, '@' + version);
    const file = patches.get(key);
    assert.ok(file.startsWith('patches/'), 'patch must come from the repository patch directory');
    patches.delete(key);
    patches.set(target, file);
    qualifiedPatches.push({
      target,
      file,
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    });
  }
  cpSync(join(root, 'patches'), join(candidate, 'patches'), { recursive: true });
  writeFileSync(join(candidate, 'pnpm-workspace.yaml'), String(policy));
  for (const name of ['core', 'client', 'computer', 'browser', 'deepseekbot']) {
    const from = join(root, 'packages', name);
    const to = join(candidate, 'packages', name);
    mkdirSync(to, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'));
    for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const key of Object.keys(manifest[group] ?? {})) {
        if (key.startsWith('@deepseek-ai/dsh')) manifest[group][key] = version;
      }
    }
    for (const file of manifest.files ?? []) {
      const source = join(from, file);
      assert.ok(existsSync(source), 'build the application before preparing: ' + name + '/' + file);
      cpSync(source, join(to, file), { recursive: true });
    }
    writeFileSync(join(to, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  }
  writeFileSync(
    join(candidate, 'qualification.json'),
    JSON.stringify(
      {
        issue: 1220,
        nativeVersion: version,
        applicationBaseline: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        upstream: '687f282e8625c6b8d11ff58211a90524be2e4317',
        applicationRuntime:
          'copied existing build artifacts; all candidate native dependency and peer pins explicitly RC2',
        patches: qualifiedPatches,
        purpose:
          'isolated qualification only; patch applicability and runtime behavior must be verified',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Prepared an independent RC2 candidate; install it before launch.');
} else if (command === 'dump') {
  const candidate = withinTask(first);
  const home = withinTask(second);
  const output = withinTask(third);
  assert.equal(existsSync(home), false, 'native dump home must be fresh');
  assert.equal(existsSync(output), false, 'refuse to overwrite a native dump');
  const nativeRoot = join(candidate, 'node_modules', '@deepseek-ai', 'dsh');
  assert.equal(JSON.parse(readFileSync(join(nativeRoot, 'package.json'), 'utf8')).version, version);
  mkdirSync(home, { recursive: true });
  const result = execFileSync(
    process.execPath,
    [
      join(nativeRoot, 'lib', 'bin.js'),
      '--profile',
      'web-dev',
      '--from-default-profile',
      'web',
      '--dump-config',
    ],
    {
      cwd: candidate,
      env: { ...process.env, DSH_HOME: home },
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  writeFileSync(output, result);
  console.log('Saved the candidate native config privately with an explicit fresh DSH_HOME.');
} else if (command === 'configure') {
  const dump = withinTask(first);
  const home = withinTask(second);
  const destination = join(home, 'profiles', 'web-dev', 'cordis.patch.yml');
  if (existsSync(destination)) {
    const existing = parseDocument(readFileSync(destination, 'utf8'));
    assert.equal(existing.errors.length, 0);
    assert.ok(
      isSeq(existing.contents) && existing.contents.items.length === 0,
      'refuse to overwrite a nonempty Profile patch',
    );
  }
  const source = parseDocument(readFileSync(dump, 'utf8'), {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }],
  });
  assert.equal(source.errors.length, 0);
  assert.ok(isSeq(source.contents));
  const row = source.contents.items.find(
    (entry) => isMap(entry) && entry.get('id') === 'preset-standard',
  );
  assert.ok(row, 'selected standard preset must exist');
  const config = row.get('config').clone();
  const plugins = config.get('plugins');
  assert.ok(isSeq(plugins));
  const ask = plugins.items.find((entry) => isMap(entry) && entry.get('id') === 'tool-ask-user');
  assert.equal(ask?.get('name'), '@deepseek-ai/dsh-tool-ask-user');
  const patch = new Document([]);
  ask.set('config', patch.createNode({ mode: 'timed', timeout: 2 }));
  patch.contents.add(patch.createNode({ id: 'preset-standard' }));
  patch.contents.items[0].set('config', config);
  mkdirSync(join(home, 'profiles', 'web-dev'), { recursive: true });
  writeFileSync(destination, String(patch));
  console.log('Configured only the isolated standard preset for two-second timed questions.');
} else {
  throw Error(
    'Usage: node scripts/experiment-timed-question-fixture.mjs prepare <fresh-candidate> | dump <installed-candidate> <fresh-home> <private-output> | configure <native-config-dump> <home>',
  );
}
