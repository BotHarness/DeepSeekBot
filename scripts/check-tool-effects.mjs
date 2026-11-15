import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(join(root, 'packages/core/src/workspaces/tool-effects.ts'), 'utf8');
const inventory =
  source.split('export const FIRST_PARTY_TOOL_EFFECTS = {')[1]?.split('} satisfies')[0] ?? '';
const declared = new Set([...inventory.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]));
const required = new Set();
const unresolved = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (path.endsWith('.ts')) {
      const text = readFileSync(path, 'utf8');
      const calls = [...text.matchAll(/defineTool\s*\(/g)];
      const literal = [...text.matchAll(/defineTool\s*\(\s*\{\s*name:\s*['"]([^'"]+)['"]/g)];
      for (const match of literal) required.add(match[1]);
      let dynamic = 0;
      if (
        relative(root, path).replaceAll('\\', '/') ===
        'packages/core/src/runtime/subagent-model-tools.ts'
      ) {
        const table = text.match(/const BOT_SUBAGENT_TOOL_NAMES = \{([\s\S]*?)\}/)?.[1] ?? '';
        for (const match of table.matchAll(/: '([^']+)'/g)) required.add(match[1]);
        dynamic = [
          ...text.matchAll(/defineTool\(\{\s*(?:name,|name: BOT_SUBAGENT_TOOL_NAMES\.list,)/g),
        ].length;
      }
      if (calls.length !== literal.length + dynamic) unresolved.push(relative(root, path));
    }
  }
}
for (const entry of readdirSync(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    scan(join(root, 'packages', entry.name, 'src'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
for (const kind of ['browser', 'computer']) {
  const text = readFileSync(join(root, 'packages', kind, 'src/tool/catalog.ts'), 'utf8');
  for (const match of text.matchAll(/raw: '([^']+)'/g)) required.add(kind + '_' + match[1]);
}
const missing = [...required].filter((name) => !declared.has(name));
if (missing.length || unresolved.length) {
  if (unresolved.length)
    process.stderr.write(
      'tool-effects: unresolved dynamic tool factories: ' + unresolved.join(', ') + '\n',
    );
  process.stderr.write('tool-effects: missing declarations: ' + missing.join(', ') + '\n');
  process.exitCode = 1;
} else process.stdout.write('Tool effects declared for ' + required.size + ' first-party tools.\n');
