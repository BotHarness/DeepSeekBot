const LCS_LIMIT = 4_000_000;
const CONTEXT = 3;

type Op = { kind: ' ' | '-' | '+'; line: string };

function lines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

function edits(left: string[], right: string[]): Op[] {
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }
  const ops: Op[] = left.slice(0, start).map((line) => ({ kind: ' ', line }));
  const a = left.slice(start, leftEnd);
  const b = right.slice(start, rightEnd);
  if (a.length * b.length > LCS_LIMIT) {
    for (const line of a) ops.push({ kind: '-', line });
    for (const line of b) ops.push({ kind: '+', line });
  } else {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        table[i * width + j] =
          a[i] === b[j]
            ? table[(i + 1) * width + j + 1]! + 1
            : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        ops.push({ kind: ' ', line: a[i]! });
        i++;
        j++;
      } else if (
        i < a.length &&
        (j === b.length || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)
      ) {
        ops.push({ kind: '-', line: a[i]! });
        i++;
      } else {
        ops.push({ kind: '+', line: b[j]! });
        j++;
      }
    }
  }
  for (const line of left.slice(leftEnd)) ops.push({ kind: ' ', line });
  return ops;
}

function range(start: number, count: number): string {
  const first = count === 0 ? start : start + 1;
  return count === 1 ? String(first) : `${first},${count}`;
}

export function unifiedLineDiff(path: string, before: string | null, after: string): string {
  const ops = edits(lines(before ?? ''), lines(after));
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
