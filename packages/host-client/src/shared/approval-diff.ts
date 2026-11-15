export type ApprovalDiffLine = { kind: 'context' | 'add' | 'remove'; text: string };

export interface ApprovalFileChange {
  path: string;
  lines: ApprovalDiffLine[];
  added: number;
  removed: number;
}

const LCS_LIMIT = 250_000;

function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function diffLines(before: string, after: string): ApprovalDiffLine[] {
  const left = splitLines(before);
  const right = splitLines(after);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd--;
    rightEnd--;
  }
  const head = left.slice(0, start).map((text) => ({ kind: 'context' as const, text }));
  const tail = left.slice(leftEnd).map((text) => ({ kind: 'context' as const, text }));
  const a = left.slice(start, leftEnd);
  const b = right.slice(start, rightEnd);
  const middle: ApprovalDiffLine[] = [];
  if (a.length * b.length > LCS_LIMIT) {
    for (const text of a) middle.push({ kind: 'remove', text });
    for (const text of b) middle.push({ kind: 'add', text });
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
        middle.push({ kind: 'context', text: a[i]! });
        i++;
        j++;
      } else if (
        i < a.length &&
        (j === b.length || table[(i + 1) * width + j]! >= table[i * width + j + 1]!)
      ) {
        middle.push({ kind: 'remove', text: a[i]! });
        i++;
      } else {
        middle.push({ kind: 'add', text: b[j]! });
        j++;
      }
    }
  }
  return [...head, ...middle, ...tail];
}

function change(path: string, lines: ApprovalDiffLine[]): ApprovalFileChange {
  return {
    path,
    lines,
    added: lines.filter((line) => line.kind === 'add').length,
    removed: lines.filter((line) => line.kind === 'remove').length,
  };
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function parseArgs(input: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function approvalShellCommand(
  toolName: string,
  input: string,
): { command: string; description?: string } | undefined {
  if (toolName !== 'bash') return undefined;
  const args = parseArgs(input);
  const command = text(args?.['command']);
  if (command === undefined || command.trim() === '') return undefined;
  const description = text(args?.['description'])?.trim();
  return description ? { command, description } : { command };
}

export function approvalFileChange(
  toolName: string,
  input: string,
): ApprovalFileChange | undefined {
  const args = parseArgs(input);
  if (args === undefined) return undefined;
  if (toolName === 'write') {
    const path = text(args['file_path']);
    const content = text(args['content']);
    return path === undefined || content === undefined
      ? undefined
      : change(path, diffLines('', content));
  }
  if (toolName === 'edit') {
    const path = text(args['file_path']);
    const before = text(args['old_string']);
    const after = text(args['new_string']);
    return path === undefined || before === undefined || after === undefined
      ? undefined
      : change(path, diffLines(before, after));
  }
  if (toolName === 'str_replace_editor') {
    const path = text(args['path']);
    if (path === undefined) return undefined;
    const command = args['command'];
    if (command === 'create') {
      const content = text(args['file_text']);
      return content === undefined ? undefined : change(path, diffLines('', content));
    }
    if (command === 'str_replace') {
      const before = text(args['old_str']);
      return before === undefined
        ? undefined
        : change(path, diffLines(before, text(args['new_str']) ?? ''));
    }
    if (command === 'insert') {
      const added = text(args['new_str']);
      return added === undefined ? undefined : change(path, diffLines('', added));
    }
  }
  return undefined;
}

export interface ApprovalSummary {
  description?: string;
  command?: string;
  file?: { path: string; added: number; removed: number };
}

export function approvalSummary(toolName: string, input: string): ApprovalSummary {
  const shell = approvalShellCommand(toolName, input);
  if (shell !== undefined) {
    const line = shell.command.trim().split('\n')[0] ?? '';
    return {
      ...(shell.description === undefined ? {} : { description: shell.description }),
      command: line,
    };
  }
  const file = approvalFileChange(toolName, input);
  const description = text(parseArgs(input)?.['description'])?.trim();
  return {
    ...(description ? { description } : {}),
    ...(file === undefined
      ? {}
      : { file: { path: file.path, added: file.added, removed: file.removed } }),
  };
}
