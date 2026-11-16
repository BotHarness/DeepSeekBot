import ts from 'typescript-legacy';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export function cliDispatchInventory(root) {
  const required = new Set([
    'help',
    'bots',
    'capabilities',
    'voice-local-kit',
    'ssh-tunnel',
    'create',
  ]);
  const dir = join(root, 'packages/core/src/bots');
  for (const file of readdirSync(dir).filter(
    (x) => (x.startsWith('cli-') && x.endsWith('.ts')) || x === 'bot-create-cli.ts',
  )) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(join(dir, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function walk(n) {
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text.endsWith('COMMANDS') &&
        !n.name.text.endsWith('SUBCOMMANDS')
      ) {
        function visit(a) {
          if (ts.isArrayLiteralExpression(a)) {
            for (const e of a.elements) {
              if (ts.isStringLiteral(e)) required.add(e.text);
              else if (ts.isObjectLiteralExpression(e))
                for (const p of e.properties)
                  if (
                    ts.isPropertyAssignment(p) &&
                    p.name.getText(sf) === 'command' &&
                    ts.isStringLiteral(p.initializer)
                  )
                    required.add(p.initializer.text);
            }
          } else ts.forEachChild(a, visit);
        }
        if (n.initializer) visit(n.initializer);
      }
      if (
        file === 'bot-create-cli.ts' &&
        ts.isBinaryExpression(n) &&
        n.left.getText(sf) === 'command' &&
        ts.isStringLiteral(n.right)
      )
        required.add(n.right.text);
      ts.forEachChild(n, walk);
    }
    walk(sf);
  }
  return [...required].sort();
}
