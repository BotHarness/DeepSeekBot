import ts from 'typescript-legacy';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cliDispatchInventory } from './cli-dispatch-inventory.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(
  new URL('../packages/core/src/bots/cli-effects.ts', import.meta.url),
  'utf8',
);
const declared = new Set();
const ast = ts.createSourceFile('cli-effects.ts', source, ts.ScriptTarget.Latest, true);
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'CLI_EFFECTS') {
    const value =
      node.initializer && ts.isSatisfiesExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
    if (!value || !ts.isObjectLiteralExpression(value))
      throw new Error('CLI_EFFECTS must remain an explicit declaration table');
    for (const entry of value.properties) {
      if (
        !ts.isPropertyAssignment(entry) ||
        !(ts.isIdentifier(entry.name) || ts.isStringLiteral(entry.name))
      )
        throw new Error('Unresolved CLI effect declaration');
      declared.add(entry.name.text);
    }
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const missing = cliDispatchInventory(root).filter((name) => !declared.has(name));
if (missing.length) {
  process.stderr.write('CLI effects missing: ' + missing.join(', ') + '\n');
  process.exitCode = 1;
} else
  process.stdout.write(
    'CLI effects cover ' + declared.size + ' registered commands and dispatch branches.\n',
  );
