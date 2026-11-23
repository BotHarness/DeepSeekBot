import { diffLines } from '@botharness/host-client/shared/approval-diff';

const CONTEXT = 3;

type Op = { kind: ' ' | '-' | '+'; line: string };

const MARK = { context: ' ', remove: '-', add: '+' } as const;
const NO_FINAL_NEWLINE = '\u0000';

const close = (text: string) =>
  text === '' || text.endsWith('\n') ? text : text + NO_FINAL_NEWLINE;

function edits(before: string, after: string): Op[] {
  return diffLines(close(before), close(after)).map((line) => ({
    kind: MARK[line.kind],
    line: line.text.endsWith(NO_FINAL_NEWLINE) ? line.text.slice(0, -1) : line.text + '\n',
  }));
}

function range(start: number, count: number): string {
  const first = count === 0 ? start : start + 1;
  return count === 1 ? String(first) : `${first},${count}`;
}

export function unifiedLineDiff(path: string, before: string | null, after: string): string {
  const ops = edits(before ?? '', after);
  const changed = ops.flatMap((op, index) => (op.kind === ' ' ? [] : [index]));
  if (changed.length === 0) return '';
  const out = [before === null ? '--- /dev/null\n' : `--- a/${path}\n`, `+++ b/${path}\n`];
  let group = 0;
  while (group < changed.length) {
    let last = group;
    while (last + 1 < changed.length && changed[last + 1]! - changed[last]! <= CONTEXT * 2 + 1)
      last++;
    const from = Math.max(0, changed[group]! - CONTEXT);
    const to = Math.min(ops.length, changed[last]! + CONTEXT + 1);
    let oldBefore = 0;
    let newBefore = 0;
    for (const op of ops.slice(0, from)) {
      if (op.kind !== '+') oldBefore++;
      if (op.kind !== '-') newBefore++;
    }
    const hunk = ops.slice(from, to);
    const oldCount = hunk.filter((op) => op.kind !== '+').length;
    const newCount = hunk.filter((op) => op.kind !== '-').length;
    out.push(`@@ -${range(oldBefore, oldCount)} +${range(newBefore, newCount)} @@\n`);
    for (const op of hunk)
      out.push(
        op.kind + op.line + (op.line.endsWith('\n') ? '' : '\n\\ No newline at end of file\n'),
      );
    group = last + 1;
  }
  return out.join('');
}
